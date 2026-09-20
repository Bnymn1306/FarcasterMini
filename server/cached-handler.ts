import type { IncomingMessage, ServerResponse } from "node:http";

export type NodeHandler = (req: IncomingMessage, res: ServerResponse) => unknown;

/** Concurrent cold starts share initialization; failures may retry on the next request. */
export function createCachedHandler(load: () => Promise<NodeHandler>): NodeHandler {
  let pending: Promise<NodeHandler> | undefined;
  return async (req, res) => {
    try {
      if (!pending) {
        pending = Promise.resolve().then(load).catch((error) => {
          pending = undefined;
          throw error;
        });
      }
      const handler = await pending;
      return await handler(req, res);
    } catch {
      // Do not leak credentials or database details from initialization errors.
      console.error("Standalone API initialization or request failed");
      if (!res.headersSent) {
        res.statusCode = 503;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify({ error: "API temporarily unavailable" }));
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  };
}