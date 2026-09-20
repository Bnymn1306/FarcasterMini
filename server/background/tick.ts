import { FatalError } from "workflow";
import { ACTIVATION_BLOCKERS, workflowActivationAllowed } from "./config";
import { backgroundPool } from "./db";

/**
 * Server/step boundary. No timers, startup import, or executor construction
 * occurs unless activation has passed review. Stop is checked every tick.
 */
export async function workflowTick(generation: string): Promise<boolean> {
  "use step";
  if (!workflowActivationAllowed()) {
    throw new FatalError(`Background activation blocked: ${ACTIVATION_BLOCKERS.join("; ")}`);
  }
  const result = await backgroundPool().query(
    "SELECT enabled, owner, generation FROM background_control WHERE id = 1",
  );
  const control = result.rows[0];
  if (!control?.enabled || control.owner !== "workflow" || control.generation !== generation) return false;

  // These imports are deliberately below the fail-closed gate: DBStorage and
  // wallet constructors must not be invoked by management/health requests.
  const { storage } = await import("../storage");
  const { LimitOrderExecutor } = await import("../limitOrderExecutor");
  const { SolanaLimitOrderExecutor } = await import("../solanaLimitOrderExecutor");
  const { SoneiumLimitOrderExecutor } = await import("../soneiumLimitOrderExecutor");
  const { InkLimitOrderExecutor } = await import("../inkLimitOrderExecutor");
  for (const executor of [
    new LimitOrderExecutor(storage),
    new SolanaLimitOrderExecutor(storage),
    new SoneiumLimitOrderExecutor(storage),
    new InkLimitOrderExecutor(storage),
  ]) {
    await executor.tick("workflow", generation);
  }
  // Do not activate alerts: they were not started by the existing entrypoint.
  // Rug polling is a stated activation blocker, not a silently omitted service.
  return true;
}
// Official SDK docs: arbitrary errors default to THREE retries. A submission
// step must never use that default. CAS remains necessary for redelivery.
workflowTick.maxRetries = 0;