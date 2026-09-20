import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createCachedHandler } from "../server/cached-handler";
import { normalizeCdpSecret } from "../server/normalize-cdp-secret";
import { apiErrorHandler } from "../server/app";
import { isStandaloneEnvironmentAllowed } from "../server/vercel";

const request = {} as IncomingMessage;
function response() {
  const state = {
    statusCode: 200, headersSent: false, writableEnded: false, body: "",
    headers: {} as Record<string, string>,
    setHeader(key: string, value: string) { this.headers[key] = value; },
    end(body = "") { this.body = body; this.writableEnded = true; },
  };
  return { state, res: state as unknown as ServerResponse };
}

test("concurrent requests share a single cold-start initialization", async () => {
  let loads = 0;
  let requests = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const handler = createCachedHandler(async () => {
    loads++;
    await barrier;
    return (_req, res) => { requests++; res.end("ok"); };
  });
  const first = handler(request, response().res);
  const second = handler(request, response().res);
  await Promise.resolve();
  assert.equal(loads, 1);
  release();
  await Promise.all([first, second]);
  assert.equal(requests, 2);
});

test("failed initialization returns sanitized 503 and retries next request", async () => {
  let loads = 0;
  const handler = createCachedHandler(async () => {
    if (++loads === 1) throw new Error("sensitive connection details");
    return (_req, res) => res.end("ready");
  });
  const failed = response();
  await handler(request, failed.res);
  assert.equal(failed.state.statusCode, 503);
  assert.equal(failed.state.body.includes("sensitive"), false);
  const retry = response();
  await handler(request, retry.res);
  assert.equal(retry.state.body, "ready");
  assert.equal(loads, 2);
});

test("preview, development and unknown environments fail closed", () => {
  for (const VERCEL_ENV of [undefined, "preview", "development", "unknown"]) {
    assert.equal(isStandaloneEnvironmentAllowed({ VERCEL_ENV }), false);
    assert.equal(isStandaloneEnvironmentAllowed({ VERCEL_ENV, VERCEL_PREVIEW_ISOLATED: "1" }), false);
    assert.equal(isStandaloneEnvironmentAllowed({ VERCEL_ENV, VERCEL_PREVIEW_ISOLATED: "true" }), true);
  }
  assert.equal(isStandaloneEnvironmentAllowed({ VERCEL_ENV: "production" }), false);
  assert.equal(isStandaloneEnvironmentAllowed({ VERCEL_ENV: "production", VERCEL_PREVIEW_ISOLATED: "true" }), false);
  assert.equal(isStandaloneEnvironmentAllowed({ VERCEL_ENV: "production", VERCEL_BACKEND_CUTOVER_APPROVED: "true" }), true);
});

