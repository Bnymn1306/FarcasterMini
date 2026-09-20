import type { IncomingMessage, ServerResponse } from "node:http";
import { createCachedHandler } from "./cached-handler";

export function isStandaloneEnvironmentAllowed(env: NodeJS.ProcessEnv): boolean {
  if (env.VERCEL_ENV === "production") {
    return env.VERCEL_BACKEND_CUTOVER_APPROVED === "true";
  }
  return env.VERCEL_PREVIEW_ISOLATED === "true";
}

const handler = createCachedHandler(async () => {
  const { createApp } = await import("./app");
  const { app } = await createApp();
  // Nitro/static routing owns the frontend. Never answer an unknown API with HTML.
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  return app;
});

export default function vercelHandler(req: IncomingMessage, res: ServerResponse) {
  // Gate BEFORE imports/DB initialization, including GET signing endpoints.
  // Set only after isolating preview DB, wallets and external service credentials.
  if (!isStandaloneEnvironmentAllowed(process.env)) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: "Standalone API disabled: production cutover or isolated environment approval required" }));
    return;
  }
  return handler(req, res);
}