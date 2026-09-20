# Background preparation — NOT activation-ready

No jobs are started by these modules. Activation is hard-disabled in code, even
with all environment variables set. Management `start` always returns HTTP 409.
No schema was applied. This is not an exactly-once execution implementation.

## Surface and current services

Forward Web `Request` to `handleBackgroundManagement` from
`server/background/management.ts` at `/api/admin/background`: GET observes DB
control state, POST accepts `{ "action": "stop" }` or `"start"`. All methods
require Vercel production and an exact bearer `BACKGROUND_ADMIN_SECRET` (at
least 32 characters). GET performs no transaction, lock, wallet or chain call.
Readiness errors return 503, never a fabricated healthy result.

Startup currently starts Base, Solana, Soneium, Ink limit orders and rug
protection. Alerts are imported but not started; do not silently enable them.
Executors expose `tick()` without starting intervals. Rug's tick only
synchronizes protections; its process-local detector is NOT a durable tick.

`workflows/background.ts` exports `backgroundGeneration`; the SDK loop uses
`sleep("30s")`, capped at 120 iterations. `workflowTick.maxRetries = 0`, per
Workflow SDK's official Errors & Retrying documentation (default is three).
Imports that construct storage/wallets are below the hard activation gate.

## Ownership and safety limits

Unset `BACKGROUND_EXECUTION_OWNER` on a non-Vercel VM preserves legacy behavior,
including its existing limitations. It does not gain distributed protection.
Explicit `vm` uses a single session advisory lock for each complete tick plus
an atomic insert into the durable claim ledger before a side effect. All
participants must be configured before this can prevent overlap. A still
unconfigured legacy VM bypasses these protections.

Explicit `workflow` denies VM ticks; disabled/invalid ownership denies all.
Vercel never defaults to legacy. Schema/connection failure fails closed in
configured mode. `DATABASE_URL` matches DBStorage; do not point control/claims
at a separate `NEON_DATABASE_URL`. `BACKGROUND_DB_SESSION_LOCKS_CONFIRMED=true`
requires operator verification that the connection preserves PostgreSQL
sessions (not transaction pooling).

Claims are conservatively recorded as `execution_unknown` BEFORE submission.
They never expire or retry, even if a process crashes before sending. A return
value or logged signature does not establish finality. Configured-mode Solana
transfer retries and rug callbacks are intentionally held. Losing a DB session
releases its lock while a remote send might still finish: the permanent claim
blocks resend of that subject, but this is not absolute cross-chain fencing.
Never represent it as exactly once.

## Required before any activation

1. Install/review the additive SQL proposal on the actual order database and
   verify session-preserving connections. Reconcile already-executing,
   transfer_pending and failed orders against authoritative chain receipts.
2. Give every Solana swap AND output transfer durable separate intent identity;
   persist intended transaction/signature before send, validate deposit
   ownership and consumption atomically, then query finalized chain state.
   Resolve send-timeout/swap-success/transfer-unknown cases without blind retry.
   The existing executeSwap API lacks order identity and cannot prove this.
3. Audit Base/Soneium/Ink and rug send/wait/catch paths; distinguish definitely
   not sent, reverted, pending, finalized and unknown. Store and independently
   verify chain references. Never reset a claim solely after a timeout.
4. Replace rug's in-memory detector loop/state and callback registration with
   durable one-shot polling, shared ownership gating and per-protection claims.
5. Add submission fault-injection tests (crash before/after send and DB write,
   duplicate deliveries, connection loss, chain finality and transfer recovery).
   Current stub tests cover the control/claim boundary, not chain correctness.
6. Implement reviewed management start/generation reservation and run-ID
   persistence. A queue-start timeout is itself ambiguous; do not automatically
   enqueue a second run. Start is deliberately NOT implemented today.

## Reviewed cutover sequence (future)

First stop and drain legacy VM workers and any outstanding sends; inventory
and reconcile claims/orders. Configure ALL VM executors to deny ownership
before enabling a durable owner. Do not claim an atomic handoff from an
unconfigured VM. Database control starts disabled by default.

After audit and code review remove the hard blocker, enable a new unique DB
generation, then enqueue that exact generation and persist its run ID. Workflow
runs are deployment-pinned: do not expect redeployment to upgrade a running
generation. On deploy, persist stop (invalidates generation), wait for old
in-flight work to settle and reconcile it, then start a new generation on the
reviewed deployment. Bounded generations do not auto-restart.

Stop is cooperative: it prevents future ticks/claims, not a send already in
flight or between its last control check and submission. A 503 stop response
means stop is unconfirmed. SDK cancellation alone is not a transaction rollback.