-- PROPOSAL ONLY: administrator-reviewed, manually applied migration.
-- Never execute at application startup. Use the SAME DATABASE_URL as storage.ts.
-- Before enabling any Solana execution, import/reconcile historical deposits,
-- order/signature bindings, fills, refunds, and transfer_pending outcomes against
-- chain evidence. Missing/ambiguous records MUST NOT be treated as spendable.
-- Existing public/uploads/fractions assets need a separate Blob copy + URL
-- backfill, or continued serving from their original static origin.
BEGIN;
CREATE TABLE IF NOT EXISTS app_ask_rate_windows (
  key_hash text PRIMARY KEY,
  started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count BETWEEN 1 AND 11)
);
CREATE INDEX IF NOT EXISTS app_ask_rate_windows_started_at ON app_ask_rate_windows (started_at);
CREATE TABLE IF NOT EXISTS app_solana_deposit_receipts (
  escrow_address text NOT NULL,
  order_id text NOT NULL,
  deposit_signature text NOT NULL,
  user_wallet text NOT NULL,
  input_mint text NOT NULL,
  amount numeric(78, 0) NOT NULL CHECK (amount > 0),
  state text NOT NULL DEFAULT 'verified' CHECK (state IN ('verified', 'reserved', 'completed', 'reconciliation_required')),
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reserved_at timestamptz,
  execution_signature text,
  PRIMARY KEY (escrow_address, order_id),
  UNIQUE (deposit_signature)
);
COMMIT;