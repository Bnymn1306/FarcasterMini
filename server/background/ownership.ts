import { AsyncLocalStorage } from "node:async_hooks";
import { backgroundPool } from "./db";
import { configuredOwner, workflowActivationAllowed, type BackgroundService, type Owner } from "./config";

export interface Session {
  query(sql: string, values?: any[]): Promise<{ rows: any[]; rowCount?: number | null }>;
  release(destroy?: boolean): void;
  on?(event: "error" | "end", listener: () => void): unknown;
  removeListener?(event: "error" | "end", listener: () => void): unknown;
}
export interface SessionPool { connect(): Promise<Session> }
const context = new AsyncLocalStorage<{
  session: Session; service: BackgroundService; owner: Owner;
  generation: string | null; valid: boolean;
}>();
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
  const active = { session, service, owner, generation: generation ?? null, valid: true };
  const lostSession = () => { active.valid = false; destroy = true; };
  session.on?.("error", lostSession);
  session.on?.("end", lostSession);
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
    if (!active.valid) throw new Error("Background lock session lost; reconcile in-flight submissions");
    // Snapshot VM generations too: stop/start under the same owner must not
    // authorize a previous tick's later claims.
    active.generation = control.generation ?? null;
    const result = await context.run(active, tick);
    if (!active.valid) throw new Error("Background lock session lost; reconcile in-flight submissions");
    return result;
  } catch (error) {
    // Any query failure can leave the session/lock outcome uncertain.
    destroy = true;
    throw error;
  } finally {
    // Async descendants retain ALS context; invalidate before releasing the
    // lock so a delayed callback cannot claim through a pooled/reused session.
    destroy ||= !active.valid;
    active.valid = false;
    if (acquired && !destroy) {
      try { await session.query("SELECT pg_advisory_unlock($1, $2)", [LOCK_NAMESPACE, LOCK_KEY]); }
      catch { destroy = true; }
    }
    session.release(destroy);
    session.removeListener?.("error", lostSession);
    session.removeListener?.("end", lostSession);
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
  if (!active.valid) throw new Error("Background lock context expired or lost; reconcile before retrying");
  // Recheck stop/ownership before each side effect, not just once per batch.
  let result: Awaited<ReturnType<Session["query"]>>;
  try {
    result = await active.session.query(
    `INSERT INTO background_claims(service, subject, action, state)
     SELECT $1, $2, $3, 'execution_unknown'
     FROM background_control
     WHERE id = 1 AND enabled AND owner = $4
       AND generation IS NOT DISTINCT FROM $5
     ON CONFLICT (service, subject, action) DO NOTHING RETURNING subject`,
    [active.service, subject, action, active.owner, active.generation ?? null],
    );
  } catch (error) {
    // A failed INSERT response may have committed. Keep any durable claim and
    // poison this context even if the executor catches the exception.
    active.valid = false;
    throw error;
  }
  if (!active.valid) throw new Error("Background claim outcome uncertain after session loss; reconcile before retrying");
  return result.rows.length === 1;
}