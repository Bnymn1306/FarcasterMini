---
name: CDP / x402 facilitator key format
description: Why x402 payment verification fails with "Invalid key format" and how the CDP secret must be normalized.
---

# CDP_API_KEY_SECRET format for the x402 facilitator

The x402 facilitator (`@coinbase/x402` → `@coinbase/cdp-sdk` `generateJwt`) authenticates to Coinbase using `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET`. `generateJwt` accepts the secret in **only two** forms:
- a **PKCS#8** PEM (`-----BEGIN PRIVATE KEY-----`), validated via jose `importPKCS8(..., "ES256")`, or
- a **base64 Ed25519** key that decodes to exactly 64 bytes.

Anything else throws `UserInputValidationError: Invalid key format - must be either PEM EC key or base64 Ed25519 key`. This surfaces to the UI as a generic "Payment verification failed" toast and a 402 — it is NOT a wallet/balance problem.

## The trap
Legacy CDP API keys are **SEC1** EC PEM (`-----BEGIN EC PRIVATE KEY-----`). The SDK's `importPKCS8` rejects SEC1, so a legacy key fails even though it "looks like" a valid EC PEM. Replit Secrets also mangle multi-line PEMs, so the secret is commonly stored **base64-encoded**.

## Normalization (done in server/index.ts, before any imports)
1. If the value doesn't start with `-----BEGIN`, base64-decode it (only keep the decode if the result is a PEM).
2. If the result contains `-----BEGIN EC PRIVATE KEY-----`, convert SEC1→PKCS#8 with `crypto.createPrivateKey(pem).export({ type: 'pkcs8', format: 'pem' })`.

**Why:** this fixes ALL x402 features at once (boost/endorse/AI-signal/premium-launch share the one facilitator). **How to apply:** if x402 verification ever fails again with "Invalid key format", check the secret's actual PEM header / byte length before assuming the conversion is wrong — a rotated key could be Ed25519 (pass as-is) or already PKCS#8. esbuild build is `--format=esm`, so top-level `await import('crypto')` in the entry file is safe.

## Second failure mode: "Failed to verify payment: Bad Request"
After the key format was fixed, verify still failed. The `x402` lib's `useFacilitator.verify` throws using only `res.statusText` and **discards the response body**, so the real reason is hidden. The CDP v2 facilitator is `https://api.cdp.coinbase.com/platform/v2/x402`.

Real cause (captured by replaying the POST to `/verify` with the CDP JWT and printing the body): `400 invalid_payload "missing EIP-712 domain parameters"`. The **CDP v2 facilitator requires `paymentRequirements.extra` = `{ name, version }`** (the USDC EIP-712 domain) on BOTH the 402 challenge `accepts[]` and the verify call. Our hand-rolled middleware omitted it (the official `x402-express` middleware adds it automatically from an asset registry).
- Base mainnet USDC (`0x8335…2913`): `{ name: "USD Coin", version: "2" }`
- Base Sepolia USDC (`0x036C…CF7e`): `{ name: "USDC", version: "2" }`

**Why:** the client signs `transferWithAuthorization` using this domain and the facilitator re-derives it; mismatch/absence = 400. **How to apply:** any hand-rolled x402 PaymentRequirements MUST include `extra`. Base mainnet on-chain USDC domain is name "USD Coin" / version "2" (verified via `name()`/`version()` calls; `eip712Domain()` reverts on this contract). Secret values are NOT readable from the code_execution sandbox (`viewEnvVars` returns booleans); to reproduce against real secrets, run a `tsx` script via bash (bash has env access).

