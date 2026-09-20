import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist/public");
const config = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));

// The frontend must never proxy to itself or start a second trading executor.
const backend = new URL(config.rewrites[0].destination).origin;
for (const host of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
  if (host && new URL(`https://${host}`).origin === backend) {
    throw new Error("Vercel frontend and external backend must use different origins");
  }
}
const result = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production" },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

// Express serves root public/ separately; a static host needs these files too.
// Vite has already copied client/public/. Never silently replace a conflicting file.
function copyPublic(directory, relative = "") {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const name = path.join(relative, entry.name);
    const source = path.join(directory, entry.name);
    const destination = path.join(output, name);
    if (entry.isSymbolicLink()) throw new Error(`Public asset symlinks are not supported: ${name}`);
    if (entry.isDirectory()) {
      copyPublic(source, name);
    } else if (entry.isFile()) {
      if (existsSync(destination)) {
        if (!readFileSync(source).equals(readFileSync(destination))) {
          throw new Error(`Conflicting root and client public assets: ${name}`);
        }
        continue;
      }
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(source, destination);
    }
  }
}
copyPublic(path.join(root, "public"));

// Farcaster's signed manifest remains served by the canonical backend, not a
// stale file copied from either public folder (static files can shadow rewrites).
if (existsSync(path.join(output, ".well-known/farcaster.json"))) {
  throw new Error("Remove the static Farcaster manifest from client/public; Vercel must proxy it");
}
for (const file of ["index.html", "favicon.svg", "icon.png", "splash-icon.jpg", "ink-logo.png"]) {
  if (!existsSync(path.join(output, file))) throw new Error(`Missing Vercel asset: ${file}`);
}
console.log(`Vercel frontend ready in dist/public; API and executors stay at ${backend}`);