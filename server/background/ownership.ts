import { AsyncLocalStorage } from "node:async_hooks";
import { backgroundPool } from "./db";
import { configuredOwner, workflowActivationAllowed, type BackgroundService, type Owner } from "./config";

export interface Session {
  query(sql: string, values?: any[]): Promise<{ rows: any[]; rowCount?: number | null }>;
  release(destroy?: boolean): void;
}
export interface SessionPool { connect(): Promise<Session> }
const context = new AsyncLocalStorage<{ session: Session; service: BackgroundService; owner: Owner; generation?: string }>();
const LOCK_NAMESPACE = 184773;
// One global lock intentionally serializes all protected ticks, including rug sells.
const LOCK_KEY = 1;

export async function lockedTick<T>(
  pool: SessionPool, service: BackgroundService, owner: Owner,
  tick: () => Promise<T>, generation?: string,
): Promise<T | undefined> {
  const session = await pool.connect();
  let acquired = false;
  let destroy = false;
  try {
    const lock = await session.query("SELECT pg_try_advisory_lock($1, $2) AS acquired", [LOCK_NAMESPACE, LOCK_KEY]);
    acquired = lock.rows[0]?.acquired === true;
    if (!acquired) return;
    const gate = await session.query(
      "SELECT owner, enabled, generation FROM background_control WHERE id = 1",
    );
    const control = gate.rows[0];
    if (!control?.enabled || control.owner !== owner ||
        (owner === "workflow" && control.generation !== generation)) return;
    return await context.run({ session, service, owner, generation }, tick);
  } finally {
    if (acquired) {
      try { await session.query("SELECT pg_advisory_unlock($1, $2)", [LOCK_NAMESPACE, LOCK_KEY]); }
      catch { destroy = true; }
    }
    session.release(destroy);
  }
}

export async function runOwnedTick<T>(
  service: BackgroundService, tick: () => Promise<T>, owner: Owner = "vm", generation?: string,
): Promise<T | undefined> {
  const mode = configuredOwner();
  if (mode === "legacy" && owner === "vm") return tick();
  if (mode !== owner || (owner === "workflow" && !workflowActivationAllowed())) return;
  return lockedTick(backgroundPool(), service, owner, tick, generation);
}

/**
 * Atomic insert is the unclaimed -> execution_unknown CAS, committed BEFORE
 * any submission. Never expires or retries automatically, even on a thrown
 * error. "unknown" is intentional: executor return values are not finality.
 * An operator must reconcile chain state before any future recovery.
 */
export async function claimSideEffect(subject: string, action: string): Promise<boolean> {
  const active = context.getStore();
  if (!active) {
    if (configuredOwner() === "legacy") return true;
    throw new Error("Side effect outside a protected background tick");
  }
  // Recheck stop/ownership before each side effect, not just once per batch.
  const result = await active.session.query(
    `INSERT INTO background_claims(service, subject, action, state)
     SELECT $1, $2, $3, 'execution_unknown'
     FROM background_control
     WHERE id = 1 AND enabled AND owner = $4
       AND ($4 <> 'workflow' OR generation = $5)
     ON CONFLICT (service, subject, action) DO NOTHING RETURNING subject`,
    [active.service, subject, action, active.owner, active.generation ?? null],
  );
  return result.rows.length === 1;
}