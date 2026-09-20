---
name: Base RPC endpoint choice
description: Why base.llamarpc.com must not be used as the Base RPC, and what to use instead.
---

# Base RPC — do NOT use base.llamarpc.com

Always use `https://mainnet.base.org` as the Base mainnet RPC for client-side
wallet config and read-only calls.

**Why:** `https://base.llamarpc.com` intermittently returns Cloudflare error pages
(HTTP 403 / 526 with an HTML body). When the app passes it to the wallet via
`wallet_addEthereumChain` (rpcUrls), the wallet uses it for gas estimation and
`eth_sendTransaction`. A 403/526 surfaces to ethers as an error like
`403: <!doctype html>...403`, which broke ERC-8004 agent minting ("Quick Mint")
and any other write tx — the on-chain step fails before the backend POST even runs.
Separately, llamarpc has also been observed lagging hundreds of thousands of blocks
behind (stale reads).

**How to apply:** Keep `BASE_RPC_URL` in client/src/contexts/WalletContext.tsx and
the Base `rpcUrl` in client/src/contexts/ChainContext.tsx pointed at
mainnet.base.org. If a more robust endpoint is ever needed, use the BASE_RPC_URL
secret / a paid provider — never llamarpc.
