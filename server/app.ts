import express, { type ErrorRequestHandler } from "express";
import { normalizeCdpSecret } from "./normalize-cdp-secret";

export const apiErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const candidate = Number(err.status || err.statusCode || 500);
  const status = Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
  res.status(status).json({ message: status >= 500 ? "Internal Server Error" : (err.message || "Request failed") });
};

/** No Vite, listener, seeding or worker startup belongs in this factory. */
export async function createApp() {
  normalizeCdpSecret();
  const app = express();
  app.use((_req, res, next) => {
    res.removeHeader("X-Frame-Options");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Permissions-Policy", "interest-cohort=()");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    next();
  });
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false, limit: "10mb" }));
  // Dynamic import is essential: static ESM imports run before normalization.
  const { registerRoutes } = await import("./routes");
  const server = await registerRoutes(app);
  app.use(apiErrorHandler);
  return { app, server };
}