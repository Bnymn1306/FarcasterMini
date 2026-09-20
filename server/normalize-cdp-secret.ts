import { createPrivateKey } from "node:crypto";

/** Run before dynamically importing routes (and therefore the x402 SDK). */
export function normalizeCdpSecret(env: NodeJS.ProcessEnv = process.env): void {
  if (!env.CDP_API_KEY_SECRET) return;
  let secret = env.CDP_API_KEY_SECRET.trim();
  if (!secret.startsWith("-----BEGIN")) {
    const decoded = Buffer.from(secret, "base64").toString("utf8");
    if (decoded.startsWith("-----BEGIN")) secret = decoded;
  }
  if (secret.includes("-----BEGIN EC PRIVATE KEY-----")) {
    secret = createPrivateKey(secret).export({ type: "pkcs8", format: "pem" }).toString();
  }
  env.CDP_API_KEY_SECRET = secret.trim();
}