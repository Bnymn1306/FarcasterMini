---
name: Base catalog RPC reads
description: Reliable pattern for reading many known Base contracts without provider timeouts.
---

For a fixed onchain catalog, aggregate independent read-only checks through Base Multicall3 and cache the decoded snapshot briefly instead of issuing many concurrent JSON-RPC calls.

**Why:** Concurrent individual reads against the configured Base RPC repeatedly exceeded 60-second request budgets even though each single-contract read was healthy. One Multicall3 `eth_call` returned a same-block snapshot in about a second.

**How to apply:** Use this for catalog/status and portfolio fan-out reads. Keep fail-closed decoding per call, canonicalize documented addresses before ABI encoding, and retain direct reads for one-off quote preflights.