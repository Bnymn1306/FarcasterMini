-- PROPOSAL ONLY. Never auto-applied. Review and install on the SAME database
-- as the order ledger. Use a direct/session-preserving PostgreSQL connection.
CREATE TABLE IF NOT EXISTS background_control (
  id integer PRIMARY KEY CHECK (id = 1),
  owner text NOT NULL CHECK (owner IN ('vm', 'workflow', 'disabled')),
  enabled boolean NOT NULL DEFAULT false,
  generation text,
  run_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO background_control(id, owner, enabled)
VALUES (1, 'disabled', false) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS background_claims (
  service text NOT NULL,
  subject text NOT NULL,
  action text NOT NULL,
  state text NOT NULL CHECK (state IN ('execution_unknown', 'confirmed', 'reconciled_no_send')),
  chain_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(service, subject, action)
);
-- No TTL, lease expiry, automatic claim reset, or automatic resend.
-- "confirmed" must only be written following independently verified finality.