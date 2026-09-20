import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useWallet } from "@/contexts/WalletContext";
import { Interface } from "ethers";
import {
  getRegistryWithSigner,
  buildAgentURI,
  buildMetadataURI,
  hashDescription,
  parseRegisteredEvent,
  parseAgentRegisteredEvent,
  parseServiceRequestEvent,
  isOnChainAgentId as isOfficialOnChainId,
  get8004scanUrl,
  AGENT_REGISTRY_ABI,
  AGENT_REGISTRY_ADDRESS,
} from "@/lib/agentRegistry";
import { WalletSelectorModal } from "@/components/WalletSelectorModal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useX402Payment } from "@/hooks/useX402Payment";
import {
  Bot, Fingerprint, Shield, Star, Zap, Trophy, Send, Users,
  TrendingUp, Activity, CheckCircle, Clock, XCircle, Plus, Cpu,
  ExternalLink, Globe, Pen, ChevronDown, ChevronUp, RefreshCw, AlertCircle,
  Copy, Plug, Link2, Sparkles, Wallet, ArrowRight, Terminal,
  Key, Loader2, Bell, Power
} from "lucide-react";
import { SiCoinbase } from "react-icons/si";
import type { MemeAgent, AgentServiceRequest } from "@shared/schema";

const PERSONALITIES = [
  { value: "analyst", label: "Analyst", desc: "Data-driven, logical", color: "text-blue-400" },
  { value: "shiller", label: "Shiller", desc: "Hype generator", color: "text-yellow-400" },
  { value: "degen", label: "Degen", desc: "High risk, high reward", color: "text-pink-400" },
  { value: "whale", label: "Whale", desc: "Moves markets", color: "text-purple-400" },
  { value: "sniper", label: "Sniper", desc: "Entry/exit precision", color: "text-cyan-400" },
] as const;

// ── Auto-generate agent helper ────────────────────────────────────────────────
const AUTO_PREFIXES = ["Based", "Degen", "Turbo", "Alpha", "Moon", "Diamond", "Sigma", "Mega", "Giga", "Ultra", "Hyper", "Pepe", "Wojak", "Chad", "Rekt"];
const AUTO_NOUNS   = ["Whale", "Ape", "Bull", "Bear", "Sniper", "Trader", "Maxi", "OG", "Dev", "Bot", "King", "Ghost", "Hawk", "Wolf", "Gigabrain"];
const AUTO_BIOS: Record<string, string[]> = {
  analyst: [
    "I parse on-chain data so you don't have to. If the chart doesn't lie, neither do I.",
    "Liquidity flows, volume spikes, wallet clustering — all in a day's work.",
    "Every candle tells a story. I read them all.",
  ],
  shiller: [
    "To the moon or bust. I am the hype, I am the alpha.",
    "If you're not early, you're late. And I'm always early.",
    "100x or I'm not interested. Aping in since day one.",
  ],
  degen: [
    "Sleep is for people who aren't watching the mempool at 3am.",
    "I've been rugged 12 times and I'll do it again. Experience is the best teacher.",
    "Leverage is a lifestyle choice. Choose wisely — or don't, like me.",
  ],
  whale: [
    "I don't chase pumps. Pumps chase me.",
    "When I move, charts move. Simple as that.",
    "Accumulating in silence. Dumping loudly.",
  ],
  sniper: [
    "Entry precision is everything. I don't spray — I aim.",
    "One shot, one trade. Miss and it's back to research.",
    "Patience built my bags. Precision protects them.",
  ],
};

function generateRandomAgent(): { name: string; personality: string; bio: string } {
  const prefix = AUTO_PREFIXES[Math.floor(Math.random() * AUTO_PREFIXES.length)];
  const noun   = AUTO_NOUNS[Math.floor(Math.random() * AUTO_NOUNS.length)];
  const personality = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)].value;
  const bios = AUTO_BIOS[personality] ?? AUTO_BIOS.analyst;
  const bio = bios[Math.floor(Math.random() * bios.length)];
  return { name: `${prefix}${noun}`, personality, bio };
}

const REQUEST_TYPES = [
  { value: "shill", label: "Shill Campaign" },
  { value: "analysis", label: "Token Analysis" },
  { value: "alert", label: "Price Alert" },
  { value: "collab", label: "Collaboration" },
] as const;

function reputationLevel(score: number): { label: string; color: string; bg: string } {
  if (score >= 80) return { label: "Legendary", color: "text-yellow-400", bg: "bg-yellow-400/10" };
  if (score >= 50) return { label: "Trusted", color: "text-green-400", bg: "bg-green-400/10" };
  if (score >= 20) return { label: "Active", color: "text-blue-400", bg: "bg-blue-400/10" };
  return { label: "Novice", color: "text-muted-foreground", bg: "bg-muted/30" };
}

const isOnChainAgentId = isOfficialOnChainId;

