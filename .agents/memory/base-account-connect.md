---
name: Connect Base Account (MCP tab)
description: Why the Coinbase OAuth popup approach was abandoned and what replaced it.
---

# Connect Base Account — no Coinbase OAuth

The "Connect Base Account" button in the AgentHub MCP tab creates an agent session
directly from the wallet already connected to BasedMem (POST /api/agent-sessions),
NOT via a Coinbase OAuth popup.

**Why:** Coinbase has disabled public OAuth2 client creation. Per docs.cdp.coinbase.com
(Coinbase App OAuth2 quickstart): "New OAuth client creation is temporarily disabled...
limited to approved partners... contact your Coinbase representative to request OAuth
whitelisting." It is also US-only and KYC-gated. A CDP_API_KEY_ID
(organizations/.../apiKeys/...) is a SERVER API key and is NOT a valid OAuth client_id —
passing it to login.coinbase.com/oauth2/auth fails with a generic error page.

**How to apply:** Do not re-add a Coinbase OAuth popup flow unless the user confirms they
have been whitelisted as a Coinbase partner and provides a real OAuth client_id +
client_secret. The correct endpoints (if ever whitelisted) are
https://login.coinbase.com/oauth2/auth and /oauth2/token (NOT keys.coinbase.com).

**Known pre-existing gap:** agent-session + agent-tx-proposal routes are unauthenticated
(any client can POST a walletAddress; GET returns session tokens by wallet). Real
transactions still require on-chain approval, but these routes should eventually be gated
behind SIWA signature verification.