test("preview cold start serves its denial without DB, credentials, listeners or intervals", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    globalThis.setInterval = () => { throw new Error("Unexpected interval"); };
    const { default: handler } = await import("./server/vercel.ts");
    const response = {
      statusCode: 200,
      setHeader() {},
      end(body) { console.log(JSON.stringify({ status: this.statusCode, body })); }
    };
    await handler({}, response);
  `], {
    cwd: new URL("..", import.meta.url),
    env: { NODE_ENV: "production", VERCEL_ENV: "preview" },
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.equal(result.status, 0, result.stderr);
  const denied = JSON.parse(result.stdout.trim());
  assert.equal(denied.status, 503);
  assert.match(denied.body, /isolated environment approval required/);
});

test("static signed manifest matches the canonical dynamic manifest", () => {
  const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  const generator = routes.match(/const generateManifest = \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(generator);
  const canonical = runInNewContext(`(() => {${generator[1]}})()`, {}, { timeout: 1000 });
  const manifest = JSON.parse(readFileSync(new URL("../public/.well-known/farcaster.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest, JSON.parse(JSON.stringify(canonical)));
});

test("Vercel monitor requests cannot start persistent polling", () => {
  const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  for (const endpoint of ["start", "monitor"]) {
    const start = routes.indexOf(`app.post("/api/rugpull-detector/${endpoint}"`);
    const body = routes.slice(start, routes.indexOf("\n  });", start));
    assert.match(body, /if \(process.env.VERCEL \|\| process.env.VERCEL_ENV\)/);
    assert.ok(body.indexOf("return res.status(503)") < body.indexOf("rugpullDetector.start()"));
  }
});

test("CDP normalization handles synthetic SEC1/base64 and preserves Ed25519", () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = privateKey.export({ format: "pem", type: "sec1" }).toString();
  const env = { CDP_API_KEY_SECRET: Buffer.from(pem).toString("base64") };
  normalizeCdpSecret(env);
  assert.match(env.CDP_API_KEY_SECRET, /^-----BEGIN PRIVATE KEY-----/);
  const normalized = env.CDP_API_KEY_SECRET;
  normalizeCdpSecret(env);
  assert.equal(env.CDP_API_KEY_SECRET, normalized);
  const ed25519 = { CDP_API_KEY_SECRET: Buffer.alloc(32, 42).toString("base64") };
  const original = ed25519.CDP_API_KEY_SECRET;
  normalizeCdpSecret(ed25519);
  assert.equal(ed25519.CDP_API_KEY_SECRET, original);
});

test("error middleware does not throw after sending and forwards already-sent errors", () => {
  let sent: unknown;
  const res = {
    headersSent: false,
    status(code: number) { assert.equal(code, 500); return this; },
    json(body: unknown) { sent = body; },
  };
  let forwarded = false;
  apiErrorHandler(new Error("private"), {} as any, res as any, () => { forwarded = true; });
  assert.deepEqual(sent, { message: "Internal Server Error" });
  assert.equal(forwarded, false);
  res.headersSent = true;
  apiErrorHandler(new Error("private"), {} as any, res as any, () => { forwarded = true; });
  assert.equal(forwarded, true);
});

test("API import path excludes the Replit lifecycle and dynamically loads routes", () => {
  const app = readFileSync(new URL("../server/app.ts", import.meta.url), "utf8");
  const entry = readFileSync(new URL("../server/vercel.ts", import.meta.url), "utf8");
  for (const source of [app, entry]) {
    assert.doesNotMatch(source, /from ["'].*(?:vite|Executor|bootstrap|storage)["']/);
    assert.doesNotMatch(source, /setInterval\(|\.listen\(|seedPlatformToken/);
  }
  assert.ok(app.indexOf("normalizeCdpSecret();") < app.indexOf('await import("./routes")'));
  assert.match(entry, /await import\("\.\/app"\)/);
});

test("full build keeps generated workflow routes and protects backend paths from SPA fallback", () => {
  const script = readFileSync(new URL("../scripts/build-vercel-full.mjs", import.meta.url), "utf8");
  const source = script.match(/src: (".*"),/)?.[1];
  assert.ok(source);
  const fallback = new RegExp(`^${JSON.parse(source)}$`);
  for (const url of ["/api", "/api/health", "/mcp", "/frame/one", "/token-logo/one",
    "/.well-known/workflow/v1/step", "/.well-known/farcaster.json", "/assets/missing.js", "/_workflow/foo"]) {
    assert.equal(fallback.test(url), false, url);
  }
  assert.equal(fallback.test("/swap"), true);
  assert.match(script, /config\.routes\.splice\(filesystem \+ 1, 0/);
  const nitro = readFileSync(new URL("../nitro.config.ts", import.meta.url), "utf8");
  assert.match(nitro, /modules: \["workflow\/nitro"\]/);
  assert.match(nitro, /entryFormat: "node"/);
  assert.match(nitro, /handler: "\.\/server\/vercel\.ts", format: "node"/);
});

const builtEntry = new URL("../.vercel/output/functions/__server.func/index.mjs", import.meta.url);
test("built Nitro handler denies unapproved preview and production without credentials or startup work",
  { skip: !existsSync(builtEntry) }, () => {
  const code = `
    import { IncomingMessage, ServerResponse } from "node:http";
    import { Socket } from "node:net";
    globalThis.setInterval = () => { throw new Error("Unexpected interval"); };
    const { default: handler } = await import("./.vercel/output/functions/__server.func/index.mjs");
    const req = new IncomingMessage(new Socket());
    req.url = "/api/health"; req.method = "GET"; req.headers = { host: "isolated.invalid" };
    const res = new ServerResponse(req);
    res.end = (body, encoding, callback) => {
      if (typeof body === "function") body();
      else if (body !== undefined) console.log(JSON.stringify({ status: res.statusCode, body: String(body) }));
      if (typeof encoding === "function") encoding();
      if (typeof callback === "function") callback();
      res.emit("finish");
      return res;
    };
    await handler(req, res);
  `;
  for (const VERCEL_ENV of ["preview", "production"]) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
      cwd: new URL("..", import.meta.url),
      env: { NODE_ENV: "production", VERCEL_ENV },
      encoding: "utf8", timeout: 15_000,
    });
    assert.equal(result.status, 0, result.stderr);
    const denied = JSON.parse(result.stdout.trim());
    assert.equal(denied.status, 503);
    assert.match(denied.body, /Standalone API disabled/);
  }
});

test("generated output contains matching static manifest and preserves Workflow functions",
  { skip: !existsSync(builtEntry) }, () => {
  const root = new URL("../.vercel/output/", import.meta.url);
  const config = JSON.parse(readFileSync(new URL("config.json", root), "utf8"));
  const fsIndex = config.routes.findIndex((route: any) => route.handle === "filesystem");
  assert.ok(fsIndex > 0);
  assert.equal(config.routes[fsIndex + 1].dest, "/index.html");
  assert.equal(config.routes.at(-1).dest, "/__server");
  for (const name of ["flow", "step", "webhook/[token]"]) {
    assert.ok(existsSync(new URL(`functions/.well-known/workflow/v1/${name}.func/.vc-config.json`, root)));
  }
  assert.ok(existsSync(new URL("static/index.html", root)));
  assert.deepEqual(
    JSON.parse(readFileSync(new URL("static/.well-known/farcaster.json", root), "utf8")),
    JSON.parse(readFileSync(new URL("../public/.well-known/farcaster.json", import.meta.url), "utf8")),
  );
});