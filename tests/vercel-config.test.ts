import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("Vercel builds only the Vite frontend, preserving the existing fullstack build", () => {
  assert.equal(config.framework, "vite");
  assert.equal(config.outputDirectory, "dist/public");
  assert.equal(config.installCommand, "npm ci");
  assert.equal(config.buildCommand, "npm run build:vercel");
  assert.equal(pkg.scripts["build:vercel"], "node scripts/build-vercel.mjs");
  assert.match(pkg.scripts.build, /server\/index\.ts/);
  assert.equal(config.functions, undefined);
});

test("dynamic backend endpoints precede the SPA fallback and retain their paths", () => {
  const expected = [
    "/api/:path*", "/mcp", "/mcp/:path*", "/frame/:path*",
    "/token-logo/:path*", "/.well-known/farcaster.json",
  ];
  assert.deepEqual(config.rewrites.slice(0, -1).map((r: { source: string }) => r.source), expected);
  for (const route of config.rewrites.slice(0, -1)) {
    assert.equal(route.destination, `https://basedmem.replit.app${route.source}`);
  }
  assert.equal(config.rewrites.at(-1).destination, "/index.html");
});

test("SPA fallback does not turn missing API, MCP, manifest or bundle requests into HTML", () => {
  const fallback = new RegExp(`^${config.rewrites.at(-1).source}$`);
  for (const path of ["/api", "/api/health", "/mcp", "/mcp/spec", "/frame/token/1",
    "/token-logo/example", "/.well-known/farcaster.json", "/assets/missing.js"]) {
    assert.equal(fallback.test(path), false, path);
  }
  for (const path of ["/", "/swap", "/limit-orders", "/agent-hub", "/tokenized-stocks"]) {
    assert.equal(fallback.test(path), true, path);
  }
});

test("wallet, quote and agent responses are not CDN cached", () => {
  for (const source of ["/api/:path*", "/mcp", "/mcp/:path*"]) {
    const rule = config.headers.find((r: { source: string }) => r.source === source);
    assert.ok(rule);
    assert.ok(rule.headers.some((h: { key: string; value: string }) =>
      h.key === "Vercel-CDN-Cache-Control" && h.value === "no-store"));
  }
});

test("macOS-only file watchers are optional so clean Linux installs can succeed", () => {
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  for (const [name, value] of Object.entries(lock.packages)) {
    if (!name.endsWith("/fsevents")) continue;
    const entry = value as { optional?: boolean; os?: string[] };
    assert.equal(entry.optional, true, name);
    assert.deepEqual(entry.os, ["darwin"], name);
  }
});

test("locked package downloads use public registries or GitHub, not workspace-only hosts", () => {
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  for (const [name, value] of Object.entries(lock.packages)) {
    const entry = value as { resolved?: string };
    if (!entry.resolved) continue;
    const url = new URL(entry.resolved);
    if (url.protocol.startsWith("git+")) {
      assert.equal(url.hostname, "github.com", name);
      continue;
    }
    assert.equal(url.protocol, "https:", name);
    assert.equal(url.hostname, "registry.npmjs.org", name);
  }
});