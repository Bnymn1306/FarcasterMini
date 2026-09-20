---
name: MCP Server Setup
description: BasedMem MCP server implementation details and gotchas.
---

## Server Location
`server/mcp.ts` — exports `mcpRouter` (Express Router)

## Endpoints
- `GET /mcp` — JSON info (name, version, tools list, install snippet)
- `GET /mcp/spec` — Markdown spec document
- `POST /mcp` — JSON-RPC 2.0 via `StreamableHTTPServerTransport` (stateless, `sessionIdGenerator: undefined`)

## Mounted in routes.ts
```ts
import { mcpRouter } from "./mcp";
app.use("/mcp", mcpRouter);
```
Must be added before `createServer()` call.

## Tools (9)
search_tokens, get_token_price, get_platform_stats, get_fraction_collections,
get_agents, get_portfolio, get_limit_orders, get_fraction_holdings, get_swap_quote

## Token type gotcha
Token schema uses `creatorId` (not `creatorAddress`). Always use `t.creatorId`.

## MCP SDK version
`@modelcontextprotocol/sdk` — uses `McpServer` + `StreamableHTTPServerTransport`.

**Why:** Stateless transport avoids session management complexity on a monolith server.
