import { timingSafeEqual } from "node:crypto";
import { ACTIVATION_BLOCKERS, configuredOwner, productionWorkflowConfigured } from "./config";
import { backgroundPool } from "./db";

function authenticated(request: Request): boolean {
  const secret = process.env.BACKGROUND_ADMIN_SECRET;
  if (!secret || secret.length < 32) return false;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Parent API adapter should forward GET and POST /api/admin/background here.
 * No SDK start/cancel call: activation is HARD blocked. Stop invalidates the DB
 * generation, rather than relying on cancellation of a possibly sending step.
 */
export function createBackgroundManagementHandler(getPool: () => Pick<ReturnType<typeof backgroundPool>, "query"> = backgroundPool) {
return async function handleBackgroundManagement(request: Request): Promise<Response> {
  if (process.env.VERCEL_ENV !== "production" || process.env.VERCEL !== "1") {
    return json({ error: "Background management is production-only" }, 403);
  }
  if (!authenticated(request)) return json({ error: "Unauthorized or admin secret missing" }, 401);
  if (request.method === "GET") {
    try {
      // Health is observational: no lock, transaction, wallet, or RPC call.
      const result = await getPool().query(
        "SELECT owner, enabled, generation, run_id, updated_at FROM background_control WHERE id = 1",
      );
      if (!result.rows[0]) return json({ error: "Background control row missing", activationAllowed: false }, 503);
      return json({
        activationAllowed: false, blockers: ACTIVATION_BLOCKERS,
        configured: productionWorkflowConfigured(), owner: configuredOwner(),
        control: result.rows[0],
      });
    } catch {
      return json({ error: "Background PostgreSQL schema or session connection unavailable", activationAllowed: false, blockers: ACTIVATION_BLOCKERS }, 503);
    }
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let action: unknown;
  try { action = (await request.json()).action; }
  catch { return json({ error: "Expected JSON action" }, 400); }
  if (action === "start") {
    return json({ error: "Activation requires reconciliation and cutover review; no run was started", blockers: ACTIVATION_BLOCKERS }, 409);
  }
  if (action !== "stop") return json({ error: "Action must be start or stop" }, 400);
  try {
    const result = await getPool().query(
      `UPDATE background_control SET enabled = false, generation = NULL,
       updated_at = now() WHERE id = 1 RETURNING id`,
    );
    if (result.rows.length !== 1) return json({ error: "Background control row missing" }, 503);
    return json({
      controlDisabled: true,
      warning: "Only configured workers observe this gate. Legacy VMs must be stopped separately. In-flight sends cannot be revoked; reconcile before restarting",
    });
  } catch {
    return json({ error: "Stop could not be persisted; do not assume workers stopped" }, 503);
  }
};
}

export const handleBackgroundManagement = createBackgroundManagementHandler();