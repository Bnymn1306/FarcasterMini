# Release validation hold

The standalone bundle builds and the focused migration tests pass, but this is **not a release-ready migration**. A fresh-cache isolated install encountered the package firewall's critical-CVE blocks in legacy transitive dependencies (including eth-sig-util, arbundles, basic-ftp, and old crypto/build dependencies), followed by temporary extraction quota errors. Do not bypass that policy or present the preinstalled-workspace build as a clean-install pass. The legacy @0x/protocol-utils and rubic-sdk direct parents were already at their registry latest versions when checked; a newer Neynar SDK exists but has not been adopted or compatibility-tested. Resolve or remove the unused dependency chains and complete a real clean install before enabling the standalone deployment.

The pre-existing broad TypeScript check also fails; the separate type-check restoration work remains required. New migration-specific diagnostics were corrected, but that does not make the whole project type-clean.

# Vercel migration preparation

## Standalone API approval gate

The proposed standalone public API returns 503 before importing routes or database
modules unless production explicitly sets `VERCEL_BACKEND_CUTOVER_APPROVED=true`.
Do not approve until worker ownership, servicing of submitted orders, persistence
and rollback are proven. Production cannot bypass this gate with the preview
switch. Non-production requires `VERCEL_PREVIEW_ISOLATED=true`, only after
isolating its database, wallets and all credentials. Request-triggered persistent
rugpull monitoring is disabled on Vercel regardless of approval.

The dedicated `/api/admin/background` management route has its own production and
bearer-secret gates, allowing authenticated inspection/stop before public API
approval. Starting remains code-level audit-blocked. Generated Workflow SDK
endpoints remain owned by Nitro and are never rewritten to the SPA. Static
Farcaster metadata matches the canonical dynamic manifest's unchanged signed
`basedmem.xyz` association; no preview domain association is implied.

## Status and safety boundary

This is a **PREPARATION handoff**, not a completed cutover or feature-parity claim. No live migration has been performed. The current Replit deployment must not be deleted yet. Before changing ownership, separately prove database ownership and backups/restores, provision an independent Exa key, and complete the worker cutover in isolation from web traffic.

Automatic background execution remains deliberately audit-blocked. The workflow scaffold must not be interpreted as an enabled worker, and setting environment switches does not override its code-level activation blockers. The proposed background schema is review material only and must never be auto-applied.

Never use production keys in Vercel Preview deployments. Copy private secrets manually and privately into the Vercel project UI only. Never paste them into chat, issues, logs, GitHub, source files, or build arguments. Scope each value to Production or to a deliberately isolated test environment.

## AskBase provider behavior

- With server-only `EXA_API_KEY`, AskBase calls `https://api.exa.ai/answer` directly.
- On Replit without that key, it preserves the Replit Exa connector.
- On Vercel without `EXA_API_KEY`, it fails closed. It does not try the Replit connector and does not substitute an ungrounded answer.
- Empty answers, failed provider responses, and missing/invalid citation URLs remain errors. There is no research fallback.

## Environment inventory

Run `npm run audit:vercel-env` to rescan source references. It reads source code only: it does not open `.env` files or print secret values.

After an operator has privately entered environment variables in the target environment, run:

```sh
npm run audit:vercel-env -- --readiness
```

This zero-secret check only reports each required key name with `true` or `false`, plus `REQUIRED_ENV_PRESENT`; it never prints values. It is safe to run in the target's protected command environment, but do not wrap it in shell commands such as `env`, `set`, `printenv`, `echo $KEY`, or tracing modes that would expose values to logs. The command is an existence check, not proof that credentials, database ownership, network access, backups, or feature behavior are correct. It does not modify the database or deploy anything.

### Required for the active Vercel backend

| Name | Visibility | Purpose |
|---|---|---|
| `DATABASE_URL` | Server secret | User-owned Neon/Postgres application state. Required by the web backend and the worker handoff. |
| `EXA_API_KEY` | Server secret | Independent AskBase grounded research. Required to keep AskBase active on Vercel. |
| `BASE_RPC_URL` | Server configuration/secret if provider-authenticated | Reliable Base reads and all Base execution features. Some reads have a public-RPC default, but executors require this name. |
| `VITE_BASE_RPC_URL` | **Public build-time** | Browser wallet RPC. Anything prefixed `VITE_` is bundled into public client code and must contain no secret. |
| `FRACTION_UPLOAD_STORAGE` | Server configuration | Must equal `vercel-blob` for fraction uploads on Vercel. |
| `BLOB_READ_WRITE_TOKEN` | Server secret | Authorizes durable fraction-image uploads to Vercel Blob. |

