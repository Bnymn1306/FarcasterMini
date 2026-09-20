import assert from "node:assert/strict";
import test from "node:test";
import { consumeSharedAskRequest, recordDepositReceipt, reserveDeposit, requireLegacyDepositRuntime, type StateQuery } from "../server/persistence/durableState";
import { uploadFractionBlob } from "../server/persistence/fractionUploads";
import { SolanaEscrowService } from "../server/solanaEscrow";

test("all irreversible Solana entry points reject Vercel before accessing wallet, network or memory", async () => {
  const previous = process.env.VERCEL;
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  // Bypass constructor: no wallet generation, RPC setup, or secret reads.
  const inaccessibleState = new Proxy({} as SolanaEscrowService, {
    get() { throw new Error("Guard accessed instance state"); },
    set() { throw new Error("Guard mutated instance state"); },
  });
  try {
    process.env.VERCEL = "1";
    globalThis.fetch = (async () => {
      networkCalls++;
      throw new Error("Network forbidden in test");
    }) as typeof fetch;
    const results = [
      await SolanaEscrowService.prototype.executeSwap.call(inaccessibleState, "invalid", "invalid", "invalid", "invalid"),
      await SolanaEscrowService.prototype.transferTokenToUser.call(inaccessibleState, "invalid", "invalid", "invalid"),
      await SolanaEscrowService.prototype.refundToUser.call(inaccessibleState, "invalid", "invalid", "invalid"),
    ];
    for (const result of results) {
      assert.equal(result.success, false);
      assert.match(result.error!, /disabled on Vercel.*reconciliation.*do not retry automatically/);
    }
    assert.equal(networkCalls, 0);
    delete process.env.VERCEL;
    // Existing VM no-wallet responses remain unchanged, without any network activity.
    const noWallet = Object.create(SolanaEscrowService.prototype);
    assert.deepEqual(await noWallet.executeSwap("", "", "", ""), { success: false, error: "Escrow wallet not initialized" });
    assert.deepEqual(await noWallet.transferTokenToUser("", "", ""), { success: false, error: "Escrow wallet not initialized" });
    assert.deepEqual(await noWallet.refundToUser("", "", ""), { success: false, error: "Escrow wallet not initialized" });
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});

test("shared limiter uses hashed keys, bounded cleanup and atomic database windows", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query: StateQuery = async (sql, params) => {
    calls.push({ sql, params });
    return sql.includes("RETURNING") ? [{ request_count: 10 }] : [];
  };
  assert.equal(await consumeSharedAskRequest("client-ip", query), true);
  assert.match(calls[0].sql, /LIMIT 100/);
  assert.match(calls[1].sql, /ON CONFLICT.*DO UPDATE/s);
  assert.match(calls[1].sql, /clock_timestamp/);
  assert.notEqual(calls[1].params[0], "client-ip");
  assert.equal(await consumeSharedAskRequest("client-ip", async sql => sql.includes("RETURNING") ? [{ request_count: 11 }] : []), false);
  await assert.rejects(consumeSharedAskRequest("client-ip", async () => { throw new Error("offline"); }), /offline/);
  await assert.rejects(consumeSharedAskRequest("client-ip", async () => []), /unavailable/);
});

const receipt = { orderId: "order", userWallet: "wallet", inputMint: "mint", amount: 10n, signature: "sig" };
test("deposit receipt conflicts never reset a reservation", async () => {
  await recordDepositReceipt("escrow", receipt, async () => [{ order_id: "order" }]);
  const statements: string[] = [];
  await assert.rejects(recordDepositReceipt("escrow", receipt, async sql => {
    statements.push(sql);
    return [];
  }), /manual reconciliation/);
  assert.match(statements[0], /ON CONFLICT DO NOTHING/);
  assert.match(statements[1], /state = 'verified'/);
  assert.ok(statements.every(sql => !sql.includes("DO UPDATE")));
  await assert.rejects(recordDepositReceipt("escrow", receipt, async () => { throw new Error("offline"); }), /offline/);
});

test("reservation atomically consumes verified state and cannot auto retry", async () => {
  let available = true;
  const query: StateQuery = async sql => {
    assert.match(sql, /UPDATE.*state = 'reserved'.*state = 'verified'/s);
    if (!available) return [];
    available = false;
    return [{ order_id: "order", user_wallet: "wallet", input_mint: "mint", amount: "10", deposit_signature: "sig" }];
  };
  const outcomes = await Promise.allSettled([reserveDeposit("escrow", "order", query), reserveDeposit("escrow", "order", query)]);
  assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(x => x.status === "rejected").length, 1);
});

test("Vercel legacy deposit guards fail closed without changing VM behavior", () => {
  const previous = process.env.VERCEL;
  try {
    delete process.env.VERCEL;
    assert.doesNotThrow(requireLegacyDepositRuntime);
    process.env.VERCEL = "1";
    assert.throws(requireLegacyDepositRuntime, /execution disabled/);
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});

test("Blob uploads require explicit configuration and propagate failure without filesystem fallback", async () => {
  const previous = process.env.FRACTION_UPLOAD_STORAGE;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  let calls = 0;
  const upload = (async () => { calls++; throw new Error("provider failure"); }) as any;
  try {
    delete process.env.FRACTION_UPLOAD_STORAGE;
    await assert.rejects(uploadFractionBlob("x.png", Buffer.from("image"), "image/png", upload), /configure/);
    assert.equal(calls, 0);
    process.env.FRACTION_UPLOAD_STORAGE = "vercel-blob";
    process.env.BLOB_READ_WRITE_TOKEN = "test-only-not-a-secret";
    await assert.rejects(uploadFractionBlob("x.png", Buffer.from("image"), "image/png", upload), /could not be persisted/);
    assert.equal(calls, 1);
    const url = await uploadFractionBlob("x.png", Buffer.from("image"), "image/png", (async (path: string, _bytes: unknown, options: any) => {
      assert.equal(path, "uploads/fractions/x.png");
      assert.equal(options.access, "public");
      return { url: "https://example.invalid/x.png" };
    }) as any);
    assert.equal(url, "https://example.invalid/x.png");
  } finally {
    if (previous === undefined) delete process.env.FRACTION_UPLOAD_STORAGE;
    else process.env.FRACTION_UPLOAD_STORAGE = previous;
    if (token === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = token;
  }
});