function AgentCard({ agent, activeAgentId, onRequest, onSelect }: {
  agent: MemeAgent;
  activeAgentId?: string;
  onRequest?: (agent: MemeAgent) => void;
  onSelect?: (agent: MemeAgent) => void;
}) {
  const rep = reputationLevel(agent.reputationScore);
  const personality = PERSONALITIES.find(p => p.value === agent.personality) || PERSONALITIES[0];
  const isNumericId = /^\d+$/.test(agent.agentId);
  const shortId = isNumericId ? `#${agent.agentId}` : (agent.agentId.slice(0, 10) + "…" + agent.agentId.slice(-6));
  const onChain = isOnChainAgentId(agent.agentId);
  const isActive = activeAgentId === agent.id;
  const isBoosted = !!agent.boostedUntil && new Date(agent.boostedUntil).getTime() > Date.now();

  return (
    <Card
      className={`flex flex-col gap-0 transition-colors ${isBoosted ? "border-amber-500/40 bg-amber-500/5" : isActive ? "border-primary/40 bg-primary/5" : ""}`}
      data-testid={`card-agent-${agent.id}`}
    >
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-11 w-11 flex-shrink-0">
            <AvatarFallback className="bg-gradient-to-br from-primary/40 to-accent/40 text-foreground font-bold text-base">
              {agent.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sm truncate">{agent.name}</span>
              <Badge variant="outline" className={`text-xs ${personality.color}`}>
                {personality.label}
              </Badge>
              {onChain && (
                isNumericId ? (
                  <a href={get8004scanUrl(agent.agentId)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                    <Badge className="gap-0.5 text-xs bg-green-500/20 text-green-400 border border-green-500/30 cursor-pointer">
                      <CheckCircle className="h-2.5 w-2.5" />On-Chain
                    </Badge>
                  </a>
                ) : (
                  <Badge className="gap-0.5 text-xs bg-green-500/20 text-green-400 border border-green-500/30">
                    <CheckCircle className="h-2.5 w-2.5" />On-Chain
                  </Badge>
                )
              )}
              {isActive && (
                <Badge className="text-xs bg-primary/20 text-primary border border-primary/30">Active</Badge>
              )}
              {isBoosted && (
                <Badge className="gap-0.5 text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Zap className="h-2.5 w-2.5" />Boosted
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{shortId}</p>
          </div>
          <div className={`flex items-center gap-1 px-2 py-1 rounded-md ${rep.bg}`}>
            <Star className={`h-3 w-3 ${rep.color}`} />
            <span className={`text-xs font-semibold ${rep.color}`}>{agent.reputationScore}</span>
          </div>
        </div>

        {agent.bio && (
          <p className="text-xs text-muted-foreground line-clamp-2">{agent.bio}</p>
        )}

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Activity className="h-3 w-3" />{agent.totalShills} shills</span>
          <span className="flex items-center gap-1"><Trophy className="h-3 w-3" />{agent.totalServicesDone} jobs</span>
          <Badge variant="outline" className={`text-xs ml-auto ${rep.color} border-current/30`}>{rep.label}</Badge>
        </div>

        <div className="flex gap-2">
          {onSelect && !isActive && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => onSelect(agent)}
              data-testid={`button-select-agent-${agent.id}`}
            >
              <Bot className="h-3.5 w-3.5" />
              Use This Agent
            </Button>
          )}
          {onRequest && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => onRequest(agent)}
              data-testid={`button-request-agent-${agent.id}`}
            >
              <Send className="h-3.5 w-3.5" />
              Request
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle className="h-4 w-4 text-green-400" />;
  if (status === "accepted") return <Activity className="h-4 w-4 text-blue-400" />;
  if (status === "rejected") return <XCircle className="h-4 w-4 text-red-400" />;
  return <Clock className="h-4 w-4 text-yellow-400" />;
}

const MCP_TOOLS = [
  { name: "search_tokens", desc: "Search meme tokens by name or symbol", icon: "🔍" },
  { name: "get_token_price", desc: "Live USD price + liquidity for any Base token", icon: "💰" },
  { name: "get_platform_stats", desc: "Platform stats: tokens, agents, orders, fractions", icon: "📊" },
  { name: "get_fraction_collections", desc: "Browse Memetic Fractions NFT collections", icon: "🎨" },
  { name: "get_agents", desc: "Browse ERC-8004 on-chain agents", icon: "🤖" },
  { name: "get_portfolio", desc: "Token holdings by wallet address", icon: "💼" },
  { name: "get_limit_orders", desc: "Active limit orders (auto-execute on price target)", icon: "📈" },
  { name: "get_fraction_holdings", desc: "Fraction holdings with tier levels", icon: "🏆" },
  { name: "get_swap_quote", desc: "0x Protocol swap quote (Base) — quote only, no execution", icon: "🔄" },
  { name: "execute_swap", desc: "Prepare a swap & return a deep link to confirm in wallet", icon: "⚡" },
  { name: "create_limit_order", desc: "Set up a limit order — fires automatically when price hits target", icon: "🎯" },
  { name: "create_meme_token", desc: "Launch a new meme token on Base via bonding curve", icon: "🚀" },
  { name: "create_agent", desc: "Mint an ERC-8004 on-chain agent identity on Agent Hub", icon: "🤖" },
  { name: "buy_fractions", desc: "Buy Memetic Fractions — unlock Bronze/Silver/Gold/Legendary/Whale tiers", icon: "🎨" },
  { name: "propose_transaction", desc: "Create a pending tx proposal the user approves on BasedMem (requires Base Account connection)", icon: "🔏" },
];

const BASE_MCP_SKILLS = [
  { icon: "💸", label: "Transfer funds", desc: "Send ETH/USDC to any address" },
  { icon: "🔄", label: "Swap tokens", desc: "Swap on Base via 0x, Uniswap, Aerodrome" },
  { icon: "📊", label: "Portfolio tracking", desc: "Balance + history across EVM chains" },
  { icon: "🏦", label: "Morpho / Moonwell", desc: "Lend, borrow, supply assets" },
  { icon: "📉", label: "Avantis perps", desc: "Open / manage leveraged positions" },
  { icon: "🌊", label: "Aerodrome LP", desc: "Add/remove liquidity, earn fees" },
  { icon: "🤖", label: "Virtuals agent tokens", desc: "Discover & trade Base agent tokens" },
  { icon: "💳", label: "x402 payments", desc: "Pay for BasedMem premium features" },
];

function MCPConnectTab({ walletAddress, activeAgent }: { walletAddress: string | null; activeAgent: any }) {
  const { toast } = useToast();
  const [showProposalHistory, setShowProposalHistory] = useState(false);
  const [oauthPending, setOauthPending] = useState(false);

  const MCP_SERVER_URL = `${window.location.origin}/mcp`;
  const BASE_MCP_URL = "https://mcp.base.org";

  // ── Session queries + mutations ──────────────────────────────────────────
  const { data: sessions = [], refetch: refetchSessions } = useQuery<any[]>({
    queryKey: ["/api/agent-sessions", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const res = await fetch(`/api/agent-sessions/${walletAddress}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!walletAddress,
    refetchInterval: 5000,
  });

  const activeSession = sessions[0] ?? null;

  const { data: allProposals = [], refetch: refetchProposals } = useQuery<any[]>({
    queryKey: ["/api/agent-tx-proposals", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const res = await fetch(`/api/agent-tx-proposals/${walletAddress}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!walletAddress,
    refetchInterval: 3000,
  });

  const pendingProposals = allProposals.filter((p: any) => p.status === "pending");

  // ── Connect Base Account (uses the wallet already connected to BasedMem) ──
  const handleConnectBaseAccount = async () => {
    if (!walletAddress) return;
    try {
      setOauthPending(true);
      const res = await apiRequest("POST", "/api/agent-sessions", {
        walletAddress,
        label: "Base Account",
      });
      await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/agent-sessions", walletAddress] });
      toast({ title: "Base Account connected!", description: "Share the session token with your AI agent.", duration: 3000 });
    } catch (e: any) {
      toast({ title: "Connection failed", description: e.message, variant: "destructive" });
    } finally {
      setOauthPending(false);
    }
  };

  const toggleWriteMutation = useMutation({
    mutationFn: async (writeEnabled: boolean) => {
      if (!activeSession) return;
      const res = await apiRequest("PATCH", `/api/agent-sessions/${activeSession.token}`, { writeEnabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-sessions", walletAddress] });
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async () => {
      if (!activeSession) return;
      await apiRequest("DELETE", `/api/agent-sessions/${activeSession.token}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-sessions", walletAddress] });
      toast({ title: "Disconnected", description: "Base Account session removed.", duration: 2000 });
    },
  });

  const updateProposalMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/agent-tx-proposals/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-tx-proposals", walletAddress] });
    },
  });

  const CLAUDE_CONFIG = JSON.stringify({
    mcpServers: {
      basedmem: {
        command: "npx",
        args: ["-y", "mcp-remote", MCP_SERVER_URL],
      },
    },
  }, null, 2);

  const COMBINED_CONFIG = JSON.stringify({
    mcpServers: {
      basedmem: {
        command: "npx",
        args: ["-y", "mcp-remote", MCP_SERVER_URL],
      },
      "base-mcp": {
        command: "npx",
        args: ["-y", "mcp-remote", BASE_MCP_URL],
      },
    },
  }, null, 2);

  const COMBINED_PROMPTS = [
    "Search for DEGEN token price on BasedMem, then swap 5 USDC to DEGEN on Base",
    "Show my BasedMem limit orders, then send 1 USDC to vitalik.base.eth",
    "Find the top meme tokens on BasedMem and swap 0.01 ETH to the best one",
    "What is my ETH balance on Base? Then show my BasedMem portfolio",
    "Create a limit order on BasedMem to buy BRETT when it hits $0.10",
  ];

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: `${label} copied!`, description: "Paste it in your AI client.", duration: 2000 });
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-semibold flex items-center gap-2">
          <Plug className="h-5 w-5 text-primary" />
          MCP Connect
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Connect BasedMem to Claude, ChatGPT, Cursor and other AI clients via Model Context Protocol.
        </p>
      </div>

      {/* ── Section A: BasedMem MCP Skill Plugin ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Terminal className="h-4 w-4 text-cyan-400" />
            BasedMem MCP Skill Plugin
            <Badge className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 ml-auto">Live</Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Add BasedMem as a skill to any MCP-compatible AI client. Your agent can search tokens, check prices, view portfolios, and browse Agent Hub directly from chat.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Server URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">MCP Server URL</label>
            <div className="flex gap-2">
              <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md font-mono truncate text-cyan-400" data-testid="text-mcp-url">
                {MCP_SERVER_URL}
              </code>
              <Button
                size="icon"
                variant="outline"
                onClick={() => copyText(MCP_SERVER_URL, "MCP server URL")}
                data-testid="button-copy-mcp-url"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Claude Desktop config */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Claude Desktop Config</label>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1"
                onClick={() => copyText(CLAUDE_CONFIG, "Claude config")}
                data-testid="button-copy-claude-config"
              >
                <Copy className="h-3 w-3" />
                Copy
              </Button>
            </div>
            <pre className="text-xs bg-muted px-3 py-2.5 rounded-md font-mono overflow-x-auto text-muted-foreground">
{CLAUDE_CONFIG}
            </pre>
          </div>

          {/* Quick install steps */}
          <div className="p-3 rounded-md bg-primary/5 border border-primary/20 space-y-2">
            <p className="text-xs font-semibold text-primary">Quick Install (Claude Desktop)</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-none">
              {[
                'Open Claude Desktop → Settings → Developer → Edit Config',
                'Paste the config above into claude_desktop_config.json',
                'Restart Claude Desktop',
                'Type: "Search for PEPE tokens on BasedMem" to test',
              ].map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary font-mono shrink-0">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-2 text-xs"
              onClick={() => window.open(`${window.location.origin}/mcp`, "_blank")}
              data-testid="button-view-mcp-info"
            >
              <ExternalLink className="h-3 w-3" />
              MCP Info
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 text-xs"
              onClick={() => window.open(`${window.location.origin}/mcp/spec`, "_blank")}
              data-testid="button-view-mcp-spec"
            >
              <Link2 className="h-3 w-3" />
              Skill Spec
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Section B: Available Tools ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-yellow-400" />
            Available Tools ({MCP_TOOLS.length})
          </CardTitle>
          <CardDescription className="text-xs">
            These tools are available to your AI agent once BasedMem MCP is installed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-2">
            {MCP_TOOLS.map(tool => (
              <div key={tool.name} className="flex gap-2.5 p-2.5 rounded-md bg-muted/40">
                <span className="text-base shrink-0">{tool.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs font-mono font-semibold text-foreground truncate">{tool.name}</p>
                  <p className="text-xs text-muted-foreground">{tool.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Section C: Connect Base Account ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
            <SiCoinbase className="h-4 w-4 text-blue-400" />
            External Skills — Base MCP
            <Badge
              className={`text-xs ml-auto border ${activeSession ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-muted text-muted-foreground border-muted"}`}
              data-testid="badge-base-account-status"
            >
              {activeSession ? "● connected" : "● not connected"}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Connect your Base Account to let AI agents interact with Base — swaps, limit orders, and on-chain actions. Every transaction requires your approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Not wallet connected */}
          {!walletAddress && (
            <div className="p-3 rounded-md bg-muted/40 text-center">
              <p className="text-xs text-muted-foreground">Connect your wallet (top of page) to activate Base Account.</p>
            </div>
          )}

          {/* Wallet connected but no session */}
          {walletAddress && !activeSession && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/40">
                <span className="text-xs text-muted-foreground">Wallet</span>
                <span className="text-xs font-mono text-foreground">{walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}</span>
              </div>
              <Button
                className="w-full gap-2"
                onClick={handleConnectBaseAccount}
                disabled={oauthPending}
                data-testid="button-connect-base-account"
              >
                {oauthPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <SiCoinbase className="h-4 w-4" />}
                {oauthPending ? "Connecting…" : "Connect Base Account"}
              </Button>
            </div>
          )}

          {/* Active session */}
          {walletAddress && activeSession && (
            <>
              {/* Connected status row */}
              <div className="flex items-center justify-between p-3 rounded-md bg-green-500/10 border border-green-500/20">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
                  <span className="text-xs font-medium text-green-400">Base Account Connected</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}</span>
              </div>

              {/* Read tools (always on) */}
              <div className="p-3 rounded-md bg-muted/40">
                <div className="flex items-center gap-3">
                  <div className="h-4 w-4 rounded border border-blue-400 bg-blue-400/20 flex items-center justify-center shrink-0">
                    <CheckCircle className="h-2.5 w-2.5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs font-medium">Read tools</p>
                    <p className="text-xs text-muted-foreground">Balances, gas, name resolution, contract metadata. No on-chain writes.</p>
                  </div>
                </div>
              </div>

              {/* Write tools toggle */}
              <div className={`p-3 rounded-md border transition-colors ${activeSession.writeEnabled ? "bg-primary/5 border-primary/20" : "bg-muted/40 border-transparent"}`}>
                <div className="flex items-center gap-3">
                  <button
                    className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${activeSession.writeEnabled ? "border-primary bg-primary" : "border-muted-foreground bg-transparent"}`}
                    onClick={() => toggleWriteMutation.mutate(!activeSession.writeEnabled)}
                    disabled={toggleWriteMutation.isPending}
                    data-testid="button-toggle-write-tools"
                  >
                    {activeSession.writeEnabled && <CheckCircle className="h-2.5 w-2.5 text-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">Write tools (transfer / swap / limit orders)</p>
                    <p className="text-xs text-muted-foreground">On-chain transactions from your wallet. Every action shows as a pending proposal you must explicitly approve.</p>
                  </div>
                </div>
              </div>

              {/* Session token */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Key className="h-3 w-3" />
                  Session Token — share with your AI agent
                </label>
                <div className="flex gap-2">
                  <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md font-mono truncate text-yellow-400" data-testid="text-session-token">
                    {activeSession.token}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copyText(activeSession.token, "Session token")}
                    data-testid="button-copy-session-token"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tell Claude: <span className="font-mono text-foreground/60">"My BasedMem session token is: {activeSession.token.slice(0, 8)}…"</span>
                </p>
              </div>

              {/* Pending proposals */}
              {pendingProposals.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    <Bell className="h-3 w-3 text-yellow-400" />
                    Pending Approvals
                    <Badge className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">{pendingProposals.length}</Badge>
                  </p>
                  {pendingProposals.map((p: any) => (
                    <div key={p.id} className="p-3 rounded-md bg-yellow-500/5 border border-yellow-500/20 space-y-2">
                      <p className="text-xs font-medium">{p.description}</p>
                      {p.agentContext && (
                        <p className="text-xs text-muted-foreground font-mono">{p.agentContext}</p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 gap-1 text-xs"
                          onClick={() => {
                            if (p.deepLink) window.open(p.deepLink, "_blank");
                            updateProposalMutation.mutate({ id: p.id, status: "approved" });
                          }}
                          disabled={updateProposalMutation.isPending}
                          data-testid={`button-approve-proposal-${p.id}`}
                        >
                          <CheckCircle className="h-3 w-3" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1 text-xs"
                          onClick={() => updateProposalMutation.mutate({ id: p.id, status: "rejected" })}
                          disabled={updateProposalMutation.isPending}
                          data-testid={`button-reject-proposal-${p.id}`}
                        >
                          <XCircle className="h-3 w-3" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pendingProposals.length === 0 && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-muted/30">
                  <Bell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground">No pending approvals. When your agent proposes a transaction it will appear here.</p>
                </div>
              )}

              {/* Proposal history toggle */}
              {allProposals.length > pendingProposals.length && (
                <button
                  className="w-full text-xs text-muted-foreground flex items-center justify-center gap-1 py-1 hover-elevate rounded"
                  onClick={() => setShowProposalHistory(!showProposalHistory)}
                >
                  <Clock className="h-3 w-3" />
                  {showProposalHistory ? "Hide" : "Show"} history ({allProposals.length - pendingProposals.length} completed)
                </button>
              )}

              {showProposalHistory && (
                <div className="space-y-2">
                  {allProposals.filter((p: any) => p.status !== "pending").map((p: any) => (
                    <div key={p.id} className={`p-2.5 rounded-md border text-xs flex items-start gap-2 ${p.status === "approved" ? "border-green-500/20 bg-green-500/5" : "border-muted bg-muted/20"}`}>
                      {p.status === "approved"
                        ? <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                        : <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />}
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground line-clamp-1">{p.description}</p>
                        <p className="text-xs text-muted-foreground/60 font-mono capitalize">{p.status} · {p.toolName}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Disconnect */}
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-muted-foreground text-xs gap-1"
                onClick={() => deleteSessionMutation.mutate()}
                disabled={deleteSessionMutation.isPending}
                data-testid="button-disconnect-base-account"
              >
                <Power className="h-3 w-3" />
                Disconnect Base Account
              </Button>
            </>
          )}

          {/* Base MCP combined config (always visible) */}
          <div className="space-y-1.5 pt-2 border-t border-muted/40">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <label className="text-xs font-medium text-muted-foreground">Claude Desktop Config (BasedMem + Base MCP)</label>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => copyText(COMBINED_CONFIG, "Combined config")} data-testid="button-copy-combined-config">
                <Copy className="h-3 w-3" />
                Copy both
              </Button>
            </div>
            <pre className="text-xs bg-muted px-3 py-2.5 rounded-md font-mono overflow-x-auto text-muted-foreground">
{COMBINED_CONFIG}
            </pre>
          </div>

          <Button
            variant="outline"
            className="w-full gap-2 text-xs"
            onClick={() => window.open("https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Base%20MCP&connectorUrl=https%3A%2F%2Fmcp.base.org", "_blank")}
            data-testid="button-add-base-mcp-claude"
          >
            <SiCoinbase className="h-4 w-4 text-blue-400" />
            Add Base MCP to Claude.ai
            <ExternalLink className="h-3 w-3 ml-auto" />
          </Button>
        </CardContent>
      </Card>

      {/* ── Section D: Ecosystem (future contract integrations) ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe className="h-4 w-4 text-purple-400" />
            Base Ecosystem Contracts
            <Badge variant="outline" className="text-xs ml-auto">Coming Soon</Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            BasedMem contracts will be registered in the Base ecosystem directory — enabling any Base MCP agent to interact with limit orders, fractions, and Agent Hub directly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              { label: "ExecutorVault V3", chain: "Base", addr: "0x...vault", status: "Live" },
              { label: "Memetic Fractions", chain: "Base", addr: "FractionalMeme.sol", status: "Live" },
              { label: "Agent Registry", chain: "Base", addr: "ERC-8004", status: "Live" },
              { label: "Token Factory", chain: "Base", addr: "TokenFactory.sol", status: "Live" },
              { label: "Bonding Curve", chain: "Base", addr: "BondingCurveToken.sol", status: "Live" },
              { label: "Prediction Market", chain: "Base", addr: "PredictionMarket.sol", status: "Live" },
            ].map(contract => (
              <div key={contract.label} className="flex items-center gap-2.5 p-2.5 rounded-md bg-muted/40">
                <Cpu className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{contract.label}</p>
                  <p className="text-xs text-muted-foreground font-mono">{contract.chain}</p>
                </div>
                <Badge className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 shrink-0">{contract.status}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function X402PanelTab({
  walletAddress,
  isWalletConnected,
  myAgents,
  allAgents,
}: {
  walletAddress: string | null;
  isWalletConnected: boolean;
  myAgents: MemeAgent[];
  allAgents: MemeAgent[];
}) {
  const { toast } = useToast();
  const { fetchWithPayment, isPending } = useX402Payment();
  const [boostAgentId, setBoostAgentId] = useState<string>("");
  const [endorseAgentId, setEndorseAgentId] = useState<string>("");
  const [signalSymbol, setSignalSymbol] = useState<string>("");
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [signalResult, setSignalResult] = useState<any>(null);

  const endorseTargets = allAgents.filter(
    (a) => a.walletAddress?.toLowerCase() !== walletAddress?.toLowerCase()
  );

  const runPayment = async (
    action: string,
    url: string,
    body: any,
    onSuccess?: (result: any) => void
  ) => {
    if (!isWalletConnected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to send x402 payments",
        variant: "destructive",
      });
      return;
    }
    setActiveAction(action);
    try {
      const result = await fetchWithPayment({ url, method: "POST", body });
      onSuccess?.(result);
    } catch {
      // useX402Payment already surfaces a toast on error
    } finally {
      setActiveAction(null);
    }
  };

  const handleBoost = () =>
    runPayment("boost", `/api/agents/${boostAgentId}/boost`, {}, () => {
      toast({
        title: "Agent boosted",
        description: "Featured for 7 days · +10 reputation",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents/wallet/all", walletAddress] });
    });

  const handleEndorse = () =>
    runPayment("endorse", `/api/agents/${endorseAgentId}/endorse`, {}, () => {
      toast({
        title: "Agent endorsed",
        description: "+5 reputation added to the agent",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
    });

  const handleSignal = () =>
    runPayment(
      "signal",
      `/api/trade/ai`,
      { symbol: signalSymbol.trim() },
      (result) => {
        setSignalResult(result);
        toast({ title: "Signal ready", description: `${result.symbol}: ${result.signal}` });
      }
    );

  return (
    <div className="space-y-4">
      <Card data-testid="card-x402-info">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-5 w-5 text-primary" />
            x402 Agent Actions
          </CardTitle>
          <CardDescription>
            Each action is a real on-chain USDC micropayment on Base. Your wallet signs the
            payment and the transaction settles instantly via the x402 protocol.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Boost My Agent */}
      <Card data-testid="card-x402-boost">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-green-400" />
              Boost My Agent
            </CardTitle>
            <Badge className="bg-green-500/15 text-green-400 border border-green-500/30">$0.01 USDC</Badge>
          </div>
          <CardDescription>
            Feature your agent in the marketplace for 7 days and add +10 reputation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {myAgents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You don't have any agents yet. Create one in the "My Agents" tab first.
            </p>
          ) : (
            <>
              <Select value={boostAgentId} onValueChange={setBoostAgentId}>
                <SelectTrigger data-testid="select-boost-agent">
                  <SelectValue placeholder="Select your agent" />
                </SelectTrigger>
                <SelectContent>
                  {myAgents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} · {a.reputationScore} rep
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="w-full gap-2"
                disabled={!boostAgentId || isPending}
                onClick={handleBoost}
                data-testid="button-x402-boost"
              >
                {activeAction === "boost" && isPending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Pay $0.01 &amp; Boost
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* AI Trade Signal */}
      <Card data-testid="card-x402-signal">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-yellow-400" />
              AI Trade Signal
            </CardTitle>
            <Badge className="bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">$0.005 USDC</Badge>
          </div>
          <CardDescription>
            Pay per call to get a momentum-based BUY / SELL / HOLD signal from live Base market data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="Token symbol (e.g. DEGEN)"
              value={signalSymbol}
              onChange={(e) => setSignalSymbol(e.target.value)}
              data-testid="input-signal-symbol"
              className="flex-1 min-w-[160px]"
            />
            <Button
              className="gap-2"
              disabled={!signalSymbol.trim() || isPending}
              onClick={handleSignal}
              data-testid="button-x402-signal"
            >
              {activeAction === "signal" && isPending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <TrendingUp className="h-4 w-4" />
              )}
              Pay $0.005
            </Button>
          </div>
          {signalResult && (
            <div className="rounded-md border p-3 space-y-1 text-sm" data-testid="text-signal-result">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-semibold">{signalResult.symbol}</span>
                <Badge
                  className={
                    signalResult.signal === "BUY"
                      ? "bg-green-500/15 text-green-400 border border-green-500/30"
                      : signalResult.signal === "SELL"
                      ? "bg-red-500/15 text-red-400 border border-red-500/30"
                      : "bg-muted text-muted-foreground border"
                  }
                >
                  {signalResult.signal} · {signalResult.confidence}%
                </Badge>
              </div>
              {signalResult.priceUsd && (
                <p className="text-muted-foreground">Price: ${signalResult.priceUsd}</p>
              )}
              <p className="text-muted-foreground">
                24h: {signalResult.priceChange?.h24}% · momentum {signalResult.momentum}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Endorse an Agent */}
      <Card data-testid="card-x402-endorse">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="flex items-center gap-2 text-base">
              <Star className="h-4 w-4 text-primary" />
              Endorse an Agent
            </CardTitle>
            <Badge className="bg-primary/15 text-primary border border-primary/30">$0.01 USDC</Badge>
          </div>
          <CardDescription>
            Support another agent. Adds +5 reputation to the agent you endorse.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {endorseTargets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No other agents to endorse yet.</p>
          ) : (
            <>
              <Select value={endorseAgentId} onValueChange={setEndorseAgentId}>
                <SelectTrigger data-testid="select-endorse-agent">
                  <SelectValue placeholder="Select an agent to endorse" />
                </SelectTrigger>
                <SelectContent>
                  {endorseTargets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} · {a.reputationScore} rep
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="w-full gap-2"
                disabled={!endorseAgentId || isPending}
                onClick={handleEndorse}
                data-testid="button-x402-endorse"
              >
                {activeAction === "endorse" && isPending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Star className="h-4 w-4" />
                )}
                Pay $0.01 &amp; Endorse
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AgentHub() {
  const { isWalletConnected, walletAddress, walletType, user, isSiwaVerified, verifySiwa, getProvider } = useWallet();
  const { toast } = useToast();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"manual" | "auto">("manual");
  const [autoPreview, setAutoPreview] = useState(() => generateRandomAgent());
  const [requestOpen, setRequestOpen] = useState(false);
  const [siwaLoading, setSiwaLoading] = useState(false);
  const [targetAgent, setTargetAgent] = useState<MemeAgent | null>(null);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [showAllMyAgents, setShowAllMyAgents] = useState(false);
  const [form, setForm] = useState({ name: "", personality: "analyst", bio: "" });
  const [reqForm, setReqForm] = useState({ requestType: "shill", description: "", budget: "0", budgetToken: "USDC" });

  // On-chain registration status (reads official ERC-8004 IdentityRegistry via backend)
  const {
    data: onChainStatus,
    isLoading: onChainLoading,
    refetch: refetchOnChain,
    isFetching: onChainFetching,
  } = useQuery<{
    onChainCount: number;
    onChainAgents: { agentId: string; name?: string; description?: string; agentURI?: string; scan8004Url?: string }[];
    dbCount: number;
    dbSynced: boolean;
    missingFromDb: string[];
    contractAddress: string;
    explorerUrl: string;
    scan8004Url?: string;
  }>({
    queryKey: ["/api/agents/onchain-check", walletAddress],
    queryFn: async () => {
      if (!walletAddress) throw new Error("No wallet");
      const res = await fetch(`/api/agents/onchain-check/${walletAddress}`);
      if (!res.ok) throw new Error("Check failed");
      return res.json();
    },
    enabled: !!walletAddress,
    staleTime: 30_000,
    retry: 1,
  });

  // All agents owned by this wallet
  const { data: myAgents = [], isLoading: myAgentsLoading } = useQuery<MemeAgent[]>({
    queryKey: ["/api/agents/wallet/all", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const res = await fetch(`/api/agents/wallet/${walletAddress}/all`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!walletAddress,
    retry: false,
  });

  // Active agent: user-selected or first in list
  const activeAgent = myAgents.find(a => a.id === activeAgentId) ?? myAgents[0] ?? null;

  const { data: allAgents = [], isLoading: agentsLoading } = useQuery<MemeAgent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: basenameData } = useQuery<{ basename: string | null }>({
    queryKey: ["/api/basename", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return { basename: null };
      const res = await fetch(`/api/basename/${walletAddress}`);
      return res.json();
    },
    enabled: !!walletAddress,
    staleTime: 5 * 60 * 1000,
  });

  const isOnChainId = isOfficialOnChainId;

  const handleVerifySiwa = async () => {
    setSiwaLoading(true);
    try {
      const ok = await verifySiwa();
      if (ok) {
        toast({ title: "SIWA Verified", description: "Your identity is now cryptographically verified on-chain." });
      } else {
        toast({ title: "Verification cancelled", variant: "destructive" });
      }
    } finally {
      setSiwaLoading(false);
    }
  };

  const { data: myRequests = [] } = useQuery<AgentServiceRequest[]>({
    queryKey: ["/api/agent-requests", activeAgent?.id],
    queryFn: async () => {
      if (!activeAgent) return [];
      const res = await fetch(`/api/agent-requests/${activeAgent.id}`);
      return res.json();
    },
    enabled: !!activeAgent,
  });

  const handleContractError = (e: any) => {
    const msg = e?.message || e?.reason || String(e);
    const cancelled = msg.includes("user rejected") || msg.includes("User denied") || msg.includes("ACTION_REJECTED") || msg.includes("denied transaction");
    toast({
      title: cancelled ? "Transaction cancelled" : "Error",
      description: cancelled ? "You rejected the transaction in your wallet." : msg.slice(0, 120),
      variant: "destructive",
    });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!walletAddress || !user?.id) throw new Error("Connect wallet first");
      const provider = getProvider();
      if (!provider) throw new Error("No wallet provider found");

      // Use auto-generated or manual form data
      const activeForm = createMode === "auto" ? autoPreview : form;

      // Build official ERC-8004 registration JSON
      const agentURI = buildAgentURI(activeForm.name, activeForm.personality, activeForm.bio);
      const registry = await getRegistryWithSigner(provider);
      const iface = new Interface(AGENT_REGISTRY_ABI as any);

      // Call the official ERC-8004 register(agentURI) → returns uint256 tokenId
      const tx = await (registry as any)["register(string)"](agentURI);
      toast({ title: "Transaction submitted", description: "Waiting for Base mainnet confirmation…" });
      const receipt = await tx.wait();

      // Parse Registered event (or Transfer from 0x0) to get the tokenId
      const onChainAgentId = parseRegisteredEvent(receipt, iface);
      const txHash = receipt.hash || tx.hash;

      return apiRequest("POST", "/api/agents", {
        ...activeForm,
        walletAddress,
        userId: user.id,
        agentId: onChainAgentId,
        registrationTxHash: txHash,
        metadataUri: agentURI,
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents/wallet/all", walletAddress] });
      toast({ title: "Agent minted on-chain!", description: "Your new ERC-8004 agent is live on Base mainnet." });
      if (data?.id) setActiveAgentId(data.id);
      setCreateOpen(false);
      setForm({ name: "", personality: "analyst", bio: "" });
      setAutoPreview(generateRandomAgent());
    },
    onError: handleContractError,
  });

  const requestMutation = useMutation({
    mutationFn: async () => {
      if (!activeAgent || !targetAgent) throw new Error("Agent required");
      const provider = getProvider();
      if (!provider) throw new Error("No wallet provider found");

      let onChainRequestId: string | null = null;
      let txHash: string | null = null;

      if (isOnChainId(activeAgent.agentId) && isOnChainId(targetAgent.agentId)) {
        const registry = await getRegistryWithSigner(provider);
        const iface = new Interface(AGENT_REGISTRY_ABI as any);
        const descHash = hashDescription(reqForm.description);
        const budgetWei = reqForm.budget && reqForm.budget !== "0"
          ? BigInt(Math.round(parseFloat(reqForm.budget) * 1e6))
          : BigInt(0);

        const tx = await (registry as any).emitServiceRequest(
          activeAgent.agentId,
          targetAgent.agentId,
          reqForm.requestType,
          descHash,
          budgetWei,
          reqForm.budgetToken,
        );
        toast({ title: "Transaction submitted", description: "Waiting for Base mainnet confirmation…" });
        const receipt = await tx.wait();
        onChainRequestId = parseServiceRequestEvent(receipt, iface);
        txHash = receipt.hash || tx.hash;
      }

      return apiRequest("POST", "/api/agent-requests", {
        ...reqForm,
        fromAgentId: activeAgent.id,
        toAgentId: targetAgent.id,
        onChainRequestId,
        txHash,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-requests", activeAgent?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      const onChain = isOnChainId(activeAgent?.agentId) && isOnChainId(targetAgent?.agentId);
      toast({
        title: onChain ? "Request sent on-chain!" : "Request sent!",
        description: `Service request delivered to ${targetAgent?.name}.`,
      });
      setRequestOpen(false);
      setReqForm({ requestType: "shill", description: "", budget: "0", budgetToken: "USDC" });
    },
    onError: handleContractError,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, onChainRequestId }: { id: string; status: string; onChainRequestId?: string | null }) => {
      const provider = getProvider();
      if (status === "completed" && onChainRequestId && provider) {
        const registry = await getRegistryWithSigner(provider);
        const tx = await (registry as any).completeServiceRequest(onChainRequestId);
        toast({ title: "Transaction submitted", description: "Completing on Base mainnet…" });
        await tx.wait();
      }
      return apiRequest("PATCH", `/api/agent-requests/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-requests", activeAgent?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents/wallet/all", walletAddress] });
    },
    onError: (e: any) => {
      const msg = e?.message || "";
      const cancelled = msg.includes("user rejected") || msg.includes("User denied") || msg.includes("ACTION_REJECTED");
      if (!cancelled) toast({ title: "Error", description: msg.slice(0, 120), variant: "destructive" });
    },
  });

  const openRequest = (agent: MemeAgent) => {
    setTargetAgent(agent);
    setRequestOpen(true);
  };

  const incomingRequests = myRequests.filter(r => r.toAgentId === activeAgent?.id && r.status === "pending");
  const outgoingRequests = myRequests.filter(r => r.fromAgentId === activeAgent?.id);

  // Other agents from my wallet (not the active one)
  const otherMyAgents = myAgents.filter(a => a.id !== activeAgent?.id);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-gradient-to-br from-primary/60 to-accent/60 flex items-center justify-center">
              <Cpu className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Agent Hub</h1>
              <p className="text-xs text-muted-foreground">Based Lab — Agentic Identity & Marketplace</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!isWalletConnected ? (
              <Button onClick={() => setWalletModalOpen(true)} className="gap-2" data-testid="button-connect-agent-hub">
                <Fingerprint className="h-4 w-4" />
                Connect Wallet
              </Button>
            ) : (
              <>
                {activeAgent && (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Bot className="h-3 w-3" />
                    {activeAgent.name}
                    {myAgents.length > 1 && (
                      <span className="text-muted-foreground ml-0.5">+{myAgents.length - 1}</span>
                    )}
                  </Badge>
                )}
                <Button onClick={() => setCreateOpen(true)} className="gap-2" size="sm" data-testid="button-mint-agent">
                  <Plus className="h-4 w-4" />
                  New Agent
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <Tabs defaultValue="identity">
          <TabsList className="w-full mb-6" data-testid="tabs-agent-hub">
            <TabsTrigger value="identity" className="flex-1 gap-2" data-testid="tab-identity">
              <Fingerprint className="h-4 w-4" />
              Identity
            </TabsTrigger>
            <TabsTrigger value="agent" className="flex-1 gap-2" data-testid="tab-my-agent">
              <Bot className="h-4 w-4" />
              My Agents
              {myAgents.length > 0 && (
                <Badge className="text-xs bg-primary/20 text-primary border border-primary/30 ml-0.5">
                  {myAgents.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="marketplace" className="flex-1 gap-2" data-testid="tab-marketplace">
              <Users className="h-4 w-4" />
              Marketplace
            </TabsTrigger>
            <TabsTrigger value="mcp" className="flex-1 gap-2" data-testid="tab-mcp">
              <Plug className="h-4 w-4" />
              MCP
            </TabsTrigger>
            <TabsTrigger value="x402" className="flex-1 gap-2" data-testid="tab-x402">
              <Zap className="h-4 w-4" />
              x402
            </TabsTrigger>
          </TabsList>

          {/* ── TAB 1: Identity ── */}
          <TabsContent value="identity" className="space-y-4">

            {/* ── Registration Status Panel ── */}
            {isWalletConnected && (
              <Card data-testid="card-registration-status">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Shield className="h-5 w-5 text-primary" />
                      Registration Status
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => {
                        refetchOnChain();
                        queryClient.invalidateQueries({ queryKey: ["/api/agents/wallet/all", walletAddress] });
                      }}
                      disabled={onChainFetching}
                      data-testid="button-refresh-status"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${onChainFetching ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                  </div>
                  <CardDescription>Live check against Base mainnet — confirms what is actually stored on-chain.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {onChainLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Reading from Base mainnet…
                    </div>
                  ) : (
                    <>
                      {/* Step 1 — Wallet */}
                      <div className="flex items-center gap-3 p-3 rounded-md bg-green-500/10 border border-green-500/20">
                        <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-green-400">Wallet Connected</p>
                          <p className="text-xs text-muted-foreground font-mono truncate">{walletAddress}</p>
                        </div>
                        {walletType === "smart" && (
                          <Badge className="text-xs bg-blue-600 text-white flex-shrink-0"><Zap className="h-2.5 w-2.5 mr-1" />Smart</Badge>
                        )}
                      </div>

                      {/* Step 2 — SIWA */}
                      {isSiwaVerified ? (
                        <div className="flex items-center gap-3 p-3 rounded-md bg-primary/10 border border-primary/20">
                          <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-primary">SIWA Verified</p>
                            <p className="text-xs text-muted-foreground">Cryptographic signature proof stored locally</p>
                          </div>
                          <Badge className="text-xs bg-primary/20 text-primary border border-primary/30 flex-shrink-0">Verified</Badge>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 p-3 rounded-md bg-muted/40 border border-border">
                          <XCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold">SIWA Not Verified</p>
                            <p className="text-xs text-muted-foreground">Sign a message to prove wallet ownership</p>
                          </div>
                          <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0" onClick={handleVerifySiwa} disabled={siwaLoading} data-testid="button-status-verify-siwa">
                            {siwaLoading ? <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Pen className="h-3.5 w-3.5" />}
                            Verify
                          </Button>
                        </div>
                      )}

                      {/* Step 3 — ERC-8004 on-chain */}
                      {onChainStatus && onChainStatus.onChainCount > 0 ? (
                        <div className="flex items-start gap-3 p-3 rounded-md bg-green-500/10 border border-green-500/20">
                          <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-green-400">
                              ERC-8004 Registered — {onChainStatus.onChainCount} agent{onChainStatus.onChainCount > 1 ? "s" : ""} on official registry
                            </p>
                            <div className="mt-1 space-y-1">
                              {onChainStatus.onChainAgents.map(a => (
                                <div key={a.agentId} className="flex items-center gap-2">
                                  <div className="flex-1 min-w-0">
                                    <span className="text-xs text-foreground font-semibold">
                                      {a.name || "Unnamed Agent"}
                                    </span>
                                    <span className="text-xs text-muted-foreground ml-1.5 font-mono">
                                      #{a.agentId}
                                    </span>
                                  </div>
                                  {a.scan8004Url && (
                                    <a href={a.scan8004Url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                                      <Button size="sm" variant="outline" className="gap-1 h-6 text-xs px-2" data-testid={`link-8004scan-${a.agentId}`}>
                                        <ExternalLink className="h-2.5 w-2.5" />
                                        8004scan
                                      </Button>
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                          {onChainStatus.scan8004Url && (
                            <a href={onChainStatus.scan8004Url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                              <Button size="sm" variant="outline" className="gap-1" data-testid="link-browse-8004scan">
                                <ExternalLink className="h-3 w-3" />
                                8004scan
                              </Button>
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 p-3 rounded-md bg-muted/40 border border-border">
                          <XCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold">No ERC-8004 Agent On-Chain</p>
                            <p className="text-xs text-muted-foreground">
                              Official registry: <span className="font-mono">{AGENT_REGISTRY_ADDRESS.slice(0, 10)}…</span> on Base
                            </p>
                          </div>
                          <Button size="sm" className="gap-1.5 flex-shrink-0" onClick={() => setCreateOpen(true)} data-testid="button-status-mint">
                            <Plus className="h-3.5 w-3.5" />
                            Mint
                          </Button>
                        </div>
                      )}

                      {/* Step 4 — DB sync warning */}
                      {onChainStatus && !onChainStatus.dbSynced && onChainStatus.missingFromDb.length > 0 && (
                        <div className="flex items-start gap-3 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                          <AlertCircle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-yellow-400">
                              {onChainStatus.missingFromDb.length} on-chain agent{onChainStatus.missingFromDb.length > 1 ? "s" : ""} not in database
                            </p>
                            <p className="text-xs text-muted-foreground">
                              These agents exist on Base mainnet but haven't been synced to the app database. Minting again will re-sync them.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* All synced */}
                      {onChainStatus && onChainStatus.dbSynced && onChainStatus.onChainCount > 0 && (
                        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/20">
                          <CheckCircle className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
                          <p className="text-xs text-muted-foreground">
                            All {onChainStatus.onChainCount} on-chain agent{onChainStatus.onChainCount > 1 ? "s" : ""} synced to database
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              {/* SIWA card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <SiCoinbase className="h-5 w-5 text-blue-400" />
                    SIWA — Self-Sovereign Identity
                  </CardTitle>
                  <CardDescription>Sign In With Anything. Passkey-based, no seed phrase.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!isWalletConnected ? (
                    <Button onClick={() => setWalletModalOpen(true)} className="w-full gap-2" data-testid="button-identity-connect">
                      <Fingerprint className="h-4 w-4" />
                      Sign In With Passkey
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 border border-green-500/20">
                        <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-green-400">Wallet Connected</p>
                          <p className="text-xs text-muted-foreground font-mono truncate">{walletAddress?.slice(0, 14)}…{walletAddress?.slice(-6)}</p>
                        </div>
                        {walletType === 'smart' && (
                          <Badge className="text-xs bg-blue-600 text-white flex-shrink-0">
                            <Zap className="h-2.5 w-2.5 mr-1" />Smart
                          </Badge>
                        )}
                      </div>
                      {isSiwaVerified ? (
                        <div className="flex items-center gap-2 p-3 rounded-md bg-primary/10 border border-primary/20">
                          <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-primary">SIWA Verified</p>
                            <p className="text-xs text-muted-foreground">Cryptographic proof of ownership on file</p>
                          </div>
                        </div>
                      ) : (
                        <Button variant="outline" className="w-full gap-2" onClick={handleVerifySiwa} disabled={siwaLoading} data-testid="button-verify-siwa">
                          {siwaLoading ? (
                            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Pen className="h-4 w-4" />
                          )}
                          Verify with SIWA (Sign Message)
                        </Button>
                      )}
                      {walletType === 'smart' && (
                        <div className="flex items-center gap-2 p-3 rounded-md bg-blue-500/10 border border-blue-500/20">
                          <Zap className="h-4 w-4 text-blue-400 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-blue-400">ERC-4337 Smart Wallet Active</p>
                            <p className="text-xs text-muted-foreground">Base sponsors eligible gas fees</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="space-y-2 pt-1">
                    {[
                      { icon: Fingerprint, text: "Face ID / Touch ID authentication" },
                      { icon: Shield, text: "No seed phrase exposure" },
                      { icon: Zap, text: "Base sponsors gas fees" },
                    ].map(({ icon: Icon, text }) => (
                      <div key={text} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Icon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        {text}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Basename Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Globe className="h-5 w-5 text-cyan-400" />
                    Agent Domain Name
                  </CardTitle>
                  <CardDescription>Give your agents a human-readable identity with Basenames (.base.eth).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!isWalletConnected ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Connect wallet to check your Basename.</p>
                  ) : basenameData?.basename ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 rounded-md bg-cyan-500/10 border border-cyan-500/20">
                        <div className="w-10 h-10 rounded-full bg-cyan-600/30 flex items-center justify-center flex-shrink-0">
                          <Globe className="h-5 w-5 text-cyan-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-cyan-300 truncate">{basenameData.basename}</p>
                          <p className="text-xs text-muted-foreground">Registered Basename</p>
                        </div>
                        <CheckCircle className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Your agents appear as <span className="text-cyan-300 font-mono">{basenameData.basename}</span> in the marketplace.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 rounded-md bg-muted/30 border border-border">
                        <p className="text-xs text-muted-foreground mb-1">No Basename found for your wallet.</p>
                        <p className="text-xs text-muted-foreground">
                          Basenames like <span className="font-mono text-foreground">yourname.base.eth</span> give your agents a unique, human-readable identity on Base.
                        </p>
                      </div>
                      <a href={`https://www.base.org/names?address=${walletAddress}`} target="_blank" rel="noopener noreferrer" data-testid="link-get-basename">
                        <Button className="w-full gap-2 bg-cyan-600 hover:bg-cyan-500">
                          <Globe className="h-4 w-4" />
                          Get Your Basename
                          <ExternalLink className="h-3.5 w-3.5 ml-auto" />
                        </Button>
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Active agent quick view */}
            {isWalletConnected && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bot className="h-5 w-5 text-primary" />
                    ERC-8004 Agent Identities
                  </CardTitle>
                  <CardDescription>On-chain multi-agent registry (V2). Each wallet can own unlimited agents.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {myAgentsLoading ? (
                    <div className="h-20 flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : myAgents.length > 0 ? (
                    <div className="space-y-2">
                      <div className="p-3 rounded-md bg-primary/10 border border-primary/20">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <p className="text-xs font-semibold text-primary">{myAgents.length} Agent{myAgents.length > 1 ? "s" : ""} Registered</p>
                          {isSiwaVerified && (
                            <Badge className="text-xs bg-primary/20 text-primary border border-primary/30">
                              <CheckCircle className="h-2.5 w-2.5 mr-1" />SIWA Verified
                            </Badge>
                          )}
                          {basenameData?.basename && (
                            <Badge variant="outline" className="text-xs text-cyan-400 border-cyan-400/30">
                              {basenameData.basename}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs font-semibold">{activeAgent?.name}</p>
                        <p className="text-xs font-mono text-muted-foreground break-all">
                          {activeAgent?.agentId && /^\d+$/.test(activeAgent.agentId)
                            ? `#${activeAgent.agentId}`
                            : activeAgent?.agentId}
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {[
                          { label: "Agents", value: myAgents.length },
                          { label: "Total Rep", value: myAgents.reduce((s, a) => s + a.reputationScore, 0) },
                          { label: "Jobs Done", value: myAgents.reduce((s, a) => s + a.totalServicesDone, 0) },
                        ].map(({ label, value }) => (
                          <div key={label} className="p-2 rounded-md bg-muted/30">
                            <p className="text-sm font-bold">{value}</p>
                            <p className="text-xs text-muted-foreground">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 space-y-3">
                      <p className="text-sm text-muted-foreground">No agents registered yet.</p>
                      <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-2" data-testid="button-identity-mint">
                        <Plus className="h-4 w-4" />
                        Mint Your First Agent
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* How it works */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">How Agent Hub Works</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-3 gap-4">
                  {[
                    {
                      step: "1",
                      icon: Fingerprint,
                      title: "One-Tap Entry",
                      desc: "Connect with Base Smart Wallet using Face ID or fingerprint. No seed phrase, no setup friction.",
                    },
                    {
                      step: "2",
                      icon: Bot,
                      title: "Mint Multiple Agents",
                      desc: "Create unlimited ERC-8004 agents per wallet. Each has its own identity, personality, and reputation score.",
                    },
                    {
                      step: "3",
                      icon: Send,
                      title: "Agent Marketplace",
                      desc: "Send or receive service requests between agents. Completed jobs boost your Trust Score automatically.",
                    },
                  ].map(({ step, icon: Icon, title, desc }) => (
                    <div key={step} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                        {step}
                      </div>
                      <div>
                        <p className="text-sm font-semibold mb-1">{title}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAB 2: My Agents ── */}
          <TabsContent value="agent" className="space-y-4">
            {!isWalletConnected ? (
              <Card>
                <CardContent className="py-12 text-center space-y-4">
                  <Bot className="h-12 w-12 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground">Connect your wallet to create or view your meme agents.</p>
                  <Button onClick={() => setWalletModalOpen(true)} className="gap-2">
                    <Fingerprint className="h-4 w-4" />
                    Connect Wallet
                  </Button>
                </CardContent>
              </Card>
            ) : myAgentsLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : myAgents.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center space-y-4">
                  <Bot className="h-12 w-12 text-muted-foreground mx-auto" />
                  <div>
                    <p className="font-semibold mb-1">No Agents Yet</p>
                    <p className="text-sm text-muted-foreground">Mint your first meme agent to join the agentic economy.</p>
                  </div>
                  <Button onClick={() => setCreateOpen(true)} className="gap-2" data-testid="button-create-agent">
                    <Plus className="h-4 w-4" />
                    Mint My First Agent
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Active agent profile */}
                {activeAgent && (
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4 flex-wrap">
                        <Avatar className="h-16 w-16">
                          <AvatarFallback className="bg-gradient-to-br from-primary/50 to-accent/50 text-foreground font-black text-xl">
                            {activeAgent.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-bold text-lg">{activeAgent.name}</h2>
                            <Badge variant="outline" className={PERSONALITIES.find(p => p.value === activeAgent.personality)?.color}>
                              {PERSONALITIES.find(p => p.value === activeAgent.personality)?.label}
                            </Badge>
                            <Badge className={`gap-1 ${reputationLevel(activeAgent.reputationScore).bg} ${reputationLevel(activeAgent.reputationScore).color} border border-current/20`}>
                              <Star className="h-3 w-3" />
                              {reputationLevel(activeAgent.reputationScore).label}
                            </Badge>
                            {isOnChainId(activeAgent.agentId) && (
                              <Badge className="gap-1 bg-green-500/20 text-green-400 border border-green-500/30">
                                <CheckCircle className="h-3 w-3" />On-Chain
                              </Badge>
                            )}
                            {isSiwaVerified && (
                              <Badge className="gap-1 bg-primary/20 text-primary border border-primary/30">
                                <CheckCircle className="h-3 w-3" />SIWA
                              </Badge>
                            )}
                            {basenameData?.basename && (
                              <Badge variant="outline" className="gap-1 text-cyan-400 border-cyan-400/30">
                                <Globe className="h-3 w-3" />{basenameData.basename}
                              </Badge>
                            )}
                            <Badge className="text-xs bg-muted/50 text-muted-foreground border">Active</Badge>
                          </div>
                          {/^\d+$/.test(activeAgent.agentId) ? (
                            <p className="text-xs font-mono text-muted-foreground">Agent ID: <span className="text-green-400 font-semibold">#{activeAgent.agentId}</span></p>
                          ) : (
                            <p className="text-xs font-mono text-muted-foreground break-all">{activeAgent.agentId}</p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {/^\d+$/.test(activeAgent.agentId) && (
                              <a
                                href={get8004scanUrl(activeAgent.agentId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-green-400 hover:underline"
                                data-testid="link-8004scan-profile"
                              >
                                <ExternalLink className="h-3 w-3" />
                                View on 8004scan
                              </a>
                            )}
                            {activeAgent.registrationTxHash && (
                              <a
                                href={`https://basescan.org/tx/${activeAgent.registrationTxHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                                data-testid="link-registration-tx"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Basescan tx
                              </a>
                            )}
                          </div>
                          {activeAgent.bio && <p className="text-sm text-muted-foreground">{activeAgent.bio}</p>}
                          {!basenameData?.basename && (
                            <a href={`https://www.base.org/names?address=${walletAddress}`} target="_blank" rel="noopener noreferrer">
                              <Button size="sm" variant="outline" className="gap-1.5 text-cyan-400 border-cyan-400/30 mt-1">
                                <Globe className="h-3.5 w-3.5" />Get Basename
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mt-4">
                        {[
                          { label: "Reputation", value: activeAgent.reputationScore, icon: TrendingUp },
                          { label: "Shills", value: activeAgent.totalShills, icon: Activity },
                          { label: "Jobs Done", value: activeAgent.totalServicesDone, icon: Trophy },
                        ].map(({ label, value, icon: Icon }) => (
                          <div key={label} className="p-3 rounded-md bg-muted/30 text-center">
                            <Icon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                            <p className="text-lg font-bold">{value}</p>
                            <p className="text-xs text-muted-foreground">{label}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Other agents from same wallet */}
                {myAgents.length > 1 && (
                  <div>
                    <button
                      className="flex items-center gap-2 text-sm font-semibold mb-3 w-full text-left"
                      onClick={() => setShowAllMyAgents(v => !v)}
                      data-testid="button-toggle-all-agents"
                    >
                      <Bot className="h-4 w-4 text-muted-foreground" />
                      My Other Agents ({myAgents.length - 1})
                      {showAllMyAgents ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
                    </button>
                    {showAllMyAgents && (
                      <div className="grid sm:grid-cols-2 gap-3">
                        {otherMyAgents.map(a => (
                          <AgentCard
                            key={a.id}
                            agent={a}
                            activeAgentId={activeAgent?.id}
                            onSelect={agent => setActiveAgentId(agent.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Mint another agent */}
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setCreateOpen(true)}
                  data-testid="button-mint-another"
                >
                  <Plus className="h-4 w-4" />
                  Mint Another Agent
                </Button>

                {/* Incoming requests */}
                {incomingRequests.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <Send className="h-4 w-4 text-primary" />
                      Incoming Requests ({incomingRequests.length})
                    </h3>
                    <div className="space-y-2">
                      {incomingRequests.map(req => (
                        <Card key={req.id} data-testid={`card-request-${req.id}`}>
                          <CardContent className="p-4 flex flex-wrap items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs">{req.requestType}</Badge>
                                <span className="text-xs text-muted-foreground">{req.budget} {req.budgetToken}</span>
                              </div>
                              <p className="text-sm">{req.description}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline"
                                onClick={() => updateStatusMutation.mutate({ id: req.id, status: "rejected", onChainRequestId: req.onChainRequestId })}
                                data-testid={`button-reject-${req.id}`}>
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm"
                                onClick={() => updateStatusMutation.mutate({ id: req.id, status: "accepted", onChainRequestId: req.onChainRequestId })}
                                data-testid={`button-accept-${req.id}`}>
                                <CheckCircle className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Outgoing requests */}
                {outgoingRequests.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      My Requests
                    </h3>
                    <div className="space-y-2">
                      {outgoingRequests.map(req => (
                        <Card key={req.id}>
                          <CardContent className="p-4 flex flex-wrap items-center gap-3">
                            <StatusIcon status={req.status} />
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                <Badge variant="outline" className="text-xs">{req.requestType}</Badge>
                                <span className="text-xs text-muted-foreground capitalize">{req.status}</span>
                              </div>
                              <p className="text-sm text-muted-foreground truncate">{req.description}</p>
                            </div>
                            {req.status === "accepted" && (
                              <Button size="sm" variant="outline"
                                onClick={() => updateStatusMutation.mutate({ id: req.id, status: "completed", onChainRequestId: req.onChainRequestId })}
                                data-testid={`button-complete-${req.id}`}>
                                {req.onChainRequestId ? "Complete On-Chain" : "Complete"}
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* ── TAB 3: Marketplace ── */}
          <TabsContent value="marketplace" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Agent Marketplace</h2>
                <p className="text-xs text-muted-foreground">Trustless agent-to-agent service economy on Base.</p>
              </div>
              <Badge variant="outline" className="gap-1">
                <Users className="h-3 w-3" />
                {allAgents.length} agents
              </Badge>
            </div>

            {agentsLoading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <Card key={i}><CardContent className="p-4 h-40 bg-muted/20 animate-pulse rounded-md" /></Card>
                ))}
              </div>
            ) : allAgents.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center space-y-2">
                  <Users className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground">No agents registered yet. Be the first!</p>
                  {isWalletConnected && (
                    <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-2 mt-2">
                      <Plus className="h-4 w-4" />
                      Mint Agent
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {allAgents
                  .filter(a => a.id !== activeAgent?.id) // exclude own active agent from requestable list
                  .map(agent => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      activeAgentId={activeAgent?.id}
                      onRequest={activeAgent ? openRequest : undefined}
                    />
                  ))}
                {activeAgent && (
                  <AgentCard
                    key={activeAgent.id}
                    agent={activeAgent}
                    activeAgentId={activeAgent.id}
                  />
                )}
              </div>
            )}
          </TabsContent>

          {/* ── TAB 4: MCP Connect ── */}
          <TabsContent value="mcp" className="space-y-6">
            <MCPConnectTab walletAddress={walletAddress} activeAgent={activeAgent} />
          </TabsContent>

          <TabsContent value="x402" className="space-y-6">
            <X402PanelTab
              walletAddress={walletAddress}
              isWalletConnected={isWalletConnected}
              myAgents={myAgents}
              allAgents={allAgents}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Mint Agent Modal ── */}
      <Dialog open={createOpen} onOpenChange={v => { if (!createMutation.isPending) setCreateOpen(v); }}>
        <DialogContent className="sm:max-w-md" data-testid="modal-create-agent">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              {myAgents.length > 0 ? "Mint Another Agent" : "Mint Your Meme Agent"}
            </DialogTitle>
          </DialogHeader>

          {/* Mode switcher */}
          <div className="flex gap-1.5 p-1 bg-muted rounded-lg">
            <button
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-colors ${createMode === "manual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              onClick={() => setCreateMode("manual")}
              data-testid="button-mode-manual"
            >
              <Pen className="h-3.5 w-3.5" />
              Manual
            </button>
            <button
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-colors ${createMode === "auto" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              onClick={() => { setCreateMode("auto"); setAutoPreview(generateRandomAgent()); }}
              data-testid="button-mode-auto"
            >
              <Zap className="h-3.5 w-3.5 text-yellow-400" />
              Auto
            </button>
          </div>

          {/* ── MANUEL MODE ── */}
          {createMode === "manual" && (
            <div className="space-y-4">
              {myAgents.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  You already have {myAgents.length} agent{myAgents.length > 1 ? "s" : ""}. Each new agent gets its own on-chain ERC-8004 identity.
                </p>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Agent Name</label>
                <Input
                  placeholder="e.g. Doge-Analyst, PepeWhale"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  data-testid="input-agent-name"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Personality</label>
                <Select value={form.personality} onValueChange={v => setForm(f => ({ ...f, personality: v }))}>
                  <SelectTrigger data-testid="select-personality">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERSONALITIES.map(p => (
                      <SelectItem key={p.value} value={p.value}>
                        <span className={p.color}>{p.label}</span>
                        <span className="text-muted-foreground ml-2 text-xs">— {p.desc}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Bio <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Textarea
                  placeholder="What is your agent's mission?"
                  value={form.bio}
                  onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                  className="resize-none"
                  rows={3}
                  data-testid="textarea-agent-bio"
                />
              </div>
              <div className="p-3 rounded-md bg-primary/5 border border-primary/20 space-y-1">
                <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5" />
                  ERC-8004 On-Chain Registration
                </p>
                <p className="text-xs text-muted-foreground">Your wallet will sign a transaction on Base mainnet. No one-per-wallet limit.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>Cancel</Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending || !form.name.trim()}
                  data-testid="button-submit-create-agent"
                >
                  {createMutation.isPending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Cpu className="h-4 w-4" />}
                  {createMutation.isPending ? "Minting…" : "Mint Agent"}
                </Button>
              </div>
            </div>
          )}

          {/* ── AUTO MODE ── */}
          {createMode === "auto" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                A random agent has been generated. Re-roll if you want a different one, or mint it instantly.
              </p>

              {/* Preview card */}
              <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
                {/* Name + personality badge */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-base">{autoPreview.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {(() => {
                        const p = PERSONALITIES.find(x => x.value === autoPreview.personality);
                        return p ? (
                          <Badge variant="secondary" className={`text-[10px] ${p.color}`}>
                            {p.label}
                          </Badge>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                      {autoPreview.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>

                {/* Bio */}
                <p className="text-sm text-muted-foreground leading-relaxed italic">"{autoPreview.bio}"</p>

                {/* Re-roll button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => setAutoPreview(generateRandomAgent())}
                  disabled={createMutation.isPending}
                  data-testid="button-reroll-agent"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Generate Another
                </Button>
              </div>

              <div className="p-3 rounded-md bg-yellow-400/5 border border-yellow-400/20 space-y-1">
                <p className="text-xs font-semibold text-yellow-400 flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5" />
                  Quick Mint — ERC-8004 On-Chain
                </p>
                <p className="text-xs text-muted-foreground">One click to register your agent on Base mainnet. No per-wallet limit.</p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>Cancel</Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending}
                  data-testid="button-auto-mint-agent"
                >
                  {createMutation.isPending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Zap className="h-4 w-4" />}
                  {createMutation.isPending ? "Minting…" : "Quick Mint"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Service Request Modal ── */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="sm:max-w-md" data-testid="modal-service-request">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Request: {targetAgent?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {myAgents.length > 1 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Send From Agent</label>
                <Select value={activeAgent?.id ?? ""} onValueChange={v => setActiveAgentId(v)}>
                  <SelectTrigger data-testid="select-from-agent">
                    <SelectValue placeholder="Select agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {myAgents.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                        {isOnChainId(a.agentId) && " (On-Chain)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Request Type</label>
              <Select value={reqForm.requestType} onValueChange={v => setReqForm(f => ({ ...f, requestType: v }))}>
                <SelectTrigger data-testid="select-request-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REQUEST_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Describe your service request…"
                value={reqForm.description}
                onChange={e => setReqForm(f => ({ ...f, description: e.target.value }))}
                className="resize-none"
                rows={3}
                data-testid="textarea-request-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Budget</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={reqForm.budget}
                  onChange={e => setReqForm(f => ({ ...f, budget: e.target.value }))}
                  data-testid="input-request-budget"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Token</label>
                <Select value={reqForm.budgetToken} onValueChange={v => setReqForm(f => ({ ...f, budgetToken: v }))}>
                  <SelectTrigger data-testid="select-budget-token">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["USDC", "ETH", "DEGEN", "BRETT"].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isOnChainId(activeAgent?.agentId) && isOnChainId(targetAgent?.agentId) && (
              <div className="p-3 rounded-md bg-green-500/10 border border-green-500/20">
                <p className="text-xs text-green-400 flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Both agents are on-chain — request will be recorded on Base mainnet.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setRequestOpen(false)} disabled={requestMutation.isPending}>
                Cancel
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={() => requestMutation.mutate()}
                disabled={requestMutation.isPending || !reqForm.description.trim()}
                data-testid="button-submit-request"
              >
                {requestMutation.isPending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {requestMutation.isPending ? "Sending…" : "Send Request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <WalletSelectorModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
    </div>
  );
}