Vercel supplies `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, and `VERCEL_PROJECT_PRODUCTION_URL`; do not manually treat these as secrets. `NODE_ENV` is runtime/build configuration. `PORT` is relevant to the long-running Replit/Node server, not normally configured for a Vercel function.

`VERCEL_PREVIEW_ISOLATED` and `VERCEL_BACKEND_CUTOVER_APPROVED` are application safety gates, not Vercel-supplied variables. A Preview backend is denied unless the former is exactly `true`, and it must only be used with isolated non-production state and credentials. Production is denied unless the latter is exactly `true`; do not set it during preparation. It is a final explicit operator approval after every cutover gate, not a way to bypass them.

### Required only when the corresponding active feature is enabled

| Feature | Server-only names |
|---|---|
| 0x swap/quote and executor flows | `OX_API_KEY` |
| Farcaster/Neynar notifications and lookups | `NEYNAR_API_KEY` |
| Portfolio data | `ZERION_API_KEY` |
| Jupiter | `JUPITER_API_KEY`, optionally `SOLANA_RPC_URL` |
| Solana escrow execution | `SOLANA_ESCROW_PRIVATE_KEY` (and use `SOLANA_RPC_URL` after the hard-coded endpoint gap is fixed) |
| Base limit orders, cancellations, rug protection, prediction-market execution | `DEPLOYER_PRIVATE_KEY`, `BASE_RPC_URL`; address overrides as applicable: `EXECUTOR_VAULT_ADDRESS`, `EXECUTOR_VAULT_V1_ADDRESS`, `EXECUTOR_VAULT_V2_ADDRESS`, `EXECUTOR_VAULT_V3_ADDRESS`, `FACTORY_CONTRACT_ADDRESS` |
| Ink execution | `DEPLOYER_PRIVATE_KEY`, `INK_RPC_URL`, `INK_EXECUTOR_VAULT_ADDRESS`, `INK_QUOTER_V2`, `INK_SWAP_ROUTER`, `INK_USDC_ADDRESS` |
| Soneium execution | `DEPLOYER_PRIVATE_KEY`, `SONEIUM_EXECUTOR_VAULT_ADDRESS` |
| x402 payments | `CDP_API_KEY_SECRET`, `X402_PAYMENT_WALLET_ADDRESS`, `X402_NETWORK`, and `BASE_RPC_URL` or `BASE_SEPOLIA_RPC_URL` according to network |
| X/Twitter integration | `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET` |

The inactive worker preparation references `BACKGROUND_EXECUTION_OWNER`, `BACKGROUND_WORKFLOW_ENABLED`, `BACKGROUND_ADMIN_SECRET`, and `BACKGROUND_DB_SESSION_LOCKS_CONFIRMED`. These are server-only. They are documented for audit visibility, **not** as instructions to enable execution: start is still code-blocked, and `BACKGROUND_DB_SESSION_LOCKS_CONFIRMED=true` is an operator attestation that must not be set until the actual `DATABASE_URL` connection has been proven session-preserving.

`PLATFORM_PRIVATE_KEY` is referenced only in commented code and is not currently active. Do not provision it without re-auditing the feature.

`SONEIUM_RPC_URL` is used by Hardhat deployment tooling, but the current Soneium server executor hard-codes its RPC URL; setting it in Vercel does not change runtime behavior. Make the executor consume that setting in a separate portability fix before relying on a private Soneium RPC.

Wallet signing keys are server-only and Production-scoped. `DEPLOYER_PRIVATE_KEY` has a broad blast radius across several EVM executors; use a least-funded dedicated signer and do not expose it to Preview. `SOLANA_ESCROW_PRIVATE_KEY` controls escrow funds and likewise must never be public or shared with previews. Contract/vault addresses are not secrets, but must still be environment-scoped to prevent production signing against a preview configuration.

### Replit-only compatibility names

`REPL_ID`, `REPLIT_DEPLOYMENT_URL`, `REPLIT_DEV_DOMAIN`, and `REPLIT_DOMAINS` select or construct existing Replit behavior. They are not migration secrets and should not be copied to Vercel. In particular, adding stale Replit markers must not be used to make AskBase work on Vercel.

### Database URL and ownership

The handoff contract is **only `DATABASE_URL`** for both the web backend and worker. It does not use `POSTGRES_URL`, `NEON_DATABASE_URL`, or Vercel integration aliases. A source audit that still reports `NEON_DATABASE_URL` means the worker correction has not landed and the handoff is incomplete; do not infer a priority rule between two URLs.

Do **not** copy a Replit-managed `DATABASE_URL` to an external deployment as the permanent independence plan. Database ownership and backups are not yet established. First provision or transfer a user-owned database through a private operator process, take a provider backup, test a restore into an isolated database, document rollback, and only then privately set the resulting target URL in Vercel. Never put either URL in chat, GitHub, documentation, or shell logs.

No migration command, Drizzle push, or proposed worker SQL is part of automatic build/deploy. Schema changes require separate review, a backup, an approved maintenance plan, and explicit manual execution.

## Installed migration substrate (not activation)

The package manifest requests `@vercel/blob` `^2.8.0`, `workflow` `^4.8.9`, `nitro` `^3.0.260903-beta`, and `jiti` `^2.7.0`; the current lock resolves Workflow `4.8.9`, Nitro `3.0.260903-beta`, and jiti `2.7.0`. Their presence only makes implementation/build work possible:

- `workflow/nitro` is registered in the Nitro configuration, but automatic execution remains blocked by the explicit worker audit gates.
- The Vercel fraction-upload branch now calls Vercel Blob and fails closed unless `FRACTION_UPLOAD_STORAGE=vercel-blob` and `BLOB_READ_WRITE_TOKEN` are set. This is targeted preparation, not proof that existing local objects were migrated or that the complete fraction flow has production parity. Keep the token server-only and out of Preview.
- Beta Nitro and the workflow integration require targeted build/runtime validation before handoff. Package installation is not evidence of production parity.
- `jiti` is build/configuration support, not an application feature.

## Remaining persistence and portability gaps

These are concrete handoff checks. Verify them against source and targeted tests; installed packages or scaffolding alone do not close them:

1. **Uploads:** `/api/fractions/upload-image` now selects Vercel Blob on Vercel while retaining local filesystem behavior off Vercel. Before parity is claimed, add content-byte/MIME validation (the current path trusts the extension/data declaration), verify size after base64 decoding, test authorization and failure behavior, and migrate any existing local objects/references.
2. **Solana deposit verification state:** `SolanaEscrowService.verifiedDeposits` is an in-memory `Map`. It is lost on cold start and not shared across instances, so replay/use tracking cannot be trusted serverlessly. Store transaction signature, order, wallet, mint, amount, verification slot/status, and an atomic `usedForExecution` transition in Postgres. Enforce unique transaction signatures and perform claim/execution state changes transactionally.
3. **AskBase rate limiting:** `stock-agents/router.ts` uses an instance-local `Map` keyed by IP. Serverless concurrency and cold starts bypass the intended global limit. Move it to a shared atomic limiter (Redis/Upstash or Postgres), use a trusted proxy-aware client identifier, set an expiry, and retain the current 10 requests/minute policy and 429 response.
4. **General in-memory state:** `MemStorage` and multiple route/executor caches are process-local. The exported application storage currently uses `DBStorage`, but every active write path should be confirmed to use it. Keep caches non-authoritative; move idempotency, jobs, locks, and financial state to shared durable storage.
5. **Background workers:** alert monitors and order executors cannot rely on a Vercel web function remaining alive. The current workflow handoff is fail-closed by `ACTIVATION_BLOCKERS`, requires reviewed session-preserving PostgreSQL locking, and treats its SQL as a proposal. Resolve every blocker through audit and reconciliation design before any manual activation. Cut workers over independently from web traffic, with one production owner at a time and a tested stop/rollback path.

## Cutover gates

- Independent production and non-production databases, keys, and RPC credentials are configured; Preview has no production secrets.
- Database backup and restore rehearsal succeeds under the new owner.
- Durable uploads, Solana verification/replay state, and distributed rate limiting are implemented and tested.
- The independent Exa account/key is active and citation fail-closed behavior is verified.
- Workers are moved separately with lease/idempotency protection and rollback.
- Every worker `ACTIVATION_BLOCKERS` entry is resolved by review; automatic execution remains off until then.
- The proposed worker schema has been manually reviewed and deliberately applied under a separate approved database change, never by build/deploy.
- Targeted Vercel build/runtime tests pass for the pinned Workflow/Nitro beta combination; do not claim the full typecheck or feature parity unless separately demonstrated.
- Replit remains available until traffic, state, jobs, and rollback are verified on the target.