## Third failure mode: x402 lib discards the facilitator's structured error body
Even after `extra` was correct, verify still threw "Failed to verify payment: Bad Request". Root cause: `x402/verify` `useFacilitator.verify` does `if (res.status !== 200) throw new Error('Failed to verify payment: ' + res.statusText)` and **throws away the response body**. But the CDP v2 facilitator returns **HTTP 400 WITH a meaningful JSON body** for invalid-but-well-formed payments: `{ isValid:false, invalidReason:"invalid_payload", invalidMessage:"contract call failed: ... execution reverted", payer }`. "execution reverted" here means the on-chain `transferWithAuthorization` simulation failed — almost always **the payer has no/insufficient USDC on Base** (a wallet's shown total $ value is portfolio-wide, NOT USDC-on-Base).

**Fix:** do NOT use `useFacilitator`'s verify/settle for the CDP v2 facilitator. Roll your own `fetch` to `${facilitator.url}/verify` (and `/settle`) with `facilitator.createAuthHeaders()`, then **parse the JSON body regardless of HTTP status** and return `{isValid,...}`. Translate `execution reverted` into a user-facing "make sure you have enough USDC on Base" message. **Why:** otherwise every legitimate "insufficient balance" rejection looks like a server bug ("Bad Request") to the user. **How to apply:** any custom x402 server middleware on CDP v2 must treat 400-with-body as data, not an exception.

## "execution reverted" is NOT always insufficient balance — diagnose on-chain, don't guess
A funded wallet (confirmed 50+ native USDC on Base, needs 0.01) still got `invalid_payload - execution reverted` on every attempt. So the revert is one of (in order ruled out): (1) insufficient balance — read `balanceOf(payer)` to confirm/deny; (2) **signature/domain mismatch** — recover with `ethers.verifyTypedData(domain, {TransferWithAuthorization:[...]}, msg, sig)` and compare to `authorization.from`; (3) **nonce already used** — `authorizationState(from, nonce)` (a *failed* attempt never consumes the nonce, so reuse only matters after a prior SUCCESS); (4) **expired** — `validBefore <= now`.

The Base mainnet USDC EIP-712 domain is provably `{name:"USD Coin", version:"2", chainId:8453, verifyingContract:0x8335…2913}` — verified by computing `ethers.TypedDataEncoder.hashDomain(domain)` and matching it byte-for-byte against the contract's on-chain `DOMAIN_SEPARATOR()`. So domain is never the cause on Base mainnet.

**Prime suspect when balance+domain are fine: expiry.** x402-fetch sets `validBefore = now + maxTimeoutSeconds`, using the value the server advertises in the 402 challenge `accepts[].maxTimeoutSeconds`. If that's tight (was **30s**), a slow wallet confirmation makes the authorization expire before it reaches the chain → revert. **Fix:** bump `maxTimeoutSeconds` (set to **300**) in BOTH the 402 challenge and the verify `paymentRequirements`. **Why:** 30s is needlessly tight; signing latency + facilitator round-trip can blow it. **How to apply:** when x402 reverts with a funded wallet, add a failure-path diagnostic (balanceOf + verifyTypedData + authorizationState + `transferWithAuthorization.staticCall` to capture the raw revert string) — it runs only on failure so it never slows the success path — and read the `🔎 x402 DIAGNOSTIC` log line for the exact cause.

## Real root cause on Base mainnet: non-canonical signature recovery byte (v=0/1)
After balance, domain, nonce, and expiry were ALL ruled out, the diagnostic showed the exact contradiction: `sigMatches:true` (our `ethers.verifyTypedData` recovers the exact `from`) **but** `revertReason:"FiatTokenV2: invalid signature"` on-chain. **This pattern = the signature's recovery byte `v` is 0/1 (yParity) instead of 27/28.** ethers/viem tolerate and normalize 0/1 internally (so off-chain recovery succeeds), but Circle's USDC uses OpenZeppelin `ECDSA`/`ecrecover`, which returns `address(0)` for `v` not in {27,28} → "invalid signature". Some wallets/x402 client paths emit the non-canonical form.

**Fix:** normalize the authorization signature **server-side before** passing the payload to `/verify` AND `/settle` (`canonicalizeAuthSignature` in `server/middleware/x402.ts`): for a 65-byte sig, if last byte is 0/1 add 27; also expand EIP-2098 compact 64-byte sigs (`r + yParityAndS`) to canonical 65-byte (`r + s + v`). Adding 27 preserves `(r,s)` and the signer — it just makes `ecrecover` succeed. Must mutate ONCE after decode so verify and settle see identical bytes. **Why:** this is the difference between off-chain recover-OK and on-chain reject; it's not a balance/domain/expiry issue and no amount of those fixes helps. **How to apply:** if `sigMatches:true` yet `revertReason` says invalid signature, it's the v byte — normalize it; if the payer `payerIsContract:true` (added to diagnostic via `eth_getCode`), it's instead an EIP-1271 smart-wallet sig that ECDSA normalization CANNOT fix (needs a 1271-aware settlement path).
