// 🔐 CRITICAL: Normalize CDP_API_KEY_SECRET BEFORE any imports
// Replit Secrets mangles multi-line PEM keys, so we store them base64-encoded.
// The Coinbase CDP SDK (used by the x402 facilitator) only accepts a PKCS#8 PEM
// (-----BEGIN PRIVATE KEY-----) or a base64 Ed25519 key. Legacy CDP keys are SEC1
// EC PEM (-----BEGIN EC PRIVATE KEY-----), which the SDK rejects, so we convert
// them to PKCS#8 here. This MUST run before importing middleware/x402.ts.
if (process.env.CDP_API_KEY_SECRET) {
  try {
    let secret = process.env.CDP_API_KEY_SECRET.trim();

    // Step 1: base64-decode if it isn't already a PEM
    if (!secret.startsWith('-----BEGIN')) {
      const decoded = Buffer.from(secret, 'base64').toString('utf8');
      if (decoded.startsWith('-----BEGIN')) {
        secret = decoded;
        console.log('✅ CDP_API_KEY_SECRET decoded from base64');
      }
    }

    // Step 2: convert legacy SEC1 EC PEM to PKCS#8 (the only PEM the CDP SDK accepts)
    if (secret.includes('-----BEGIN EC PRIVATE KEY-----')) {
      const { createPrivateKey } = await import('crypto');
      const pkcs8 = createPrivateKey(secret).export({ type: 'pkcs8', format: 'pem' }).toString();
      secret = pkcs8;
      console.log('✅ CDP_API_KEY_SECRET converted from SEC1 EC to PKCS#8');
    }

    process.env.CDP_API_KEY_SECRET = secret;
  } catch (error) {
    console.error('❌ Failed to normalize CDP_API_KEY_SECRET:', error);
  }
}

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initTwitterClient } from "./twitter";
import { LimitOrderExecutor } from "./limitOrderExecutor";
import { SolanaLimitOrderExecutor } from "./solanaLimitOrderExecutor";
import { SoneiumLimitOrderExecutor } from "./soneiumLimitOrderExecutor";
import { InkLimitOrderExecutor } from "./inkLimitOrderExecutor";
import { PriceAlertMonitor } from "./priceAlertMonitor";
import { RugProtectionExecutor } from "./rugProtectionExecutor";
import { storage } from "./storage";

// Singleton guard for background tasks (prevents duplicate initialization in Reserved VM)
let isBackgroundTasksInitialized = false;
let limitOrderExecutorInstance: LimitOrderExecutor | null = null;
let solanaLimitOrderExecutorInstance: SolanaLimitOrderExecutor | null = null;
let soneiumLimitOrderExecutorInstance: SoneiumLimitOrderExecutor | null = null;
let inkLimitOrderExecutorInstance: InkLimitOrderExecutor | null = null;
let rugProtectionExecutorInstance: RugProtectionExecutor | null = null;
let keepaliveIntervalId: NodeJS.Timeout | null = null;

const app = express();

// 🚨 CRITICAL: Farcaster Frame Headers - Allow embedding in Warpcast
app.use((req, res, next) => {
  // Allow Frame embedding from Warpcast
  res.removeHeader('X-Frame-Options');
  
  // CRITICAL: Disable all caching - Force Warpcast to load fresh content
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Allow scripts to execute in Frame
  res.setHeader('Permissions-Policy', 'interest-cohort=()');
  
  // CSP that allows ALL Farcaster clients to embed (desktop, mobile, 3rd party)
  // Using * for frame-ancestors to support all Farcaster ecosystem clients
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors *"
  );
  
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  initTwitterClient();
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${port} is already in use. Retrying in 2 seconds...`);
      setTimeout(() => {
        server.close();
        server.listen({ port, host: "0.0.0.0", reusePort: true });
      }, 2000);
    } else {
      console.error('❌ Server error:', error);
      throw error;
    }
  });

  // Listen FIRST so the health check probe can pass immediately.
  // Background executors are started AFTER the server is already up.
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`✅ Server listening on http://0.0.0.0:${port}`);

    // Seed platform token AFTER the server is already listening so a slow
    // DB cold-start never blocks the deployment health-check probe.
    if ('seedPlatformToken' in storage) {
      (storage as any).seedPlatformToken().catch((err: any) => {
        console.error('⚠️ seedPlatformToken failed (non-fatal):', err?.message);
      });
    }

    // Start background tasks AFTER the server is already listening so the
    // deployment health-check probe is not blocked by executor initialization.
    if (!isBackgroundTasksInitialized) {
      isBackgroundTasksInitialized = true;

      limitOrderExecutorInstance = new LimitOrderExecutor(storage, 30000);
      limitOrderExecutorInstance.start();

      solanaLimitOrderExecutorInstance = new SolanaLimitOrderExecutor(storage, 30000);
      solanaLimitOrderExecutorInstance.start();

      soneiumLimitOrderExecutorInstance = new SoneiumLimitOrderExecutor(storage, 30000);
      soneiumLimitOrderExecutorInstance.start();

      inkLimitOrderExecutorInstance = new InkLimitOrderExecutor(storage, 30000);
      inkLimitOrderExecutorInstance.start();

      rugProtectionExecutorInstance = new RugProtectionExecutor(storage);
      rugProtectionExecutorInstance.start();

      console.log('🔒 Background tasks initialized (Base + Solana + Soneium + INK limit orders, Rug Protection)');
    } else {
      console.log('⚠️ Background tasks already initialized, skipping duplicate start');
    }

    // Keepalive: start after a short delay so the DB connection is warm
    if (!keepaliveIntervalId) {
      setTimeout(() => {
        keepaliveIntervalId = setInterval(async () => {
          try {
            await fetch(`http://localhost:${port}/api/health`);
          } catch (error) {
            // Ignore errors - this is just keepalive
          }
        }, 60 * 1000); // 1 minute interval
        log('🔄 Database keepalive mechanism started');
      }, 30000); // 30 second delay before starting keepalive
    }
  });

  // Graceful shutdown handler for Reserved VM deployment
  const gracefulShutdown = (signal: string) => {
    console.log(`\n🛑 ${signal} received. Shutting down gracefully...`);
    
    // Stop background tasks
    if (limitOrderExecutorInstance) {
      limitOrderExecutorInstance.stop();
      console.log('✅ Limit order executor stopped');
    }
    
    if (rugProtectionExecutorInstance) {
      rugProtectionExecutorInstance.stop();
      console.log('✅ Rug protection executor stopped');
    }
    
    if (keepaliveIntervalId) {
      clearInterval(keepaliveIntervalId);
      keepaliveIntervalId = null;
      console.log('✅ Keepalive mechanism stopped');
    }
    
    // Close server
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
    
    // Force exit after 10 seconds if graceful shutdown fails
    setTimeout(() => {
      console.error('❌ Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
})();
