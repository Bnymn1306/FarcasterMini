import { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, Info, Zap, Target } from 'lucide-react';
import { LimitOrdersPanel } from '@/components/LimitOrdersPanel';
import { SwapInterface } from '@/components/SwapInterface';
import { SolanaSwapInterface } from '@/components/SolanaSwapInterface';
import { SoneiumSwapInterface } from '@/components/SoneiumSwapInterface';
import { SoneiumLimitOrdersPanel } from '@/components/SoneiumLimitOrdersPanel';
import { InkSwapInterface } from '@/components/InkSwapInterface';
import { InkLimitOrdersPanel } from '@/components/InkLimitOrdersPanel';
import { JupiterLimitOrderPanel } from '@/components/JupiterLimitOrderPanel';
import TrendingTicker from '@/components/TrendingTicker';
import SolanaTrendingTicker from '@/components/SolanaTrendingTicker';
import { TokenInfoSidebar } from '@/components/TokenInfoSidebar';
import { Token } from '@/lib/tokens';
import { useChain } from '@/contexts/ChainContext';
import { ChainLogo } from '@/components/ChainSelector';

function isInFarcasterFrame(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'farcasterFrame' in window ||
    window.self !== window.top ||
    navigator.userAgent?.toLowerCase().includes('farcaster')
  );
}

