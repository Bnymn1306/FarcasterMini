import assert from "node:assert/strict";
import test from "node:test";
import { consumeSharedAskRequest, recordDepositReceipt, reserveDeposit, requireLegacyDepositRuntime, type StateQuery } from "../server/persistence/durableState";
import { MAX_FRACTION_IMAGE_BYTES, uploadFractionBlob } from "../server/persistence/fractionUploads";
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

test("Blob uploads require store-scoped OIDC and propagate failure without filesystem fallback", async () => {
  const previous = process.env.FRACTION_UPLOAD_STORAGE;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const storeId = process.env.BLOB_STORE_ID;
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  const vercel = process.env.VERCEL;
  const vercelEnv = process.env.VERCEL_ENV;
  let calls = 0;
  const upload = (async () => { calls++; throw new Error("provider failure"); }) as any;
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);
  try {
    delete process.env.FRACTION_UPLOAD_STORAGE;
    await assert.rejects(uploadFractionBlob("x.png", png, "image/png", upload), /configure/);
    assert.equal(calls, 0);
    process.env.FRACTION_UPLOAD_STORAGE = "vercel-blob";
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "preview";
    await assert.rejects(uploadFractionBlob("x.png", png, "image/png", upload), /disabled outside Vercel Production/);
    assert.equal(calls, 0);
    process.env.VERCEL_ENV = "production";
    delete process.env.BLOB_STORE_ID;
    delete process.env.VERCEL_OIDC_TOKEN;
    process.env.BLOB_READ_WRITE_TOKEN = "legacy-token-must-not-enable-uploads";
    await assert.rejects(uploadFractionBlob("x.png", png, "image/png", upload), /OIDC credentials/);
    assert.equal(calls, 0);
    process.env.BLOB_STORE_ID = "store_test";
    process.env.VERCEL_OIDC_TOKEN = "oidc-test-only";
    await assert.rejects(uploadFractionBlob("x.png", png, "image/png", upload), /could not be persisted/);
    assert.equal(calls, 1);
    const url = await uploadFractionBlob("x.png", png, "image/png", (async (path: string, uploaded: unknown, options: any) => {
      assert.equal(path, "uploads/fractions/x.png");
      assert.equal(uploaded, png);
      assert.equal(options.access, "public");
      assert.equal(options.contentType, "image/png");
      assert.equal(options.storeId, "store_test");
      assert.equal(options.oidcToken, "oidc-test-only");
      assert.equal(options.token, undefined);
      return { url: "https://example.invalid/x.png" };
    }) as any);
    assert.equal(url, "https://example.invalid/x.png");
  } finally {
    if (previous === undefined) delete process.env.FRACTION_UPLOAD_STORAGE;
    else process.env.FRACTION_UPLOAD_STORAGE = previous;
    if (token === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = token;
    if (storeId === undefined) delete process.env.BLOB_STORE_ID;
    else process.env.BLOB_STORE_ID = storeId;
    if (oidcToken === undefined) delete process.env.VERCEL_OIDC_TOKEN;
    else process.env.VERCEL_OIDC_TOKEN = oidcToken;
    if (vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = vercel;
    if (vercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = vercelEnv;
  }
});

test("Blob uploads validate decoded size, MIME, extension, and magic bytes before persistence", async () => {
  const previous = {
    storage: process.env.FRACTION_UPLOAD_STORAGE,
    storeId: process.env.BLOB_STORE_ID,
    oidcToken: process.env.VERCEL_OIDC_TOKEN,
    vercel: process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV,
  };
  let calls = 0;
  const upload = (async () => {
    calls++;
    return { url: "https://example.invalid/unexpected" };
  }) as any;
  try {
    process.env.FRACTION_UPLOAD_STORAGE = "vercel-blob";
    process.env.BLOB_STORE_ID = "store_test";
    process.env.VERCEL_OIDC_TOKEN = "oidc-test-only";
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;

    await assert.rejects(uploadFractionBlob("x.svg", Buffer.from("<svg/>"), "image/svg+xml", upload), /not allowed/);
    await assert.rejects(uploadFractionBlob("x.jpg", Buffer.from("GIF89a"), "image/gif", upload), /extension/);
    await assert.rejects(uploadFractionBlob("x.png", Buffer.from("not a png"), "image/png", upload), /bytes do not match/);
    await assert.rejects(
      uploadFractionBlob("x.png", Buffer.alloc(MAX_FRACTION_IMAGE_BYTES + 1), "image/png", upload),
      /maximum decoded size/,
    );
    await assert.rejects(uploadFractionBlob("../x.png", Buffer.from("not a png"), "image/png", upload), /filename/);
    assert.equal(calls, 0);
  } finally {
    if (previous.storage === undefined) delete process.env.FRACTION_UPLOAD_STORAGE;
    else process.env.FRACTION_UPLOAD_STORAGE = previous.storage;
    if (previous.storeId === undefined) delete process.env.BLOB_STORE_ID;
    else process.env.BLOB_STORE_ID = previous.storeId;
    if (previous.oidcToken === undefined) delete process.env.VERCEL_OIDC_TOKEN;
    else process.env.VERCEL_OIDC_TOKEN = previous.oidcToken;
    if (previous.vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous.vercel;
    if (previous.vercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous.vercelEnv;
  }
});