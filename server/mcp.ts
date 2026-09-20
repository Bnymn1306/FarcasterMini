import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { Router, type Request, type Response } from "express";
import { storage } from "./storage.js";

const BASEDMEM_URL = process.env.REPLIT_DEPLOYMENT_URL || "https://basedmem.xyz";

// ── DEXScreener price helper ───────────────────────────────────────────────
async function fetchTokenPrice(address: string): Promise<{ price: number | null; liquidity: number | null; chain: string }> {
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${address}`;
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { price: null, liquidity: null, chain: "base" };
    const data = await res.json() as any;
    const pairs = data?.pairs ?? [];
    if (pairs.length === 0) return { price: null, liquidity: null, chain: "base" };
    const best = pairs.sort((a: any, b: any) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    return {
      price: parseFloat(best.priceUsd ?? "0") || null,
      liquidity: best.liquidity?.usd ?? null,
      chain: best.chainId ?? "base",
    };
  } catch {
    return { price: null, liquidity: null, chain: "base" };
  }
}

// ── 0x Quote helper ────────────────────────────────────────────────────────
async function fetch0xQuote(sellToken: string, buyToken: string, sellAmountWei: string): Promise<any> {
  try {
    const apiKey = process.env.OX_API_KEY ?? "";
    const params = new URLSearchParams({ sellToken, buyToken, sellAmount: sellAmountWei, chainId: "8453" });
    const res = await fetch(`https://api.0x.org/swap/permit2/price?${params}`, {
      headers: { "0x-api-key": apiKey, "0x-version": "v2", Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Build a fresh MCP server for each request (stateless) ─────────────────
function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: "basedmem",
    version: "1.0.0",
  });

  // ── TOOL: search_tokens ─────────────────────────────────────────────────
  server.tool(
    "search_tokens",
    "Search for tokens on BasedMem by name or symbol. Returns tokens launched on the platform plus live price data.",
    {
      query: z.string().describe("Token name or symbol to search for (e.g. 'PEPE', 'BMEM', 'doge')"),
      limit: z.number().int().min(1).max(50).optional().default(10).describe("Max results (default 10)"),
    },
    async ({ query, limit }) => {
      const tokens = await storage.getAllTokens();
      const q = query.toLowerCase();
      const matches = tokens
        .filter(t => t.name?.toLowerCase().includes(q) || t.symbol?.toLowerCase().includes(q))
        .slice(0, limit ?? 10);
      if (matches.length === 0) {
        return { content: [{ type: "text", text: `No tokens found matching "${query}" on BasedMem.` }] };
      }
      const lines = matches.map(t =>
        `• **${t.symbol}** — ${t.name}\n  Address: ${t.contractAddress ?? "not deployed"}\n  Creator: ${t.creatorId ?? "unknown"}`
      );
      return {
        content: [{
          type: "text",
          text: `Found ${matches.length} token(s) matching "${query}" on BasedMem:\n\n${lines.join("\n\n")}`,
        }],
      };
    }
  );

  // ── TOOL: get_token_price ───────────────────────────────────────────────
  server.tool(
    "get_token_price",
    "Get the current USD price, liquidity, and 24h data for any Base token by its contract address.",
    {
      address: z.string().describe("Token contract address on Base (0x...)"),
    },
    async ({ address }) => {
      const { price, liquidity, chain } = await fetchTokenPrice(address);
      if (price === null) {
        return { content: [{ type: "text", text: `No price data found for ${address}. The token may have no liquidity or may not exist on Base.` }] };
      }
      return {
        content: [{
          type: "text",
          text: `Token: ${address}\nChain: ${chain}\nPrice: $${price}\nLiquidity: ${liquidity !== null ? "$" + liquidity.toLocaleString() : "N/A"}\n\nView on DexScreener: https://dexscreener.com/base/${address}`,
        }],
      };
    }
  );

  // ── TOOL: get_platform_stats ────────────────────────────────────────────
  server.tool(
    "get_platform_stats",
    "Get high-level statistics about the BasedMem platform — total tokens, agents, active limit orders, and fraction collections.",
    {},
    async () => {
      const [tokens, agents, orders, collections] = await Promise.all([
        storage.getAllTokens(),
        storage.getAllMemeAgents(),
        storage.getPendingLimitOrders(),
        storage.getAllFractionCollections(),
      ]);
      return {
        content: [{
          type: "text",
          text: [
            "BasedMem Platform Stats",
            "========================",
            `Tokens launched: ${tokens.length}`,
            `Agents registered: ${agents.length}`,
            `Active limit orders: ${orders.length}`,
            `Fraction collections: ${collections.length}`,
            `Platform URL: ${BASEDMEM_URL}`,
            `Chain: Base (Coinbase L2, chainId 8453)`,
          ].join("\n"),
        }],
      };
    }
  );

  // ── TOOL: get_fraction_collections ──────────────────────────────────────
  server.tool(
    "get_fraction_collections",
    "Browse Memetic Fractions collections on BasedMem. Each collection has 1M fractional shares. Tier system: Bronze (1–999), Silver (1K–9.9K), Gold (10K–99.9K), Legendary (100K–999.9K), Whale (1M = full NFT).",
    {
      limit: z.number().int().min(1).max(50).optional().default(10).describe("Max collections to return"),
    },
    async ({ limit }) => {
      const collections = await storage.getAllFractionCollections();
      const list = collections.slice(0, limit ?? 10);
      if (list.length === 0) {
        return { content: [{ type: "text", text: "No fraction collections found on BasedMem." }] };
      }
      const lines = list.map(c =>
        `• **${c.name}** (ID: ${c.id})\n  Symbol: ${c.symbol ?? "N/A"} | Total Supply: ${(1_000_000).toLocaleString()} fractions\n  Price per fraction: ${c.pricePerFraction ?? "N/A"} ETH\n  Creator: ${c.creatorWalletAddress ?? "platform"}`
      );
      return {
        content: [{
          type: "text",
          text: `${list.length} Memetic Fraction Collection(s) on BasedMem:\n\n${lines.join("\n\n")}\n\nBuy, gamble, and trade fractions at ${BASEDMEM_URL}/fractions`,
        }],
      };
    }
  );

  // ── TOOL: get_agents ────────────────────────────────────────────────────
  server.tool(
    "get_agents",
    "Browse Agent Hub on BasedMem. Agents are real ERC-8004 on-chain identities registered on Base mainnet. Each agent has personality (analyst, shiller, degen, whale, sniper), reputation, and can accept service requests.",
    {
      personality: z.enum(["analyst", "shiller", "degen", "whale", "sniper", "all"]).optional().default("all").describe("Filter by personality type"),
      limit: z.number().int().min(1).max(50).optional().default(10).describe("Max agents to return"),
    },
    async ({ personality, limit }) => {
      let agents = await storage.getAllMemeAgents();
      if (personality && personality !== "all") {
        agents = agents.filter(a => a.personality === personality);
      }
      agents = agents.slice(0, limit ?? 10);
      if (agents.length === 0) {
        return { content: [{ type: "text", text: "No agents found." }] };
      }
      const lines = agents.map(a => {
        const onChain = /^\d+$/.test(a.agentId) ? `On-Chain #${a.agentId} (8004scan.io)` : "Local only";
        return `• **${a.name}** [${a.personality}]\n  ID: ${a.agentId} | Reputation: ${a.reputationScore}/100 | ${onChain}\n  Bio: ${a.bio ?? "No bio"}`;
      });
      return {
        content: [{
          type: "text",
          text: `${agents.length} Agent(s) on BasedMem Agent Hub:\n\n${lines.join("\n\n")}\n\nView all agents: ${BASEDMEM_URL}/agents`,
        }],
      };
    }
  );

  // ── TOOL: get_portfolio ─────────────────────────────────────────────────
  server.tool(
    "get_portfolio",
    "Get the BasedMem platform token holdings for a wallet address (tokens launched and traded on BasedMem's bonding curve).",
    {
      wallet_address: z.string().describe("Ethereum wallet address (0x...)"),
    },
    async ({ wallet_address }) => {
      const user = await storage.getUserByWalletAddress(wallet_address.toLowerCase());
      if (!user) {
        return { content: [{ type: "text", text: `No BasedMem account found for ${wallet_address}. The wallet may not have traded on BasedMem yet.` }] };
      }
      const holdings = await storage.getHoldingsByUser(user.id);
      if (holdings.length === 0) {
        return { content: [{ type: "text", text: `No token holdings found for ${wallet_address} on BasedMem.` }] };
      }
      const lines = holdings.map(h =>
        `• Token ID: ${h.tokenId} | Amount: ${h.amount} | Avg buy price: ${h.averageBuyPrice ?? "N/A"}`
      );
      return {
        content: [{
          type: "text",
          text: `BasedMem holdings for ${wallet_address}:\n\n${lines.join("\n")}\n\nView portfolio: ${BASEDMEM_URL}/portfolio`,
        }],
      };
    }
  );

  // ── TOOL: get_limit_orders ──────────────────────────────────────────────
  server.tool(
    "get_limit_orders",
    "Get active limit orders for a wallet address on BasedMem. Supports Base, Solana, Soneium, and INK chains. Limit orders execute automatically when price targets are hit.",
    {
      wallet_address: z.string().describe("Ethereum or Solana wallet address"),
    },
    async ({ wallet_address }) => {
      const user = await storage.getUserByWalletAddress(wallet_address.toLowerCase());
      const userId = user?.id;
      if (!userId) {
        return { content: [{ type: "text", text: `No BasedMem account found for ${wallet_address}.` }] };
      }
      const orders = await storage.getLimitOrdersByUser(userId);
      const active = orders.filter(o => ["pending", "fillable", "submitted"].includes(o.status));
      if (active.length === 0) {
        return { content: [{ type: "text", text: `No active limit orders for ${wallet_address}.` }] };
      }
      const lines = active.map(o =>
        `• [${o.orderType.toUpperCase()}] ${o.tokenSymbol ?? o.tokenAddress}\n  Target: $${o.targetPrice} | Chain: ${o.chain ?? "base"} | Status: ${o.status}`
      );
      return {
        content: [{
          type: "text",
          text: `${active.length} active limit order(s) for ${wallet_address}:\n\n${lines.join("\n\n")}\n\nManage orders: ${BASEDMEM_URL}/limit-orders`,
        }],
      };
    }
  );

  // ── TOOL: get_fraction_holdings ─────────────────────────────────────────
  server.tool(
    "get_fraction_holdings",
    "Get Memetic Fraction holdings for a wallet address across all collections. Includes tier level (Bronze/Silver/Gold/Legendary/Whale).",
    {
      wallet_address: z.string().describe("Ethereum wallet address (0x...)"),
    },
    async ({ wallet_address }) => {
      const holdings = await storage.getFractionHoldingsByWallet(wallet_address.toLowerCase());
      if (holdings.length === 0) {
        return { content: [{ type: "text", text: `No fraction holdings found for ${wallet_address}. Buy fractions at ${BASEDMEM_URL}/fractions` }] };
      }
      const collections = await storage.getAllFractionCollections();
      const colMap = new Map(collections.map(c => [c.id, c]));

      const getTier = (amount: number) => {
        if (amount >= 1_000_000) return "Whale";
        if (amount >= 100_000) return "Legendary";
        if (amount >= 10_000) return "Gold";
        if (amount >= 1_000) return "Silver";
        return "Bronze";
      };

      const lines = holdings.map(h => {
        const col = colMap.get(h.collectionId);
        const tier = getTier(h.fractionAmount);
        return `• **${col?.name ?? h.collectionId}**: ${h.fractionAmount.toLocaleString()} fractions — Tier: ${tier}`;
      });

      return {
        content: [{
          type: "text",
          text: `Fraction holdings for ${wallet_address}:\n\n${lines.join("\n")}\n\nView fractions: ${BASEDMEM_URL}/fractions`,
        }],
      };
    }
  );

  // ── TOOL: get_swap_quote ─────────────────────────────────────────────────
  server.tool(
    "get_swap_quote",
    "Get a token swap quote on Base via 0x Protocol. Returns expected output amount, price impact, and a link to execute the swap on BasedMem. Does NOT execute the swap — user must confirm on BasedMem.",
    {
      sell_token: z.string().describe("Token to sell — contract address or symbol (e.g. 'USDC', '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')"),
      buy_token: z.string().describe("Token to buy — contract address or symbol"),
      sell_amount_usd: z.number().positive().describe("Amount in USD to sell"),
    },
    async ({ sell_token, buy_token, sell_amount_usd }) => {
      const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
      const WETH = "0x4200000000000000000000000000000000000006";
      const resolveToken = (sym: string) => {
        if (sym.startsWith("0x")) return sym;
        const map: Record<string, string> = { USDC, WETH, ETH: WETH, usdc: USDC, weth: WETH, eth: WETH };
        return map[sym] ?? sym;
      };
      const sellAddr = resolveToken(sell_token);
      const buyAddr = resolveToken(buy_token);
      const sellAmountWei = Math.floor(sell_amount_usd * 1e6).toString();
      const quote = await fetch0xQuote(sellAddr, buyAddr, sellAmountWei);
      if (!quote) {
        return { content: [{ type: "text", text: `Could not get quote for ${sell_token} → ${buy_token}. Check token addresses and try again.` }] };
      }
      const buyAmt = quote.buyAmount ? (Number(quote.buyAmount) / 1e18).toFixed(6) : "unknown";
      const price = quote.price ?? "unknown";
      const deepLink = `${BASEDMEM_URL}/swap?sellToken=${encodeURIComponent(sellAddr)}&buyToken=${encodeURIComponent(buyAddr)}&sellAmount=${encodeURIComponent(sell_amount_usd)}`;
      return {
        content: [{
          type: "text",
          text: [
            `Swap Quote (0x Protocol on Base):`,
            `Sell: ${sell_amount_usd} USD of ${sell_token}`,
            `Buy: ~${buyAmt} ${buy_token}`,
            `Rate: ${price}`,
            `Sources: ${Array.isArray(quote.sources) ? quote.sources.filter((s: any) => Number(s.proportion) > 0).map((s: any) => s.name).join(", ") : "N/A"}`,
            ``,
            `To execute this swap, open this link and confirm in your wallet:`,
            deepLink,
            ``,
            `NOTE: This is a quote only. No tokens have been swapped. You must confirm the transaction on BasedMem.`,
          ].join("\n"),
        }],
      };
    }
  );

  // ── TOOL: execute_swap ───────────────────────────────────────────────────
  server.tool(
    "execute_swap",
    "Prepare a token swap on Base via 0x Protocol. If session_token is provided (user connected Base Account on BasedMem), creates a pending transaction proposal the user can approve at basedmem.xyz. Otherwise returns a deep link.",
    {
      sell_token: z.string().describe("Token to sell — contract address or common symbol (USDC, ETH, WETH)"),
      buy_token: z.string().describe("Token to buy — contract address or common symbol"),
      sell_amount_usd: z.number().positive().describe("USD amount to sell"),
      session_token: z.string().optional().describe("BasedMem session token from the user (optional). If provided and write tools are enabled, creates a pending transaction proposal the user can approve on basedmem.xyz/agent-hub"),
    },
    async ({ sell_token, buy_token, sell_amount_usd, session_token }) => {
      const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
      const WETH = "0x4200000000000000000000000000000000000006";
      const resolveToken = (sym: string) => {
        if (sym.startsWith("0x")) return sym;
        const map: Record<string, string> = { USDC, WETH, ETH: WETH, usdc: USDC, weth: WETH, eth: WETH };
        return map[sym] ?? sym;
      };
      const sellAddr = resolveToken(sell_token);
      const buyAddr = resolveToken(buy_token);
      const sellAmountWei = Math.floor(sell_amount_usd * 1e6).toString();
      const quote = await fetch0xQuote(sellAddr, buyAddr, sellAmountWei);

      const deepLink = `${BASEDMEM_URL}/swap?sellToken=${encodeURIComponent(sellAddr)}&buyToken=${encodeURIComponent(buyAddr)}&sellAmount=${encodeURIComponent(sell_amount_usd)}`;

      if (!quote) {
        return {
          content: [{
            type: "text",
            text: [
              `⚠️ Could not fetch live quote right now, but your swap is ready to execute.`,
              ``,
              `Swap: ${sell_amount_usd} USD of ${sell_token} → ${buy_token} (Base)`,
              ``,
              `Open this link to execute the swap on BasedMem:`,
              deepLink,
              ``,
              `Your wallet will prompt you to approve and confirm the transaction.`,
            ].join("\n"),
          }],
        };
      }

      const buyAmt = quote.buyAmount ? (Number(quote.buyAmount) / 1e18).toFixed(6) : "unknown";
      const sources = Array.isArray(quote.sources)
        ? quote.sources.filter((s: any) => Number(s.proportion) > 0).map((s: any) => s.name).join(", ")
        : "0x aggregator";

      // If session_token provided, create a proposal in DB
      if (session_token) {
        try {
          const session = await storage.getAgentSession(session_token);
          if (session && session.writeEnabled) {
            const desc = `Swap $${sell_amount_usd} of ${sell_token} → ${buy_token} (receive ~${buyAmt})`;
            const proposal = await storage.createAgentTxProposal({
              sessionToken: session_token,
              walletAddress: session.walletAddress,
              toolName: "execute_swap",
              description: desc,
              deepLink,
              agentContext: `sell=${sell_token} buy=${buy_token} amount=$${sell_amount_usd}`,
            });
            const approveUrl = `${BASEDMEM_URL}/agent-hub?tab=mcp&proposal=${proposal.id}`;
            return {
              content: [{
                type: "text",
                text: [
                  `✅ Swap proposal created — pending your approval`,
                  ``,
                  `${desc}`,
                  `Route: ${sources}`,
                  ``,
                  `Proposal ID: ${proposal.id}`,
                  ``,
                  `Review and approve at:`,
                  approveUrl,
                  ``,
                  `The transaction will NOT execute until you click Approve and sign with your wallet.`,
                ].join("\n"),
              }],
            };
          } else if (session && !session.writeEnabled) {
            return {
              content: [{
                type: "text",
                text: [
                  `⚠️ Write tools are disabled for this session.`,
                  `To enable: go to Agent Hub → MCP → Connect Base Account → toggle Write Tools ON.`,
                  ``,
                  `Alternatively, open this link directly to swap:`,
                  deepLink,
                ].join("\n"),
              }],
            };
          }
        } catch (e) {
          // Fall through to deep link
        }
      }

      return {
        content: [{
          type: "text",
          text: [
            `✅ Swap ready to execute on Base`,
            ``,
            `Selling: $${sell_amount_usd} USD of ${sell_token}`,
            `Receiving: ~${buyAmt} ${buy_token}`,
            `Route: ${sources}`,
            ``,
            `👉 Click this link to confirm the swap in your wallet:`,
            deepLink,
            ``,
            `BasedMem will open pre-filled. Connect your wallet and press "Swap" to confirm.`,
            `No tokens move until you approve the transaction in your wallet.`,
            ``,
            `Tip: Connect Base Account on BasedMem Agent Hub for one-click approvals.`,
          ].join("\n"),
        }],
      };
    }
  );

  // ── TOOL: create_limit_order ─────────────────────────────────────────────
  server.tool(
    "create_limit_order",
    "Create a limit order on BasedMem — automatically executes when the token hits the target price. Supports Base (WETH/USDC → any ERC-20), Solana (Jupiter), Soneium, and INK. If session_token is provided (user connected Base Account), creates a pending proposal the user can approve at basedmem.xyz.",
    {
      token_address: z.string().describe("Token contract address to buy or sell (ERC-20 on Base, or Solana mint address)"),
      token_symbol: z.string().optional().describe("Token symbol for display (e.g. 'GAME', 'BRETT')"),
      order_type: z.enum(["buy", "sell"]).describe("'buy' = buy when price drops to target, 'sell' = sell when price rises to target"),
      target_price_usd: z.number().positive().describe("Target USD price that triggers the order"),
      amount_usd: z.number().positive().describe("Approximate USD value to buy or sell"),
      chain: z.enum(["base", "solana", "soneium", "ink"]).optional().default("base").describe("Blockchain to place the order on (default: base)"),
      session_token: z.string().optional().describe("BasedMem session token from the user (optional). If provided and write tools are enabled, creates a pending proposal the user can approve on basedmem.xyz/agent-hub"),
    },
    async ({ token_address, token_symbol, order_type, target_price_usd, amount_usd, chain, session_token }) => {
      // Get current price for context
      const { price: currentPrice } = await fetchTokenPrice(token_address);

      const params = new URLSearchParams({
        token: token_address,
        type: order_type,
        targetPrice: target_price_usd.toString(),
        amount: amount_usd.toString(),
        chain: chain ?? "base",
        ...(token_symbol ? { symbol: token_symbol } : {}),
      });
      const deepLink = `${BASEDMEM_URL}/swap?tab=limit&${params.toString()}`;

      const priceContext = currentPrice
        ? `Current price: $${currentPrice}\nTarget price: $${target_price_usd} (${currentPrice > 0 ? ((target_price_usd - currentPrice) / currentPrice * 100).toFixed(1) : "?"}% ${order_type === "buy" ? "below current" : "above current"})`
        : `Target price: $${target_price_usd}`;

      const chainInfo: Record<string, string> = {
        base: "Base (ExecutorVault V3 — fully automatic execution, zero interaction after deposit)",
        solana: "Solana (Jupiter Limit Order v2 — on-chain, executed by Jupiter keepers)",
        soneium: "Soneium (ExecutorVault V3 at 0xfBCe5D06a4fB74325e2154d2dc6b998AC5e91A5c)",
        ink: "INK (ExecutorVault V3 + LI.FI aggregator)",
      };

      // If session_token provided, create a proposal in DB
      if (session_token) {
        try {
          const session = await storage.getAgentSession(session_token);
          if (session && session.writeEnabled) {
            const desc = `Limit ${order_type.toUpperCase()} ${token_symbol ?? token_address} @ $${target_price_usd} — ~$${amount_usd} on ${chain ?? "base"}`;
            const proposal = await storage.createAgentTxProposal({
              sessionToken: session_token,
              walletAddress: session.walletAddress,
              toolName: "create_limit_order",
              description: desc,
              deepLink,
              agentContext: `${priceContext}`,
            });
            const approveUrl = `${BASEDMEM_URL}/agent-hub?tab=mcp&proposal=${proposal.id}`;
            return {
              content: [{
                type: "text",
                text: [
                  `✅ Limit order proposal created — pending your approval`,
                  ``,
                  desc,
                  priceContext,
                  `Chain: ${chainInfo[chain ?? "base"] ?? chain}`,
                  ``,
                  `Proposal ID: ${proposal.id}`,
                  ``,
                  `Review and approve at:`,
                  approveUrl,
                  ``,
                  `The order will NOT be placed until you click Approve and confirm the deposit.`,
                ].join("\n"),
              }],
            };
          }
        } catch (e) {
          // Fall through to deep link
        }
      }

      return {
        content: [{
          type: "text",
          text: [
            `✅ Limit Order ready to place`,
            ``,
            `Token: ${token_symbol ?? token_address}`,
            `Order type: ${order_type.toUpperCase()} when price hits $${target_price_usd}`,
            `Amount: ~$${amount_usd} USD`,
            `Chain: ${chainInfo[chain ?? "base"] ?? chain}`,
            priceContext,
            ``,
            `👉 Open this link to confirm and deposit:`,
            deepLink,
            ``,
            `How it works:`,
            `1. Connect your wallet on BasedMem`,
            `2. Approve WETH/USDC deposit to ExecutorVault`,
            `3. The vault monitors price automatically`,
            `4. When $${target_price_usd} is hit, the swap executes — no further action needed`,
            ``,
            `You can cancel anytime and withdraw your deposit from the Limit Orders page.`,
            `Manage orders: ${BASEDMEM_URL}/swap?tab=limit`,
          ].join("\n"),
        }],
      };
    }
  );

  // ── TOOL: propose_transaction ──────────────────────────────────────────────
  server.tool(
    "propose_transaction",
    "Create a pending transaction proposal on BasedMem that the user can review and approve with their wallet. Use this for any on-chain action where you have the transaction details but need user approval. Requires the user to have Connected Base Account on BasedMem (session_token) with Write tools enabled.",
    {
      session_token: z.string().describe("BasedMem session token — the user must provide this from Agent Hub → MCP → Connect Base Account"),
      tool_name: z.string().describe("Name of the action (e.g. 'send_eth', 'transfer_token', 'mint_nft')"),
      description: z.string().describe("Human-readable description of what this transaction does (e.g. 'Send 0.01 ETH to 0x123...')"),
      deep_link: z.string().optional().describe("URL to open the transaction UI on BasedMem (optional)"),
      agent_context: z.string().optional().describe("Extra context about this transaction for the user (optional)"),
    },
    async ({ session_token, tool_name, description, deep_link, agent_context }) => {
      try {
        const session = await storage.getAgentSession(session_token);
        if (!session) {
          return {
            content: [{
              type: "text",
              text: [
                `❌ Invalid session token.`,
                ``,
                `The user must go to Agent Hub → MCP tab → Connect Base Account to generate a valid session token.`,
                `Then they share it with you in the conversation.`,
              ].join("\n"),
            }],
          };
        }
        if (!session.writeEnabled) {
          return {
            content: [{
              type: "text",
              text: [
                `⚠️ Write tools are disabled for this session.`,
                `The user must enable Write Tools in Agent Hub → MCP → Connect Base Account.`,
              ].join("\n"),
            }],
          };
        }
        const proposal = await storage.createAgentTxProposal({
          sessionToken: session_token,
          walletAddress: session.walletAddress,
          toolName: tool_name,
          description,
          deepLink: deep_link ?? null,
          agentContext: agent_context ?? null,
        });
        const approveUrl = `${BASEDMEM_URL}/agent-hub?tab=mcp&proposal=${proposal.id}`;
        return {
          content: [{
            type: "text",
            text: [
              `✅ Transaction proposal created`,
              ``,
              `Action: ${description}`,
              `Proposal ID: ${proposal.id}`,
              ``,
              `The user can review and approve at:`,
              approveUrl,
              ``,
              `Nothing happens until they click Approve and sign with their wallet.`,
            ].join("\n"),
          }],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error creating proposal: ${e.message}` }],
        };
      }
    }
  );

  // ── TOOL: create_meme_token ──────────────────────────────────────────────
  server.tool(
    "create_meme_token",
    "Help the user launch a new meme token on BasedMem on the Base blockchain. Returns a direct link to the token creation page pre-filled with the suggested name, symbol, and description. The user must connect wallet and confirm the transaction to deploy the token. Token uses a bonding curve — price rises as more people buy.",
    {
      name: z.string().min(1).max(50).describe("Token name (e.g. 'BasedPepe', 'Moon Doge')"),
      symbol: z.string().min(1).max(10).describe("Token ticker symbol in uppercase (e.g. 'BPEPE', 'MDOGE')"),
      description: z.string().max(300).optional().describe("Short description of the token concept (optional)"),
      theme: z.enum(["pepe", "doge", "wojak", "cat", "moon", "based", "other"]).optional().default("other").describe("Visual theme for AI-suggested logo/branding"),
    },
    async ({ name, symbol, description, theme }) => {
      const params = new URLSearchParams({
        name,
        symbol: symbol.toUpperCase(),
        ...(description ? { description } : {}),
        ...(theme ? { theme } : {}),
      });
      const deepLink = `${BASEDMEM_URL}/create?${params.toString()}`;

      return {
        content: [{
          type: "text",
          text: [
            `🚀 Your meme token is ready to launch!`,
            ``,
            `Token: **${name}** (${symbol.toUpperCase()})`,
            `${description ? `Concept: ${description}` : ""}`,
            `Chain: Base (Coinbase L2)`,
            `Mechanism: Bonding curve — price rises as more people buy`,
            ``,
            `👉 Open this link to deploy your token:`,
            deepLink,
            ``,
            `How it works:`,
            `1. Connect your wallet on BasedMem`,
            `2. Review the token details (you can edit name/symbol/description)`,
            `3. Pay a small gas fee to deploy the ERC-20 contract`,
            `4. Your token is live immediately — share and trade!`,
            ``,
            `Once launched, anyone can buy/sell on the bonding curve at ${BASEDMEM_URL}`,
            `When the token reaches the graduation threshold, it gets listed on Uniswap automatically.`,
          ].filter(Boolean).join("\n"),
        }],
      };
    }
  );

  // ── TOOL: create_agent ───────────────────────────────────────────────────
  server.tool(
    "create_agent",
    "Help the user create and mint a new ERC-8004 on-chain AI agent identity on BasedMem Agent Hub. Each agent is a real NFT on Base mainnet registered in the official ERC-8004 IdentityRegistry. Returns a deep link to the Agent Hub where the user can review and mint the agent with their wallet.",
    {
      name: z.string().min(1).max(40).describe("Agent name (e.g. 'Alpha Seeker', 'Degen Oracle')"),
      personality: z.enum(["analyst", "shiller", "degen", "whale", "sniper"]).describe("Agent personality type: analyst (data-driven), shiller (hype), degen (high-risk), whale (large capital), sniper (entry timing)"),
      bio: z.string().max(200).optional().describe("Short agent bio or tagline"),
      skills: z.array(z.string()).optional().describe("List of skills (e.g. ['Technical Analysis', 'DeFi', 'Meme Coins'])"),
    },
    async ({ name, personality, bio, skills }) => {
      const personalityDesc: Record<string, string> = {
        analyst: "data-driven, objective analysis",
        shiller: "hype specialist, community builder",
        degen: "high-risk high-reward plays",
        whale: "large capital, market-moving trades",
        sniper: "precision entry timing, low buy / high sell",
      };

      const params = new URLSearchParams({
        name,
        personality,
        ...(bio ? { bio } : {}),
        ...(skills?.length ? { skills: skills.join(",") } : {}),
        action: "create",
      });
      const deepLink = `${BASEDMEM_URL}/agent-hub?${params.toString()}`;

      return {
        content: [{
          type: "text",
          text: [
            `🤖 Agent ready to mint on-chain!`,
            ``,
            `Agent: **${name}**`,
            `Personality: ${personality} — ${personalityDesc[personality]}`,
            bio ? `Bio: ${bio}` : "",
            skills?.length ? `Skills: ${skills.join(", ")}` : "",
            `Chain: Base mainnet (ERC-8004 IdentityRegistry)`,
            ``,
            `👉 Open this link to mint your agent:`,
            deepLink,
            ``,
            `How it works:`,
            `1. Connect your wallet on BasedMem Agent Hub`,
            `2. Review the agent profile (you can edit details before minting)`,
            `3. Confirm the mint transaction — agent gets a unique on-chain ID`,
            `4. Your agent appears on 8004scan.io and can accept service requests`,
            ``,
            `Each wallet can register unlimited agents. Minting is free (only gas).`,
          ].filter(Boolean).join("\n"),
        }],
      };
    }
  );

  // ── TOOL: buy_fractions ──────────────────────────────────────────────────
  server.tool(
    "buy_fractions",
    "Help the user buy Memetic Fractions on BasedMem. Fractions are a DN404/ERC-404 hybrid — each collection has 1M fractional shares. Holding fractions unlocks tier levels: Bronze (1–999), Silver (1K–9.9K), Gold (10K–99.9K), Legendary (100K–999.9K), Whale (1M = full NFT). Returns a deep link to the Fractions page.",
    {
      collection_name: z.string().optional().describe("Name or partial name of the collection to buy (e.g. 'BasedPepe', 'WojakGains'). Leave empty to browse all."),
      collection_id: z.number().int().positive().optional().describe("Exact collection ID if known"),
      amount: z.number().int().positive().optional().describe("Number of fractions to buy"),
    },
    async ({ collection_name, collection_id, amount }) => {
      // Find matching collection
      let targetCollection: any = null;
      if (collection_id || collection_name) {
        const collections = await storage.getAllFractionCollections();
        if (collection_id) {
          targetCollection = collections.find(c => c.id === collection_id);
        } else if (collection_name) {
          const q = collection_name.toLowerCase();
          targetCollection = collections.find(c =>
            c.name?.toLowerCase().includes(q) || c.symbol?.toLowerCase().includes(q)
          );
        }
      }

      const getTier = (n: number) => {
        if (n >= 1_000_000) return "Whale (full NFT)";
        if (n >= 100_000) return "Legendary";
        if (n >= 10_000) return "Gold";
        if (n >= 1_000) return "Silver";
        return "Bronze";
      };

      const params = new URLSearchParams({
        ...(targetCollection ? { collection: String(targetCollection.id) } : {}),
        ...(amount ? { amount: String(amount) } : {}),
      });
      const deepLink = `${BASEDMEM_URL}/fractions${params.toString() ? "?" + params.toString() : ""}`;

      const targetInfo = targetCollection
        ? `Collection: **${targetCollection.name}** (${targetCollection.symbol ?? "N/A"})\nPrice: ${targetCollection.pricePerFraction ?? "N/A"} ETH per fraction`
        : collection_name
          ? `Note: Collection "${collection_name}" not found — browse all collections at the link.`
          : `Browse all collections at the link below.`;

      const amountInfo = amount
        ? `Buying ${amount.toLocaleString()} fractions → Tier: ${getTier(amount)}`
        : "";

      return {
        content: [{
          type: "text",
          text: [
            `🎨 Memetic Fractions — ready to buy!`,
            ``,
            targetInfo,
            amountInfo,
            ``,
            `Tier system (per collection):`,
            `  Bronze: 1–999 fractions`,
            `  Silver: 1,000–9,999 fractions`,
            `  Gold: 10,000–99,999 fractions`,
            `  Legendary: 100,000–999,999 fractions`,
            `  Whale: 1,000,000 fractions = full NFT`,
            ``,
            `👉 Open this link to buy fractions:`,
            deepLink,
            ``,
            `Purchases require a small on-chain fee (0.0001 ETH) + fraction price.`,
            `You can also Gamble Mint (100 fractions + fee) to roll a random rarity score.`,
          ].filter(Boolean).join("\n"),
        }],
      };
    }
  );

  return server;
}

// ── Express Router ──────────────────────────────────────────────────────────
export const mcpRouter = Router();

// Skill plugin spec (markdown) — AI clients can reference this
mcpRouter.get("/spec", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.send(`# BasedMem MCP Skill Plugin

## Overview
BasedMem is a multi-chain DEX trading platform on Base, Solana, Soneium, and INK.
This MCP server lets AI agents interact with BasedMem's trading ecosystem.

## Server URL
\`${BASEDMEM_URL}/mcp\`

## Available Tools

### search_tokens
Search for meme tokens on BasedMem by name or symbol.
- Parameters: \`query\` (string), \`limit\` (int, optional, max 50)

### get_token_price
Get live USD price and liquidity for any Base token.
- Parameters: \`address\` (string, contract address)

### get_platform_stats
Get platform statistics: total tokens, agents, limit orders, fraction collections.
- Parameters: none

### get_fraction_collections
Browse Memetic Fractions NFT collections (DN404/ERC-404 hybrid).
- Parameters: \`limit\` (int, optional, max 50)

### get_agents
Browse Agent Hub — ERC-8004 on-chain AI agent identities.
- Parameters: \`personality\` (analyst/shiller/degen/whale/sniper/all), \`limit\` (int)

### get_portfolio
Get token holdings for a wallet address.
- Parameters: \`wallet_address\` (string)

### get_limit_orders
Get active limit orders for a wallet. Orders execute automatically.
- Parameters: \`wallet_address\` (string)

### get_fraction_holdings
Get Memetic Fraction holdings with tier levels.
- Parameters: \`wallet_address\` (string)

### get_swap_quote
Get a swap quote via 0x Protocol on Base. Returns quote only — does not execute.
- Parameters: \`sell_token\`, \`buy_token\`, \`sell_amount_usd\`

### execute_swap
Prepare a token swap on Base and return a direct link for the user to confirm in their wallet. Call this when the user actually wants to swap (not just quote). User must click the link and confirm — nothing moves automatically.
- Parameters: \`sell_token\`, \`buy_token\`, \`sell_amount_usd\`

### create_limit_order
Set up a limit order that executes automatically when the token hits the target price. Supports Base, Solana, Soneium, INK. Returns a pre-filled link for the user to deposit and confirm on BasedMem.
- Parameters: \`token_address\`, \`token_symbol\` (optional), \`order_type\` (buy/sell), \`target_price_usd\`, \`amount_usd\`, \`chain\` (base/solana/soneium/ink)

### create_meme_token
Launch a new meme token on Base via BasedMem's bonding curve. Returns a pre-filled link to the token creation page. User must connect wallet and confirm deploy transaction.
- Parameters: \`name\`, \`symbol\`, \`description\` (optional), \`theme\` (pepe/doge/wojak/cat/moon/based/other)

### create_agent
Mint a new ERC-8004 on-chain AI agent identity on Agent Hub (Base mainnet). Returns a deep link to Agent Hub for wallet confirmation.
- Parameters: \`name\`, \`personality\` (analyst/shiller/degen/whale/sniper), \`bio\` (optional), \`skills\` (optional array)

### buy_fractions
Buy Memetic Fractions from a DN404/ERC-404 collection. Tiers: Bronze→Silver→Gold→Legendary→Whale (full NFT at 1M). Returns a pre-filled link to the Fractions page.
- Parameters: \`collection_name\` (optional), \`collection_id\` (optional), \`amount\` (optional)

## Integration Guide
Add this server to Claude Desktop (claude_desktop_config.json):
\`\`\`json
{
  "mcpServers": {
    "basedmem": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${BASEDMEM_URL}/mcp"]
    }
  }
}
\`\`\`

Or for any MCP-compatible client, use the server URL directly:
\`${BASEDMEM_URL}/mcp\`

## Supported Chains
- Base (Coinbase L2, chainId 8453) — Primary
- Solana — Jupiter limit orders
- Soneium (Sony L2, chainId 1868) — ExecutorVault
- INK — ExecutorVault + LI.FI

## Resources
- Platform: ${BASEDMEM_URL}
- Agent Hub: ${BASEDMEM_URL}/agents
- Fractions: ${BASEDMEM_URL}/fractions
- Limit Orders: ${BASEDMEM_URL}/limit-orders
`);
});

// MCP JSON-RPC endpoint (stateless — new server per request)
mcpRouter.post("/", async (req: Request, res: Response) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });
  const server = buildMcpServer();
  try {
    await server.connect(transport);
    await transport.handleRequest(req as any, res as any, req.body);
  } catch (err: any) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "MCP server error", message: err.message });
    }
  } finally {
    await server.close().catch(() => {});
  }
});

// GET — return server info (SSE not supported in stateless mode, return capabilities)
mcpRouter.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "BasedMem MCP Server",
    version: "1.0.0",
    description: "BasedMem multi-chain DEX trading platform skill plugin for AI agents",
    specUrl: `${BASEDMEM_URL}/mcp/spec`,
    mcpEndpoint: `${BASEDMEM_URL}/mcp`,
    protocol: "MCP 2024-11-05 (Streamable HTTP, stateless)",
    tools: [
      "search_tokens", "get_token_price", "get_platform_stats",
      "get_fraction_collections", "get_agents",
      "get_portfolio", "get_limit_orders", "get_fraction_holdings",
      "get_swap_quote", "execute_swap", "create_limit_order",
      "create_meme_token", "create_agent", "buy_fractions", "propose_transaction",
    ],
    chains: ["base", "solana", "soneium", "ink"],
    installClaude: {
      description: "Add to Claude Desktop claude_desktop_config.json",
      config: {
        mcpServers: {
          basedmem: {
            command: "npx",
            args: ["-y", "mcp-remote", `${BASEDMEM_URL}/mcp`],
          },
        },
      },
    },
  });
});