export default function Swap() {
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const { currentChain, chainInfo } = useChain();

  const handleTokenChange = useCallback((token: any) => {
    setSelectedToken(token);
  }, []);

  const isBase = currentChain === 'base';
  const isSolana = currentChain === 'solana';
  const isSoneium = currentChain === 'soneium';
  const isInk = currentChain === 'ink';

  const isNonBase = isSolana || isSoneium || isInk;

  return (
    <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8 max-w-7xl">
      <div className="mb-4 sm:mb-8">
        <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
          <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            DEX Trading
          </h1>
          <Badge variant="outline" className="border-primary text-primary text-xs sm:text-sm flex items-center gap-1.5">
            <ChainLogo chain={currentChain} className="h-4 w-4" />
            {chainInfo.name}
          </Badge>
        </div>
        <p className="text-sm sm:text-base text-muted-foreground">
          {isBase
            ? 'Swap tokens instantly or place limit orders for automated trading'
            : isSoneium
            ? 'Swap tokens instantly or place limit orders on Soneium L2'
            : isInk
            ? 'Swap tokens instantly or place limit orders on INK L2'
            : 'Swap tokens instantly via Jupiter aggregator'
          }
        </p>
      </div>

      {isBase && (
        <div className="mb-6 -mx-4">
          <TrendingTicker onTokenClick={handleTokenChange} />
        </div>
      )}

      {isSolana && (
        <div className="mb-6 -mx-4">
          <SolanaTrendingTicker onTokenClick={(token) => {
            setSelectedToken({
              address: token.address,
              name: token.name,
              symbol: token.symbol,
              decimals: 9,
              logoURI: token.logoUrl,
            });
          }} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2">
          {isBase ? (
            <Tabs defaultValue="swap" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="swap" className="gap-2" data-testid="tab-swap">
                  <Zap className="h-4 w-4" />
                  Instant Swap
                </TabsTrigger>
                <TabsTrigger value="limit" className="gap-2" data-testid="tab-limit">
                  <Target className="h-4 w-4" />
                  Limit Orders
                </TabsTrigger>
              </TabsList>

              <TabsContent value="swap">
                <SwapInterface onToTokenChange={handleTokenChange} />
              </TabsContent>

              <TabsContent value="limit">
                <LimitOrdersPanel onTokenChange={handleTokenChange} />
              </TabsContent>
            </Tabs>
          ) : isSoneium ? (
            <Tabs defaultValue="swap" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="swap" className="gap-2" data-testid="tab-soneium-swap">
                  <Zap className="h-4 w-4" />
                  Instant Swap
                </TabsTrigger>
                <TabsTrigger value="limit" className="gap-2" data-testid="tab-soneium-limit">
                  <Target className="h-4 w-4" />
                  Limit Orders
                </TabsTrigger>
              </TabsList>

              <TabsContent value="swap">
                <SoneiumSwapInterface onToTokenChange={handleTokenChange} />
              </TabsContent>

              <TabsContent value="limit">
                <SoneiumLimitOrdersPanel onTokenChange={(token) => {
                  if (token) {
                    setSelectedToken({
                      address: token.address,
                      name: token.name,
                      symbol: token.symbol,
                      decimals: token.decimals,
                      logoURI: token.logoURI,
                    });
                  }
                }} />
              </TabsContent>
            </Tabs>
          ) : isInk ? (
            <Tabs defaultValue="swap" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="swap" className="gap-2" data-testid="tab-ink-swap">
                  <Zap className="h-4 w-4" />
                  Instant Swap
                </TabsTrigger>
                <TabsTrigger value="limit" className="gap-2" data-testid="tab-ink-limit">
                  <Target className="h-4 w-4" />
                  Limit Orders
                </TabsTrigger>
              </TabsList>

              <TabsContent value="swap">
                <InkSwapInterface onToTokenChange={handleTokenChange} />
              </TabsContent>

              <TabsContent value="limit">
                <InkLimitOrdersPanel onTokenChange={(token) => {
                  if (token) {
                    setSelectedToken({
                      address: token.address,
                      name: token.name,
                      symbol: token.symbol,
                      decimals: token.decimals,
                      logoURI: token.logoURI,
                    });
                  }
                }} />
              </TabsContent>
            </Tabs>
          ) : (
            <Tabs defaultValue="swap" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="swap" className="gap-2" data-testid="tab-solana-swap">
                  <Zap className="h-4 w-4" />
                  Instant Swap
                </TabsTrigger>
                <TabsTrigger
                  value="limit"
                  className="gap-2"
                  data-testid="tab-solana-limit"
                >
                  <Target className="h-4 w-4" />
                  Limit Orders
                </TabsTrigger>
              </TabsList>

              <TabsContent value="swap">
                <SolanaSwapInterface onToTokenChange={handleTokenChange} />
              </TabsContent>

              <TabsContent value="limit">
                <JupiterLimitOrderPanel onTokenChange={(token) => {
                  if (token) {
                    setSelectedToken({
                      address: token.address,
                      name: token.name,
                      symbol: token.symbol,
                      decimals: token.decimals,
                      logoURI: token.logoURI,
                    });
                  }
                }} />
              </TabsContent>
            </Tabs>
          )}
        </div>

        <div className="space-y-4 sm:space-y-6">
          {isBase && <TokenInfoSidebar token={selectedToken} />}

          <Card className={`p-4 sm:p-6 ${isNonBase ? 'hidden sm:block' : ''}`}>
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <Info className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              <h3 className="font-bold text-sm sm:text-base">Features</h3>
            </div>
            <ul className="space-y-2 sm:space-y-3 text-xs sm:text-sm">
              {isBase ? (
                <>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Best price routing across Uniswap V2 &amp; V3</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Low slippage protection</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Native Base L2 support</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Automated limit orders</span>
                  </li>
                </>
              ) : isSoneium ? (
                <>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Sony's Ethereum L2 network</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Zero-fee swaps via KYO Finance</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Automated limit orders with vault</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Low gas fees, fast blocks</span>
                  </li>
                </>
              ) : isInk ? (
                <>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Kraken's Ethereum L2 network</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Fast, low-cost swaps</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Automated limit orders with vault</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>OP Stack chain, EVM compatible</span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Powered by Jupiter aggregator</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Best price across Solana DEXs</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Low slippage protection</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Jupiter limit orders with Keeper execution</span>
                  </li>
                </>
              )}
              <li className="flex items-start gap-2">
                <span className="text-primary">✓</span>
                <span>Non-custodial - you control your funds</span>
              </li>
            </ul>
          </Card>

          <Card className={`p-4 sm:p-6 ${isNonBase ? 'hidden sm:block' : ''}`}>
            <h3 className="font-bold mb-3 sm:mb-4 text-sm sm:text-base">Popular on {chainInfo.name}</h3>
            <div className="space-y-2">
              {isBase ? (
                <>
                  <div className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full" />
                      <div>
                        <div className="font-semibold text-sm">ETH</div>
                        <div className="text-xs text-muted-foreground">Ethereum</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-500 rounded-full" />
                      <div>
                        <div className="font-semibold text-sm">USDC</div>
                        <div className="text-xs text-muted-foreground">USD Coin</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full" />
                      <div>
                        <div className="font-semibold text-sm">DEGEN</div>
                        <div className="text-xs text-muted-foreground">Degen</div>
                      </div>
                    </div>
                  </div>
                </>
              ) : isSoneium ? (
                <>
                  <div className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full" />
                      <div>
                        <div className="font-semibold text-sm">ETH</div>
                        <div className="text-xs text-muted-foreground">Ethereum</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-500 rounded-full" />
                      <div>
                        <div className="font-semibold text-sm">WETH</div>
                        <div className="text-xs text-muted-foreground">Wrapped Ether</div>
                      </div>
                    </div>
                  </div>
                </>
              ) : isInk ? (
                <>
                  <div className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full" />
                      <div>
                        <div className="font-semibold text-sm">ETH</div>
                        <div className="text-xs text-muted-foreground">Ethereum</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full" />
                      <div>
                        <div className="font-semibold text-sm">WETH</div>
                        <div className="text-xs text-muted-foreground">Wrapped Ether</div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full" />
                      <div>
                        <div className="font-semibold text-sm">SOL</div>
                        <div className="text-xs text-muted-foreground">Solana</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-500 rounded-full" />
                      <div>
                        <div className="font-semibold text-sm">USDC</div>
                        <div className="text-xs text-muted-foreground">USD Coin</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-orange-500 rounded-full" />
                      <div>
                        <div className="font-semibold text-sm">BONK</div>
                        <div className="text-xs text-muted-foreground">Bonk</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card className={`p-3 sm:p-4 bg-muted/30 ${isNonBase ? 'hidden sm:block' : ''}`}>
            <p className="text-xs text-muted-foreground">
              {isBase
                ? "All swaps are executed on-chain on Base L2. Always verify transaction details before confirming."
                : isSoneium
                ? "All swaps are executed on Soneium L2. Always verify transaction details before confirming."
                : isInk
                ? "All swaps are executed on INK L2. Always verify transaction details before confirming."
                : "All swaps are executed on Solana mainnet via Jupiter. Always verify transaction details before confirming."
              }
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
