#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = new URL("../", import.meta.url);
const ignored = new Set([".git", "node_modules", "dist", ".vercel"]);
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const names = new Set();
const readinessNames = [
  "DATABASE_URL",
  "EXA_API_KEY",
  "BASE_RPC_URL",
  "VITE_BASE_RPC_URL",
  "FRACTION_UPLOAD_STORAGE",
  "BLOB_STORE_ID",
  "VERCEL_OIDC_TOKEN",
];

function visit(directory) {
  for (const entry of readdirSync(directory)) {
    if (ignored.has(entry) || entry === ".env" || entry.startsWith(".env.")) continue;
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      visit(path);
      continue;
    }
    if (!extensions.has(extname(entry))) continue;
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/(?:(?:process|import\.meta)\.env|\benv)\.([A-Z][A-Z0-9_]*)/g)) {
      names.add(match[1]);
    }
    for (const match of source.matchAll(/process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g)) {
      names.add(match[1]);
    }
  }
}

for (const target of [
  "server", "client/src", "shared", "scripts", "contracts",
  "vite.config.ts", "drizzle.config.ts", "hardhat.config.cjs",
]) {
  const path = join(root.pathname, target);
  if (!existsSync(path)) continue;
  if (statSync(path).isDirectory()) visit(path);
  else {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/(?:(?:process|import\.meta)\.env|\benv)\.([A-Z][A-Z0-9_]*)/g)) {
      names.add(match[1]);
    }
  }
}
// Provider selection accepts an injected environment for deterministic tests, so
// these references intentionally do not use process.env directly.
for (const name of ["CDP_API_KEY_SECRET", "EXA_API_KEY", "VERCEL", "VERCEL_ENV"]) names.add(name);

if (process.argv.includes("--readiness")) {
  console.log("Migration runtime environment check (names and booleans only; values are never printed; run inside the target runtime for its managed OIDC credential)");
  let complete = true;
  for (const name of readinessNames) {
    const present = typeof process.env[name] === "string" && process.env[name].trim().length > 0;
    console.log(`${name}=${present}`);
    if (!present) complete = false;
  }
  console.log(`REQUIRED_ENV_PRESENT=${complete}`);
  if (!complete) process.exitCode = 1;
  process.exit();
}

const publicNames = [...names].filter(name => name.startsWith("VITE_")).sort();
const platformNames = [...names].filter(name =>
  name === "NODE_ENV" || name === "PORT" || name.startsWith("REPL") ||
  ["VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL"].includes(name),
).sort();
const serverNames = [...names].filter(name =>
  !publicNames.includes(name) && !platformNames.includes(name),
).sort();

console.log("Migration environment-name audit (source scan only; no .env files or values read)");
console.log(`Root: ${relative(process.cwd(), root.pathname) || "."}`);
console.log(`\nServer-only/application (${serverNames.length}):\n${serverNames.join("\n")}`);
console.log(`\nPublic Vite (${publicNames.length}):\n${publicNames.join("\n")}`);
console.log(`\nPlatform/runtime supplied (${platformNames.length}):\n${platformNames.join("\n")}`);