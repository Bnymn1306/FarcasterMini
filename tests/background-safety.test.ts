import test from "node:test";
import assert from "node:assert/strict";
import { configuredOwner, workflowActivationAllowed } from "../server/background/config";
import { lockedTick, claimSideEffect, type Session, type SessionPool } from "../server/background/ownership";
import { createBackgroundManagementHandler } from "../server/background/management";

function fakeDatabase() {
  let locked = false;
  const claims = new Set<string>();
  const control = { owner: "vm", enabled: true, generation: "g1" };
  let releases = 0;
  const pool: SessionPool = {
    async connect(): Promise<Session> {
      return {
        async query(sql, values = []) {
          if (sql.includes("pg_try_advisory_lock")) {
            const acquired = !locked;
            if (acquired) locked = true;
            return { rows: [{ acquired }] };
          }
          if (sql.includes("pg_advisory_unlock")) { locked = false; return { rows: [] }; }
          if (sql.startsWith("SELECT owner")) return { rows: [{ ...control }] };
          if (sql.includes("INSERT INTO background_claims")) {
            const key = values.slice(0, 3).join(":");
            if (!control.enabled || control.owner !== values[3] ||
              (values[3] === "workflow" && control.generation !== values[4]) || claims.has(key)) return { rows: [] };
            claims.add(key);
            return { rows: [{ subject: values[1] }] };
          }
          throw new Error(`Unexpected test query: ${sql}`);
        },
        release() { releases++; },
      };
    },
  };
  return { pool, control, claims, get releases() { return releases; } };
}

test("legacy default is VM-only, previews fail closed, activation cannot be enabled", () => {
  assert.equal(configuredOwner({}), "legacy");
  assert.equal(configuredOwner({ VERCEL: "1", VERCEL_ENV: "preview" }), "disabled");
  assert.equal(configuredOwner({ BACKGROUND_EXECUTION_OWNER: "typo" }), "disabled");
  assert.equal(configuredOwner({ BACKGROUND_EXECUTION_OWNER: "workflow" }), "workflow");
  assert.equal(workflowActivationAllowed(), false);
});

test("session lock spans the entire awaited tick and denies overlapping ticks", async () => {
  const db = fakeDatabase();
  let unblock!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => entered = resolve);
  const pending = lockedTick(db.pool, "base", "vm", async () => {
    entered();
    await new Promise<void>(resolve => unblock = resolve);
  });
  await started;
  let overlapped = false;
  await lockedTick(db.pool, "solana", "vm", async () => { overlapped = true; });
  assert.equal(overlapped, false);
  unblock();
  await pending;
  assert.equal(db.releases, 2);
});

test("unknown submission remains claimed after a failure; no blind resend", async () => {
  const db = fakeDatabase();
  let sends = 0;
  await assert.rejects(lockedTick(db.pool, "base", "vm", async () => {
    assert.equal(await claimSideEffect("order1", "swap"), true);
    sends++;
    throw new Error("send may have landed");
  }));
  await lockedTick(db.pool, "base", "vm", async () => {
    if (await claimSideEffect("order1", "swap")) sends++;
  });
  assert.equal(sends, 1);
  assert.equal(db.claims.size, 1);
});

test("stop and stale generations deny ticks; stop inside batch denies next claim", async () => {
  const db = fakeDatabase();
  db.control.enabled = false;
  await lockedTick(db.pool, "base", "vm", async () => assert.fail("stopped tick ran"));
  db.control.enabled = true;
  db.control.owner = "workflow";
  await lockedTick(db.pool, "base", "workflow", async () => assert.fail("stale generation ran"), "old");
  db.control.owner = "vm";
  await lockedTick(db.pool, "base", "vm", async () => {
    db.control.enabled = false;
    assert.equal(await claimSideEffect("order2", "swap"), false);
  });
});

test("missing schema fails closed and still releases the session", async () => {
  let released = false;
  const pool = { async connect() { return {
    async query(sql: string) {
      if (sql.includes("pg_try")) return { rows: [{ acquired: true }] };
      if (sql.includes("pg_advisory_unlock")) return { rows: [] };
      throw new Error("relation does not exist");
    }, release() { released = true; },
  }; } };
  await assert.rejects(lockedTick(pool, "base", "vm", async () => assert.fail("ran without schema")));
  assert.equal(released, true);
});

test("management denies preview/auth failures, hard-blocks start and persists stop", async () => {
  const old = { ...process.env };
  let stopped = false;
  let queries = 0;
  const handler = createBackgroundManagementHandler(() => ({
    query: async () => { queries++; stopped = true; return { rows: [{ id: 1 }] }; },
  }) as any);
  const request = (action: string, auth = true) => new Request("https://example.test/api/admin/background", {
    method: "POST", headers: { authorization: auth ? `Bearer ${"x".repeat(32)}` : "" },
    body: JSON.stringify({ action }),
  });
  try {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "preview";
    process.env.BACKGROUND_ADMIN_SECRET = "x".repeat(32);
    assert.equal((await handler(request("start"))).status, 403);
    process.env.VERCEL_ENV = "production";
    assert.equal((await handler(request("start", false))).status, 401);
    assert.equal((await handler(request("start"))).status, 409);
    assert.equal(queries, 0);
    assert.equal((await handler(request("stop"))).status, 200);
    assert.equal(stopped, true);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in old)) delete process.env[key];
    Object.assign(process.env, old);
  }
});

test("status is observational and a failed stop is explicitly unconfirmed", async () => {
  const keys = ["VERCEL", "VERCEL_ENV", "BACKGROUND_ADMIN_SECRET"] as const;
  const previous = keys.map(key => process.env[key]);
  try {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "production";
    process.env.BACKGROUND_ADMIN_SECRET = "x".repeat(32);
    const headers = { authorization: `Bearer ${"x".repeat(32)}` };
    const observed: string[] = [];
    const status = createBackgroundManagementHandler(() => ({
      query: async (sql: string) => {
        observed.push(sql);
        return { rows: [{ enabled: false, owner: "disabled", generation: null }] };
      },
    }) as any);
    const response = await status(new Request("https://example.test/api/admin/background", { headers }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).activationAllowed, false);
    assert.equal(observed.length, 1);
    assert.match(observed[0], /^SELECT /);
    const failedStop = createBackgroundManagementHandler(() => ({
      query: async () => { throw new Error("database offline"); },
    }) as any);
    const failed = await failedStop(new Request("https://example.test/api/admin/background", {
      method: "POST", headers, body: JSON.stringify({ action: "stop" }),
    }));
    assert.equal(failed.status, 503);
    assert.match((await failed.json()).error, /do not assume workers stopped/);
  } finally {
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
  }
});