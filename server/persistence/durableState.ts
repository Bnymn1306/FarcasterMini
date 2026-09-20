import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";

export type StateQuery = (sql: string, params: unknown[]) => Promise<Record<string, any>[]>;

// Match storage.ts. Never initialize schema or silently fall back to process memory.
export const queryState: StateQuery = async (sql, params) => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Durable state unavailable: DATABASE_URL is required");
  try {
    return await neon(url)(sql, params) as Record<string, any>[];
  } catch {
    throw new Error("Durable state unavailable; administrator must verify database and migration");
  }
};

export async function consumeSharedAskRequest(key: string, query: StateQuery = queryState): Promise<boolean> {
  const digest = createHash("sha256").update(key).digest("hex");
  // Retention is bounded per request; never remove an active one-minute window.
  await query(`DELETE FROM app_ask_rate_windows WHERE key_hash IN (
    SELECT key_hash FROM app_ask_rate_windows
    WHERE started_at < clock_timestamp() - interval '1 day'
    ORDER BY started_at LIMIT 100
  ) AND started_at < clock_timestamp() - interval '1 day'`, []);
  const rows = await query(`INSERT INTO app_ask_rate_windows (key_hash, started_at, request_count)
    VALUES ($1, clock_timestamp(), 1)
    ON CONFLICT (key_hash) DO UPDATE SET
      request_count = CASE WHEN app_ask_rate_windows.started_at <= clock_timestamp() - interval '60 seconds'
        THEN 1 ELSE LEAST(app_ask_rate_windows.request_count + 1, 11) END,
      started_at = CASE WHEN app_ask_rate_windows.started_at <= clock_timestamp() - interval '60 seconds'
        THEN clock_timestamp() ELSE app_ask_rate_windows.started_at END
    RETURNING request_count`, [digest]);
  if (rows.length !== 1) throw new Error("Durable rate limit unavailable");
  return Number(rows[0].request_count) <= 10;
}

export interface DepositReceipt {
  orderId: string;
  userWallet: string;
  inputMint: string;
  amount: bigint;
  signature: string;
}

export async function recordDepositReceipt(escrow: string, receipt: DepositReceipt, query: StateQuery = queryState): Promise<void> {
  if (!escrow || receipt.amount <= BigInt(0)) throw new Error("Invalid deposit receipt");
  const params = [escrow, receipt.orderId, receipt.signature, receipt.userWallet, receipt.inputMint, receipt.amount.toString()];
  const rows = await query(`INSERT INTO app_solana_deposit_receipts
    (escrow_address, order_id, deposit_signature, user_wallet, input_mint, amount)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT DO NOTHING RETURNING order_id`, params);
  if (rows.length === 1) return;
  // Idempotent verification only: must not reset a reservation or bind a signature to another order.
  const existing = await query(`SELECT order_id FROM app_solana_deposit_receipts
    WHERE escrow_address = $1 AND order_id = $2 AND deposit_signature = $3
      AND user_wallet = $4 AND input_mint = $5 AND amount = $6 AND state = 'verified'`, params);
  if (existing.length !== 1) throw new Error("Deposit already bound, reserved, or inconsistent; manual reconciliation required");
}

// Preparation primitive only. The legacy executor has no async order-scoped execution
// contract; it MUST NOT be enabled on Vercel until that integration is reviewed.
// Reservation is permanent unless an administrator reconciles chain evidence.
export async function reserveDeposit(escrow: string, orderId: string, query: StateQuery = queryState): Promise<DepositReceipt> {
  const rows = await query(`UPDATE app_solana_deposit_receipts
    SET state = 'reserved', reserved_at = clock_timestamp()
    WHERE escrow_address = $1 AND order_id = $2 AND state = 'verified'
    RETURNING order_id, user_wallet, input_mint, amount, deposit_signature`, [escrow, orderId]);
  if (rows.length !== 1) throw new Error("Deposit unavailable or already reserved; do not retry transfer");
  const row = rows[0];
  return { orderId: row.order_id, userWallet: row.user_wallet, inputMint: row.input_mint, amount: BigInt(row.amount), signature: row.deposit_signature };
}

export function requireLegacyDepositRuntime(): void {
  if (process.env.VERCEL) {
    throw new Error("Solana execution disabled on Vercel: durable order-scoped execution and transfer reconciliation required");
  }
}