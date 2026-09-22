import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/audit-migration-env.mjs", import.meta.url));
const fixture = Object.fromEntries([
  "DATABASE_URL", "EXA_API_KEY", "BASE_RPC_URL", "VITE_BASE_RPC_URL",
  "FRACTION_UPLOAD_STORAGE", "BLOB_STORE_ID", "VERCEL_OIDC_TOKEN",
].map(key => [key, "test-value-never-print"]));

test("runtime audit accepts OIDC configuration without a legacy Blob token and prints no values", () => {
  const result = spawnSync(process.execPath, [script, "--readiness"], { env: fixture, encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /BLOB_STORE_ID=true/);
  assert.match(result.stdout, /VERCEL_OIDC_TOKEN=true/);
  assert.match(result.stdout, /REQUIRED_ENV_PRESENT=true/);
  assert.doesNotMatch(result.stdout + result.stderr, /test-value-never-print/);
});

test("legacy Blob token cannot replace missing managed OIDC credentials", () => {
  const { VERCEL_OIDC_TOKEN: _ignored, ...withoutOidc } = fixture;
  const result = spawnSync(process.execPath, [script, "--readiness"], {
    env: { ...withoutOidc, BLOB_READ_WRITE_TOKEN: "legacy-value-never-print" },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /VERCEL_OIDC_TOKEN=false/);
  assert.match(result.stdout, /REQUIRED_ENV_PRESENT=false/);
  assert.doesNotMatch(result.stdout + result.stderr, /legacy-value-never-print/);
});