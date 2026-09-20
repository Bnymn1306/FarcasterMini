import { sleep } from "workflow";
import { workflowTick } from "../server/background/tick";

/**
 * Bounded generation, not an immortal deployment-pinned run. Management start
 * is intentionally blocked; this export is prepared for reviewed cutover only.
 */
export async function backgroundGeneration(generation: string) {
  "use workflow";
  for (let tick = 0; tick < 120; tick++) {
    if (!await workflowTick(generation)) return { reason: "stopped", generation };
    await sleep("30s");
  }
  return { reason: "generation_complete", generation };
}