---
name: x402 Agent paid-action integrity
description: Rules that keep the Agent Hub x402 paid actions (boost/endorse) from being bypassed or abused.
---

# x402 Agent paid actions (Boost / Endorse / AI Signal)

Paid actions live on `/api/agents/:id/boost`, `/api/agents/:id/endorse`, `/api/trade/ai`, each wrapped in `createX402Middleware(...)`. The payer wallet is `req.x402Payment.payer` (typed `payer: string`).

## Integrity rules (must keep enforced)
- **No bypass via generic mutation.** `PATCH /api/agents/:id` must NOT accept reputation/boost/endorsement counters — whitelist profile fields only (name, bio, personality, isActive, metadataUri). Otherwise anyone sets `reputationScore`/`boostedUntil`/`totalEndorsements` for free, defeating the paid feature. The generic PATCH route has no client callers, so locking it down is safe.
- **Boost = owner only.** Boost compares `req.x402Payment.payer` (case-insensitive) to the target agent's `walletAddress`; reject otherwise ("Boost My Agent").
- **No self-endorse.** Endorse rejects when payer owns the target agent. Frontend already hides self, but the server check is the real guard.

**Why:** product promises "earned" reputation; without server-side authz the paid actions are cosmetic and trivially gamed.

## Featured placement must be wired, not just stored
- Writing `boostedUntil` is not enough. `getAllMemeAgents()` orders boosted-first via `sql\`CASE WHEN boostedUntil > now() THEN 1 ELSE 0 END DESC\`` then reputation. AgentCard shows an amber "Boosted" badge when `boostedUntil > now()`. If you add new agent list queries, replicate the boosted-first ordering or the 7-day feature silently disappears.
