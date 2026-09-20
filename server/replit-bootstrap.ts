import { createApp } from "./app";

/** Long-running Replit lifecycle. Never imported by the standalone API. */
export async function startReplitServer() {
  const { app, server } = await createApp();
  const { setupVite, serveStatic, log } = await import("./vite");
  const { initTwitterClient } = await import("./twitter");
  const { storage } = await import("./storage");
  const { LimitOrderExecutor } = await import("./limitOrderExecutor");
  const { SolanaLimitOrderExecutor } = await import("./solanaLimitOrderExecutor");
  const { SoneiumLimitOrderExecutor } = await import("./soneiumLimitOrderExecutor");
  const { InkLimitOrderExecutor } = await import("./inkLimitOrderExecutor");
  const { RugProtectionExecutor } = await import("./rugProtectionExecutor");
  initTwitterClient();

  if (app.get("env") === "development") await setupVite(app, server);
  else serveStatic(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  let initialized = false;
  let executors: Array<{ stop(): void }> = [];
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let keepaliveDelay: ReturnType<typeof setTimeout> | undefined;
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use. Retrying in 2 seconds...`);
      setTimeout(() => {
        server.close();
        server.listen({ port, host: "0.0.0.0", reusePort: true });
      }, 2000);
    } else {
      throw error;
    }
  });
  server.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`Server listening on http://0.0.0.0:${port}`);
    if ("seedPlatformToken" in storage) {
      (storage as any).seedPlatformToken().catch((err: any) => {
        console.error("seedPlatformToken failed (non-fatal):", err?.message);
      });
    }
    if (!initialized) {
      initialized = true;
      const workers = [
        new LimitOrderExecutor(storage, 30000),
        new SolanaLimitOrderExecutor(storage, 30000),
        new SoneiumLimitOrderExecutor(storage, 30000),
        new InkLimitOrderExecutor(storage, 30000),
        new RugProtectionExecutor(storage),
      ];
      executors = workers;
      workers.forEach((worker) => worker.start());
      keepaliveDelay = setTimeout(() => {
        keepalive = setInterval(async () => {
          try { await fetch(`http://localhost:${port}/api/health`); } catch { /* keepalive only */ }
        }, 60_000);
      }, 30_000);
    }
  });
  const shutdown = (signal: string) => {
    log(`${signal} received. Shutting down.`);
    executors.forEach((worker) => worker.stop());
    clearTimeout(keepaliveDelay);
    clearInterval(keepalive);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}