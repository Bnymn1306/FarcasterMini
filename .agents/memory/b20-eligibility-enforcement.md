---
name: B20 eligibility enforcement
description: Compliance boundary for direct tokenized-stock venue execution when no off-chain eligibility API exists.
---

For direct B20 venue routes, never bypass or replace issuer restrictions. Treat the B20 token's on-chain transfer controls as the authoritative wallet eligibility check when the documented venue provides no separate KYC or jurisdiction API. Require an explicit user jurisdiction acknowledgement, then issue a fresh quote and simulate the exact transaction after bounded approval; do not permit submission if issuer enforcement rejects it.

**Why:** Public DEX liquidity can quote before issuer eligibility is known. The post-approval exact simulation is the available fail-closed enforcement point, while the user acknowledgement communicates the Regulation S jurisdiction requirement.

**How to apply:** Keep routes restricted to reviewed venue pools and exact USDC inputs. If an issuer or venue later exposes an official eligibility API, add it before quoting and retain on-chain simulation as a second control.

Chainlink stock feeds are research/reference data, not the execution price or wallet-eligibility authority. A delayed reference feed may show a warning but must not by itself block a fresh quote from a reviewed Aerodrome pool.

**Why:** Stock reference feeds pause outside market hours while Base/Aerodrome pools remain tradable. Blocking on reference freshness made valid venue trades unavailable even though the live pool quote and issuer controls still worked.

**How to apply:** Keep invalid token status, unreviewed/mismatched pools, non-positive quotes, and failed exact transaction simulations fail-closed. Label delayed Chainlink observations as reference-only and use the fresh venue quote for execution.