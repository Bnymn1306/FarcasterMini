/**
 * Deliberately not an environment switch. A reviewed reconciliation/cutover
 * implementation must remove these blockers before production activation.
 */
export const ACTIVATION_BLOCKERS = [
  "Solana send/transfer ambiguity and deposit reconciliation require audit",
  "Rug detector uses process-local monitoring state; durable polling is not implemented",
  "Existing executor result handling does not prove chain finality or exactly-once delivery",
  "Additive schema and direct/session-preserving PostgreSQL connection require operator review",
] as const;

export const SERVICES = ["base", "solana", "soneium", "ink", "rug", "alerts"] as const;
export type BackgroundService = typeof SERVICES[number];
export type Owner = "vm" | "workflow";

export function configuredOwner(env: NodeJS.ProcessEnv = process.env): Owner | "disabled" | "legacy" {
  const value = env.BACKGROUND_EXECUTION_OWNER;
  if (value === undefined && !env.VERCEL) return "legacy";
  if (value === "vm" && !env.VERCEL) return "vm";
  if (value === "workflow") return "workflow";
  return "disabled";
}

export function productionWorkflowConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === "production" && env.VERCEL === "1" &&
    env.BACKGROUND_EXECUTION_OWNER === "workflow" &&
    env.BACKGROUND_WORKFLOW_ENABLED === "true" &&
    !!env.BACKGROUND_ADMIN_SECRET &&
    !!env.DATABASE_URL;
}

export function workflowActivationAllowed(): boolean {
  // Hard hold, not bypassable with environment configuration.
  return false;
}