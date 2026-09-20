import { facilitator } from "@coinbase/x402";
import type { Request, Response, NextFunction } from "express";
import type { IStorage } from "../storage";

const PAYMENT_WALLET = process.env.X402_PAYMENT_WALLET_ADDRESS || "0x0000000000000000000000000000000000000000";

// USDC contract addresses per network
const USDC_ADDRESSES: Record<string, string> = {
  "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

// EIP-712 domain (name/version) of the USDC token per network.
// REQUIRED by the Coinbase CDP v2 facilitator: without `extra`, /verify returns
// 400 invalid_payload "missing EIP-712 domain parameters". The client also uses
// these to build the transferWithAuthorization signature domain.
const USDC_EIP712_DOMAIN: Record<string, { name: string; version: string }> = {
  "base": { name: "USD Coin", version: "2" },
  "base-sepolia": { name: "USDC", version: "2" },
};

// Map chain ID to network name
const CHAIN_ID_TO_NETWORK: Record<string, string> = {
  "8453": "base",
  "84532": "base-sepolia",
};

// Get network from chain ID or use default
function getNetworkFromRequest(req: Request): string {
  const chainId = req.headers['x-chain-id'] as string;
  if (chainId && CHAIN_ID_TO_NETWORK[chainId]) {
    return CHAIN_ID_TO_NETWORK[chainId];
  }
  // Default to base-sepolia
  return process.env.X402_NETWORK || "base-sepolia";
}

// Convert USD price to USDC atomic units (6 decimals)
function usdToAtomicUnits(usdPrice: string): string {
  const amount = parseFloat(usdPrice.replace("$", ""));
  return (amount * 1_000_000).toString();
}

// Custom verify/settle that talk to the CDP v2 facilitator directly.
// IMPORTANT: the x402 lib's useFacilitator throws a generic "Bad Request" on any
// non-200 status and DISCARDS the response body. But the CDP v2 facilitator returns
// HTTP 400 WITH a structured JSON body ({ isValid:false, invalidReason, invalidMessage })
// for things like an on-chain "execution reverted" (e.g. insufficient USDC balance).
// We parse the body regardless of status so the real reason reaches the user/logs.
async function facilitatorFetch(path: "verify" | "settle", paymentPayload: any, paymentRequirements: any) {
  const url = (facilitator as any)?.url || "https://x402.org/facilitator";
  let headers: Record<string, string> = { "Content-Type": "application/json" };
  if ((facilitator as any)?.createAuthHeaders) {
    const authHeaders = await (facilitator as any).createAuthHeaders();
    headers = { ...headers, ...(authHeaders?.[path] || {}) };
  }
  const res = await fetch(`${url}/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      x402Version: paymentPayload.x402Version,
      paymentPayload,
      paymentRequirements,
    }),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: res.status, statusText: res.statusText, data, raw: text };
}

async function verify(paymentPayload: any, paymentRequirements: any): Promise<any> {
  const { status, statusText, data, raw } = await facilitatorFetch("verify", paymentPayload, paymentRequirements);
  // The CDP facilitator may return 400 with a meaningful body for invalid payments.
  if (data && typeof data.isValid === "boolean") {
    return data; // { isValid, invalidReason?, invalidMessage?, payer? }
  }
  // No structured body — surface the HTTP error instead of swallowing it.
  return {
    isValid: false,
    invalidReason: "facilitator_error",
    invalidMessage: `Facilitator /verify HTTP ${status} ${statusText}${raw ? `: ${raw}` : ""}`,
  };
}

async function settle(paymentPayload: any, paymentRequirements: any): Promise<any> {
  const { status, statusText, data, raw } = await facilitatorFetch("settle", paymentPayload, paymentRequirements);
  if (status === 200 && data && data.success !== false) {
    return data;
  }
  const reason =
    data?.errorReason || data?.invalidMessage || data?.error || raw || statusText;
  throw new Error(`Settlement failed: ${reason}`);
}

// Some wallets produce an EIP-712 signature with a non-canonical recovery byte
// `v` of 0 or 1 (yParity) instead of 27 or 28. ethers/viem tolerate this and
// recover the correct signer, but Circle's USDC (OpenZeppelin ECDSA / ecrecover)
// rejects it as "FiatTokenV2: invalid signature" because ecrecover returns 0 for
// v not in {27,28}. Normalizing 0/1 -> 27/28 preserves the signer and makes the
// on-chain transferWithAuthorization accept the same signature.
function canonicalizeAuthSignature(paymentPayload: any): { changed: boolean; v?: number; format?: string } {
  try {
    const sig = paymentPayload?.payload?.signature;
    if (typeof sig !== "string" || !sig.startsWith("0x")) return { changed: false };
    const hex = sig.slice(2);

    // Standard 65-byte signature: r(32) s(32) v(1)
    if (hex.length === 130) {
      const vByte = parseInt(hex.slice(128, 130), 16);
      if (vByte === 0 || vByte === 1) {
        const fixedV = (vByte + 27).toString(16).padStart(2, "0");
        paymentPayload.payload.signature = "0x" + hex.slice(0, 128) + fixedV;
        return { changed: true, v: vByte, format: "65-byte" };
      }
      return { changed: false, v: vByte, format: "65-byte" };
    }

    // EIP-2098 compact 64-byte signature: r(32) + yParityAndS(32).
    // Expand to canonical 65-byte form (r + s + v) that ecrecover accepts.
    if (hex.length === 128) {
      const r = hex.slice(0, 64);
      const yParityAndS = hex.slice(64, 128);
      const firstByteOfS = parseInt(yParityAndS.slice(0, 2), 16);
      const yParity = (firstByteOfS & 0x80) >> 7;
      const sFirstByte = (firstByteOfS & 0x7f).toString(16).padStart(2, "0");
      const s = sFirstByte + yParityAndS.slice(2);
      const v = (27 + yParity).toString(16).padStart(2, "0");
      paymentPayload.payload.signature = "0x" + r + s + v;
      return { changed: true, v: 27 + yParity, format: "eip2098-compact" };
    }

    return { changed: false, format: `len-${hex.length}` };
  } catch {
    return { changed: false };
  }
}

// Premium feature pricing configuration
export const PREMIUM_FEATURES = {
  PREMIUM_TOKEN_LAUNCH: {
    endpoint: "/api/tokens/premium",
    price: "$0.05",
    feature: "premium_token_launch",
    description: "Premium token launch with verified badge and featured placement",
  },
  ADVANCED_ANALYTICS: {
    endpoint: "/api/analytics/advanced",
    price: "$0.01",
    feature: "advanced_analytics",
    description: "Advanced on-chain analytics and whale tracking",
  },
  PRIORITY_PREDICTION: {
    endpoint: "/api/predictions/priority",
    price: "$0.01",
    feature: "priority_prediction",
    description: "Priority prediction market creation",
  },
  AI_TRADING_API: {
    endpoint: "/api/trade/ai",
    price: "$0.005",
    feature: "ai_trading",
    description: "AI agent programmatic trading API",
  },
  AGENT_BOOST: {
    endpoint: "/api/agents/boost",
    price: "$0.01",
    feature: "agent_boost",
    description: "Boost your agent: featured placement + reputation increase",
  },
  AGENT_ENDORSE: {
    endpoint: "/api/agents/endorse",
    price: "$0.01",
    feature: "agent_endorse",
    description: "Endorse another agent to raise its reputation",
  },
} as const;

// x402 payment verification middleware
export function createX402Middleware(featureKey: keyof typeof PREMIUM_FEATURES, storage: IStorage) {
  const feature = PREMIUM_FEATURES[featureKey];
  
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get network from client's chain ID
      const network = getNetworkFromRequest(req);
      const usdcAddress = USDC_ADDRESSES[network] || USDC_ADDRESSES["base-sepolia"];
      const usdcDomain = USDC_EIP712_DOMAIN[network] || USDC_EIP712_DOMAIN["base-sepolia"];
      
      console.log(`🔗 x402 middleware - Client network: ${network} (chainId: ${req.headers['x-chain-id'] || 'not provided'})`);
      console.log(`💰 USDC address: ${usdcAddress}`);
      
      // Check if payment header exists
      const paymentHeader = req.headers['x-payment'];
      
      if (!paymentHeader) {
        // No payment provided - return 402 Payment Required
        // Build full URL for resource field
        const protocol = req.protocol || 'https';
        const host = req.get('host') || 'basedmem.replit.app';
        const fullUrl = `${protocol}://${host}${feature.endpoint}`;
        
        return res.status(402).json({
          x402Version: 1,
          accepts: [
            {
              scheme: "exact",
              network: network,
              maxAmountRequired: usdToAtomicUnits(feature.price),
              resource: fullUrl,
              description: feature.description,
              mimeType: "application/json",
              payTo: PAYMENT_WALLET,
              maxTimeoutSeconds: 300,
              asset: usdcAddress,
              extra: usdcDomain,
            },
          ],
          error: {
            code: "PAYMENT_REQUIRED",
            message: feature.description
          }
        });
      }

      // Payment header exists - verify with Coinbase facilitator
      try {
        // Decode payment proof from base64
        const paymentProofString = typeof paymentHeader === 'string' 
          ? paymentHeader 
          : Array.isArray(paymentHeader) 
          ? paymentHeader[0] 
          : '';

        if (!paymentProofString) {
          return res.status(402).json({
            error: "Invalid payment proof format",
            message: "X-Payment header is empty",
          });
        }

        // Decode base64 payment payload
        let paymentPayload: any;
        try {
          const decoded = Buffer.from(paymentProofString, 'base64').toString('utf-8');
          paymentPayload = JSON.parse(decoded);
        } catch (decodeError) {
          console.error("Failed to decode payment proof:", decodeError);
          return res.status(402).json({
            error: "Invalid payment proof encoding",
            message: "Failed to decode base64 payment payload",
          });
        }

        // Normalize a non-canonical signature recovery byte (v=0/1 -> 27/28) so
        // the on-chain USDC transferWithAuthorization (ecrecover) accepts it.
        const sigFix = canonicalizeAuthSignature(paymentPayload);
        if (sigFix.changed) {
          console.log(`🔧 Normalized x402 signature (${sigFix.format}) -> canonical v=${sigFix.v}`);
        } else {
          console.log(`ℹ️ x402 signature format: ${sigFix.format ?? "n/a"}, v=${sigFix.v ?? "n/a"}`);
        }

        // Build full URL for payment requirements
        const protocol = req.protocol || 'https';
        const host = req.get('host') || 'basedmem.replit.app';
        const fullUrl = `${protocol}://${host}${feature.endpoint}`;
        
        // Build payment requirements
        const paymentRequirements = {
          scheme: "exact" as const,
          network: network as any,
          maxAmountRequired: usdToAtomicUnits(feature.price),
          resource: fullUrl,
          description: feature.description,
          mimeType: "application/json",
          payTo: PAYMENT_WALLET,
          maxTimeoutSeconds: 300,
          asset: usdcAddress,
          extra: usdcDomain,
        };

        // Verify payment with Coinbase facilitator
        const verificationResult = await verify(paymentPayload, paymentRequirements);

        if (!verificationResult.isValid) {
          const rawReason = verificationResult.invalidMessage || verificationResult.invalidReason || "Invalid payment proof";
          console.error("Payment verification failed:", verificationResult.invalidReason, "-", verificationResult.invalidMessage);

          // The CDP facilitator reports a generic "execution reverted" for an on-chain
          // transferWithAuthorization that fails. The dominant cause is the payer not
          // holding enough *native* USDC on Base (a wallet's total $ value is portfolio-wide,
          // and bridged USDbC is a different token). Read the real balance so we can tell
          // the user exactly what's wrong instead of guessing.
          const isRevert = typeof rawReason === "string" && rawReason.toLowerCase().includes("execution reverted");
          const networkLabel = network === "base" ? "Base" : network === "base-sepolia" ? "Base Sepolia" : network;
          let userMessage = rawReason;
          if (isRevert) {
            userMessage = `Payment could not be processed. Please make sure you have enough native USDC on ${networkLabel} to cover this payment.`;
            const payer = verificationResult.payer || paymentPayload?.payload?.authorization?.from;
            if (payer) {
              try {
                const { ethers } = await import("ethers");
                const rpcUrl = network === "base-sepolia"
                  ? (process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org")
                  : (process.env.BASE_RPC_URL || "https://mainnet.base.org");
                const provider = new ethers.JsonRpcProvider(rpcUrl);
                const erc20 = new ethers.Contract(usdcAddress, ["function balanceOf(address) view returns (uint256)"], provider);
                const balanceRaw: bigint = await erc20.balanceOf(payer);
                const required = BigInt(usdToAtomicUnits(feature.price));
                const balanceUsdc = ethers.formatUnits(balanceRaw, 6);
                const requiredUsdc = ethers.formatUnits(required, 6);
                console.error(`💸 Payer ${payer} native USDC balance: ${balanceUsdc} (needs ${requiredUsdc}) on ${network}`);
                if (balanceRaw < required) {
                  userMessage = `Not enough USDC on ${networkLabel}. You have ${balanceUsdc} USDC but this action needs ${requiredUsdc} USDC. Add native USDC (Circle) to your wallet on the ${networkLabel} network and try again.`;
                } else {
                  // Balance is sufficient — the revert is something else (signature/domain mismatch,
                  // nonce reuse, or expired authorization). Run a precise on-chain diagnostic so the
                  // logs tell us the EXACT cause instead of guessing.
                  userMessage = "Payment was rejected on-chain even though your USDC balance looks sufficient. Please refresh, reconnect your wallet, and try again.";
                  try {
                    const auth = paymentPayload?.payload?.authorization;
                    const signature = paymentPayload?.payload?.signature;
                    if (auth && signature) {
                      const chainId = network === "base" ? 8453 : network === "base-sepolia" ? 84532 : 8453;
                      // 1) Recover the EIP-712 signer using OUR advertised domain and compare to `from`.
                      const domain = {
                        name: (usdcDomain as any)?.name,
                        version: (usdcDomain as any)?.version,
                        chainId,
                        verifyingContract: usdcAddress,
                      };
                      const types = {
                        TransferWithAuthorization: [
                          { name: "from", type: "address" },
                          { name: "to", type: "address" },
                          { name: "value", type: "uint256" },
                          { name: "validAfter", type: "uint256" },
                          { name: "validBefore", type: "uint256" },
                          { name: "nonce", type: "bytes32" },
                        ],
                      };
                      const message = {
                        from: auth.from,
                        to: auth.to,
                        value: auth.value,
                        validAfter: auth.validAfter,
                        validBefore: auth.validBefore,
                        nonce: auth.nonce,
                      };
                      let recovered = "n/a";
                      try { recovered = ethers.verifyTypedData(domain, types, message, signature); } catch (e) { recovered = `recover_failed: ${(e as Error).message}`; }
                      const sigMatches = recovered.toLowerCase() === String(auth.from).toLowerCase();
                      // 2) Timing window vs chain time.
                      const nowSec = Math.floor(Date.now() / 1000);
                      // 3) Nonce already used?
                      const usdcAuth = new ethers.Contract(usdcAddress, [
                        "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
                        "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)",
                      ], provider);
                      let nonceUsed: any = "n/a";
                      try { nonceUsed = await usdcAuth.authorizationState(auth.from, auth.nonce); } catch (e) { nonceUsed = `state_failed: ${(e as Error).message}`; }
                      // 4) Direct staticCall to capture the raw revert string.
                      let revertReason = "no_revert (static call succeeded?!)";
                      try {
                        await usdcAuth.transferWithAuthorization.staticCall(
                          auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, signature,
                        );
                      } catch (e: any) {
                        revertReason = e?.reason || e?.shortMessage || e?.revert?.args?.[0] || e?.info?.error?.message || e?.message || "unknown";
                      }
                      // 5) Is the payer an EOA or a smart-contract (EIP-1271) wallet?
                      //    v-normalization only helps EOAs; a contract wallet needs a 1271 path.
                      let payerCodeSize: any = "n/a";
                      try {
                        const code = await provider.getCode(auth.from);
                        payerCodeSize = code && code !== "0x" ? (code.length - 2) / 2 : 0;
                      } catch (e) { payerCodeSize = `code_failed: ${(e as Error).message}`; }
                      const sigLen = typeof signature === "string" && signature.startsWith("0x") ? (signature.length - 2) / 2 : "n/a";
                      console.error("🔎 x402 DIAGNOSTIC", JSON.stringify({
                        recovered, expectedFrom: auth.from, sigMatches,
                        domainName: domain.name, domainVersion: domain.version, chainId,
                        nowSec, validAfter: auth.validAfter, validBefore: auth.validBefore,
                        nonceUsed, revertReason,
                        payerCodeSize, payerIsContract: typeof payerCodeSize === "number" && payerCodeSize > 0,
                        sigLen,
                      }));
                      if (recovered.startsWith("recover_failed") || !sigMatches) {
                        userMessage = "Payment signature could not be verified. Please refresh the page and reconnect your wallet, then try again.";
                      } else if (nonceUsed === true) {
                        userMessage = "This payment authorization was already used. Please refresh and try again.";
                      } else if (Number(auth.validBefore) <= nowSec) {
                        userMessage = "Payment authorization expired before it could be processed. Please try again.";
                      }
                    }
                  } catch (diagErr) {
                    console.error("x402 diagnostic failed:", diagErr instanceof Error ? diagErr.message : diagErr);
                  }
                }
              } catch (balErr) {
                console.error("Could not read payer USDC balance:", balErr instanceof Error ? balErr.message : balErr);
              }
            }
          }
          return res.status(402).json({
            error: "Payment verification failed",
            message: userMessage,
            reason: verificationResult.invalidReason,
          });
        }

        // Payment verified! Extract payer address
        const payerAddress = verificationResult.payer;
        
        if (!payerAddress) {
          console.error("Payment verified but no payer address returned");
          return res.status(402).json({
            error: "Payment verification failed",
            message: "No payer address in verification result",
          });
        }

        // Get or create user for payment record
        let userId: string;
        try {
          let user = await storage.getUserByWalletAddress(payerAddress);
          if (!user) {
            user = await storage.createUser({
              walletAddress: payerAddress,
              username: `User_${payerAddress.slice(0, 8)}`,
            });
          }
          userId = user.id;
        } catch (userError) {
          console.error("Failed to get/create user for payment:", userError);
          // Create temporary user ID for payment tracking
          userId = payerAddress;
        }

        // Settle payment on-chain
        let settlementSuccessful = false;
        let settlementError: any = null;
        try {
          await settle(paymentPayload, paymentRequirements);
          settlementSuccessful = true;
          console.log(`✅ Payment settled for ${payerAddress}: ${feature.feature}`);
        } catch (settleError) {
          settlementError = settleError;
          console.error("Payment settlement failed:", settleError);
          // Don't continue - settlement is critical for payment integrity
        }

        // Store verified payment in database
        try {
          const now = new Date();
          const paymentMetadata: any = {
            verifiedAt: now.toISOString(),
            paymentPayload: paymentPayload,
            payer: payerAddress,
          };

          // Only include settlement info if successful
          if (settlementSuccessful) {
            paymentMetadata.settledAt = now.toISOString();
          } else if (settlementError) {
            paymentMetadata.settlementError = settlementError.message || "Settlement failed";
          }

          const paymentRecord = await storage.createX402Payment({
            userId,
            feature: feature.feature,
            amount: feature.price.replace("$", ""),
            txHash: paymentPayload.payload?.signature || null,
            endpoint: feature.endpoint,
            paymentProof: paymentProofString,
            network: network,
            currency: "USDC",
            metadata: JSON.stringify(paymentMetadata),
            errorMessage: settlementSuccessful ? null : (settlementError?.message || "Settlement failed"),
          });

          // Update payment record with verified timestamp and settlement status
          await storage.updateX402Payment(paymentRecord.id, {
            verifiedAt: now,
            // Only set settledAt if settlement was successful
            ...(settlementSuccessful ? { settledAt: now } : {}),
          });

          // If settlement failed, return error but with payment record for audit
          if (!settlementSuccessful) {
            console.error("⚠️ Payment verified but settlement failed for", payerAddress);
            return res.status(503).json({
              error: "Payment settlement failed",
              message: "Payment was verified but on-chain settlement failed. No charge was made.",
              paymentId: paymentRecord.id,
            });
          }

          // Store payment info in request for handler access
          req.x402Payment = {
            proof: paymentProofString,
            feature: feature.feature,
            amount: feature.price.replace("$", ""),
            endpoint: feature.endpoint,
            payer: payerAddress,
          };

          console.log(`✅ Payment verified & settled for ${payerAddress}: ${feature.feature} - ${feature.price}`);
          
          // Continue to handler - payment is verified, settled, and stored
          next();
        } catch (storageError) {
          console.error("⚠️ CRITICAL: Failed to store payment record after successful settlement:", storageError);
          
          // This is a critical error - payment was settled but we can't record it
          // Log extensively for manual review and recovery
          console.error("PAYMENT AUDIT ALERT:", {
            payer: payerAddress,
            feature: feature.feature,
            amount: feature.price,
            endpoint: feature.endpoint,
            settled: settlementSuccessful,
            timestamp: new Date().toISOString(),
            error: storageError instanceof Error ? storageError.message : String(storageError),
          });

          // Return error to prevent premium access without audit trail
          // This prevents a mismatch between settled payments and database records
          return res.status(500).json({
            error: "Payment processing error",
            message: "Payment was settled but could not be recorded. Please contact support with this reference.",
            reference: `${feature.feature}-${Date.now()}`,
            payer: payerAddress,
          });
        }
      } catch (error) {
        console.error("Payment verification error:", error);
        return res.status(402).json({
          error: "Payment verification failed",
          message: error instanceof Error ? error.message : "Payment verification failed",
        });
      }
    } catch (error) {
      console.error("x402 middleware error:", error);
      return res.status(500).json({
        error: "Payment processing error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}

// Type augmentation for Express Request
declare global {
  namespace Express {
    interface Request {
      x402Payment?: {
        proof: string;
        feature: string;
        amount: string;
        endpoint: string;
        payer: string;
      };
    }
  }
}

export { PAYMENT_WALLET, USDC_ADDRESSES, CHAIN_ID_TO_NETWORK, facilitator };
