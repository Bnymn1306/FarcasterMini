import { ethers } from 'ethers';

const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

interface TokenMonitorConfig {
  tokenAddress: string;
  userAddress: string;
  userBalance: string;
  initialLiquidity?: string;
  initialOwner?: string;
  initialBuyTax?: number;
  initialSellTax?: number;
  initialMaxTx?: string;
  initialMaxWallet?: string;
  autoSellEnabled: boolean;
  createdAt: number;
}

interface RugpullSignal {
  type: 'LIQUIDITY_REMOVAL' | 'OWNERSHIP_CHANGE' | 'HONEYPOT' | 'TAX_INCREASE' | 'MAX_TX_CHANGE' | 'BLACKLIST' | 'PAUSE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  timestamp: number;
  details: Record<string, any>;
}

interface MonitoredToken extends TokenMonitorConfig {
  signals: RugpullSignal[];
  lastCheck: number;
  status: 'active' | 'sold' | 'rugged' | 'stopped';
  currentLiquidity?: string;
  currentOwner?: string;
  currentBuyTax?: number;
  currentSellTax?: number;
}

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function owner() view returns (address)',
  'function _maxTxAmount() view returns (uint256)',
  'function _maxWalletToken() view returns (uint256)',
  'function maxTransactionAmount() view returns (uint256)',
  'function maxWallet() view returns (uint256)',
  'function _buyTax() view returns (uint256)',
  'function _sellTax() view returns (uint256)',
  'function buyTax() view returns (uint256)',
  'function sellTax() view returns (uint256)',
  'function buyFee() view returns (uint256)',
  'function sellFee() view returns (uint256)',
  'function _taxFee() view returns (uint256)',
  'function isBlacklisted(address) view returns (bool)',
  'function _isBlacklisted(address) view returns (bool)',
  'function paused() view returns (bool)',
  'function tradingEnabled() view returns (bool)',
  'function tradingActive() view returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

const UNISWAP_V2_PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function totalSupply() view returns (uint256)',
];

const UNISWAP_V2_FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) view returns (address pair)',
];

const WETH_BASE = '0x4200000000000000000000000000000000000006';
const UNISWAP_V2_FACTORY = '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6';
const AERODROME_FACTORY = '0x420DD381b31aEf6683db6B902084cB0FFECe40Da';

class RugpullDetector {
  private provider: ethers.JsonRpcProvider;
  private monitoredTokens: Map<string, MonitoredToken> = new Map();
  private isRunning: boolean = false;
  private checkInterval: number = 100;
  private signalCallbacks: ((signal: RugpullSignal, token: MonitoredToken) => void)[] = [];
  private autoSellCallback?: (token: MonitoredToken, signal: RugpullSignal) => Promise<boolean>;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    console.log('🛡️ RugpullDetector initialized with Base RPC:', BASE_RPC_URL);
  }

  onSignal(callback: (signal: RugpullSignal, token: MonitoredToken) => void) {
    this.signalCallbacks.push(callback);
  }

  setAutoSellCallback(callback: (token: MonitoredToken, signal: RugpullSignal) => Promise<boolean>) {
    this.autoSellCallback = callback;
  }

  async addToken(config: TokenMonitorConfig): Promise<MonitoredToken> {
    const key = `${config.tokenAddress.toLowerCase()}-${config.userAddress.toLowerCase()}`;
    
    const initialData = await this.fetchTokenData(config.tokenAddress, config.userAddress);
    
    const monitored: MonitoredToken = {
      ...config,
      tokenAddress: config.tokenAddress.toLowerCase(),
      userAddress: config.userAddress.toLowerCase(),
      initialLiquidity: config.initialLiquidity || initialData.liquidity,
      initialOwner: config.initialOwner || initialData.owner,
      initialBuyTax: config.initialBuyTax ?? initialData.buyTax,
      initialSellTax: config.initialSellTax ?? initialData.sellTax,
      initialMaxTx: config.initialMaxTx || initialData.maxTx,
      initialMaxWallet: config.initialMaxWallet || initialData.maxWallet,
      signals: [],
      lastCheck: Date.now(),
      status: 'active',
      currentLiquidity: initialData.liquidity,
      currentOwner: initialData.owner,
      currentBuyTax: initialData.buyTax,
      currentSellTax: initialData.sellTax,
    };

    this.monitoredTokens.set(key, monitored);
    console.log(`🔍 Added token to monitor: ${config.tokenAddress}`);
    console.log(`   Initial liquidity: ${initialData.liquidity} ETH`);
    console.log(`   Owner: ${initialData.owner}`);
    console.log(`   Buy/Sell Tax: ${initialData.buyTax}%/${initialData.sellTax}%`);

    return monitored;
  }

  removeToken(tokenAddress: string, userAddress: string) {
    const key = `${tokenAddress.toLowerCase()}-${userAddress.toLowerCase()}`;
    this.monitoredTokens.delete(key);
    console.log(`🗑️ Removed token from monitor: ${tokenAddress}`);
  }

  getMonitoredTokens(): MonitoredToken[] {
    return Array.from(this.monitoredTokens.values());
  }

  getToken(tokenAddress: string, userAddress: string): MonitoredToken | undefined {
    const key = `${tokenAddress.toLowerCase()}-${userAddress.toLowerCase()}`;
    return this.monitoredTokens.get(key);
  }

  private async fetchTokenData(tokenAddress: string, userAddress: string) {
    const result = {
      liquidity: '0',
      owner: ethers.ZeroAddress,
      buyTax: 0,
      sellTax: 0,
      maxTx: '0',
      maxWallet: '0',
      isHoneypot: false,
      isBlacklisted: false,
      isPaused: false,
      tradingEnabled: true,
    };

    try {
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);

      try {
        result.owner = await tokenContract.owner();
      } catch {}

      const taxMethods = [
        ['buyTax', 'sellTax'],
        ['_buyTax', '_sellTax'],
        ['buyFee', 'sellFee'],
      ];

      for (const [buyMethod, sellMethod] of taxMethods) {
        try {
          const buyTax = await tokenContract[buyMethod]();
          const sellTax = await tokenContract[sellMethod]();
          result.buyTax = Number(buyTax);
          result.sellTax = Number(sellTax);
          break;
        } catch {}
      }

      const maxTxMethods = ['maxTransactionAmount', '_maxTxAmount'];
      for (const method of maxTxMethods) {
        try {
          result.maxTx = (await tokenContract[method]()).toString();
          break;
        } catch {}
      }

      const maxWalletMethods = ['maxWallet', '_maxWalletToken'];
      for (const method of maxWalletMethods) {
        try {
          result.maxWallet = (await tokenContract[method]()).toString();
          break;
        } catch {}
      }

      try {
        result.isBlacklisted = await tokenContract.isBlacklisted(userAddress);
      } catch {
        try {
          result.isBlacklisted = await tokenContract._isBlacklisted(userAddress);
        } catch {}
      }

      try {
        result.isPaused = await tokenContract.paused();
      } catch {}

      const tradingMethods = ['tradingEnabled', 'tradingActive'];
      for (const method of tradingMethods) {
        try {
          result.tradingEnabled = await tokenContract[method]();
          break;
        } catch {}
      }

      result.liquidity = await this.getLiquidity(tokenAddress);

    } catch (error) {
      console.error(`Error fetching token data for ${tokenAddress}:`, error);
    }

    return result;
  }

  private async getLiquidity(tokenAddress: string): Promise<string> {
    try {
      // First try DEXScreener API for accurate liquidity data
      const dexScreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
      const response = await fetch(dexScreenerUrl);
      if (response.ok) {
        const data = await response.json();
        if (data.pairs && data.pairs.length > 0) {
          // Find Base chain pair with highest liquidity
          const basePairs = data.pairs.filter((p: any) => p.chainId === 'base');
          if (basePairs.length > 0) {
            // Get total liquidity in USD, convert to ETH equivalent
            const topPair = basePairs.sort((a: any, b: any) => 
              (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
            )[0];
            const liquidityUsd = topPair.liquidity?.usd || 0;
            // Approximate ETH value (rough conversion)
            const ethPrice = 3500; // Approximate ETH price
            const liquidityEth = liquidityUsd / ethPrice;
            if (liquidityEth > 0) {
              return liquidityEth.toFixed(4);
            }
          }
        }
      }
    } catch (error) {
      // Fall through to on-chain method
    }

    // Fallback: try on-chain liquidity detection
    try {
      const uniswapFactory = new ethers.Contract(UNISWAP_V2_FACTORY, UNISWAP_V2_FACTORY_ABI, this.provider);
      let pairAddress = await uniswapFactory.getPair(tokenAddress, WETH_BASE);

      if (pairAddress === ethers.ZeroAddress) {
        const aerodromeFactory = new ethers.Contract(AERODROME_FACTORY, UNISWAP_V2_FACTORY_ABI, this.provider);
        pairAddress = await aerodromeFactory.getPair(tokenAddress, WETH_BASE);
      }

      if (pairAddress === ethers.ZeroAddress) {
        return '0';
      }

      const pairContract = new ethers.Contract(pairAddress, UNISWAP_V2_PAIR_ABI, this.provider);
      const [reserve0, reserve1] = await pairContract.getReserves();
      const token0 = await pairContract.token0();

      const wethReserve = token0.toLowerCase() === WETH_BASE.toLowerCase() ? reserve0 : reserve1;
      return ethers.formatEther(wethReserve);
    } catch (error) {
      return '0';
    }
  }

  private async checkToken(token: MonitoredToken): Promise<RugpullSignal[]> {
    const signals: RugpullSignal[] = [];
    const now = Date.now();

    try {
      const currentData = await this.fetchTokenData(token.tokenAddress, token.userAddress);

      const initialLiq = parseFloat(token.initialLiquidity || '0');
      const currentLiq = parseFloat(currentData.liquidity);
      token.currentLiquidity = currentData.liquidity;

      if (initialLiq > 0) {
        const liqDropPercent = ((initialLiq - currentLiq) / initialLiq) * 100;

        if (liqDropPercent >= 90) {
          signals.push({
            type: 'LIQUIDITY_REMOVAL',
            severity: 'CRITICAL',
            message: `🚨 CRITICAL: ${liqDropPercent.toFixed(1)}% liquidity removed! RUG PULL DETECTED!`,
            timestamp: now,
            details: { initialLiq, currentLiq, dropPercent: liqDropPercent }
          });
        } else if (liqDropPercent >= 50) {
          signals.push({
            type: 'LIQUIDITY_REMOVAL',
            severity: 'HIGH',
            message: `⚠️ HIGH RISK: ${liqDropPercent.toFixed(1)}% liquidity removed`,
            timestamp: now,
            details: { initialLiq, currentLiq, dropPercent: liqDropPercent }
          });
        } else if (liqDropPercent >= 20) {
          signals.push({
            type: 'LIQUIDITY_REMOVAL',
            severity: 'MEDIUM',
            message: `⚡ WARNING: ${liqDropPercent.toFixed(1)}% liquidity removed`,
            timestamp: now,
            details: { initialLiq, currentLiq, dropPercent: liqDropPercent }
          });
        }
      }

      if (token.initialOwner && 
          currentData.owner !== token.initialOwner && 
          currentData.owner !== ethers.ZeroAddress &&
          token.initialOwner !== ethers.ZeroAddress) {
        signals.push({
          type: 'OWNERSHIP_CHANGE',
          severity: 'HIGH',
          message: `🔄 Owner changed from ${token.initialOwner.slice(0,10)}... to ${currentData.owner.slice(0,10)}...`,
          timestamp: now,
          details: { oldOwner: token.initialOwner, newOwner: currentData.owner }
        });
      }
      token.currentOwner = currentData.owner;

      const buyTaxIncrease = currentData.buyTax - (token.initialBuyTax || 0);
      const sellTaxIncrease = currentData.sellTax - (token.initialSellTax || 0);
      token.currentBuyTax = currentData.buyTax;
      token.currentSellTax = currentData.sellTax;

      if (currentData.sellTax >= 90) {
        signals.push({
          type: 'HONEYPOT',
          severity: 'CRITICAL',
          message: `🍯 HONEYPOT DETECTED! Sell tax is ${currentData.sellTax}%!`,
          timestamp: now,
          details: { sellTax: currentData.sellTax }
        });
      } else if (sellTaxIncrease >= 20) {
        signals.push({
          type: 'TAX_INCREASE',
          severity: 'HIGH',
          message: `📈 Sell tax increased by ${sellTaxIncrease}% (now ${currentData.sellTax}%)`,
          timestamp: now,
          details: { oldTax: token.initialSellTax, newTax: currentData.sellTax, increase: sellTaxIncrease }
        });
      } else if (buyTaxIncrease >= 20) {
        signals.push({
          type: 'TAX_INCREASE',
          severity: 'MEDIUM',
          message: `📈 Buy tax increased by ${buyTaxIncrease}% (now ${currentData.buyTax}%)`,
          timestamp: now,
          details: { oldTax: token.initialBuyTax, newTax: currentData.buyTax, increase: buyTaxIncrease }
        });
      }

      if (currentData.isBlacklisted) {
        signals.push({
          type: 'BLACKLIST',
          severity: 'CRITICAL',
          message: `🚫 Your address has been BLACKLISTED!`,
          timestamp: now,
          details: { userAddress: token.userAddress }
        });
      }

      if (currentData.isPaused || !currentData.tradingEnabled) {
        signals.push({
          type: 'PAUSE',
          severity: 'CRITICAL',
          message: `⏸️ Trading has been PAUSED or DISABLED!`,
          timestamp: now,
          details: { isPaused: currentData.isPaused, tradingEnabled: currentData.tradingEnabled }
        });
      }

      token.lastCheck = now;
      token.signals.push(...signals);

      if (token.signals.length > 100) {
        token.signals = token.signals.slice(-100);
      }

    } catch (error) {
      console.error(`Error checking token ${token.tokenAddress}:`, error);
    }

    return signals;
  }

  private async processSignals(token: MonitoredToken, signals: RugpullSignal[]) {
    for (const signal of signals) {
      for (const callback of this.signalCallbacks) {
        try {
          callback(signal, token);
        } catch (error) {
          console.error('Error in signal callback:', error);
        }
      }

      if (token.autoSellEnabled && 
          (signal.severity === 'CRITICAL' || signal.severity === 'HIGH') && 
          this.autoSellCallback) {
        console.log(`🚨 AUTO-SELL TRIGGERED for ${token.tokenAddress}`);
        console.log(`   Signal: ${signal.message}`);
        
        try {
          const success = await this.autoSellCallback(token, signal);
          if (success) {
            token.status = 'sold';
            console.log(`✅ Auto-sell executed successfully`);
          } else {
            console.log(`❌ Auto-sell failed`);
          }
        } catch (error) {
          console.error(`Auto-sell error:`, error);
        }
      }
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️ RugpullDetector already running');
      return;
    }

    this.isRunning = true;
    console.log(`🛡️ RugpullDetector started (${this.checkInterval}ms interval)`);

    const runLoop = async () => {
      while (this.isRunning) {
        const startTime = Date.now();
        
        for (const token of Array.from(this.monitoredTokens.values())) {
          if (token.status !== 'active') continue;
          
          try {
            const signals = await this.checkToken(token);
            if (signals.length > 0) {
              await this.processSignals(token, signals);
            }
          } catch (error) {
            console.error(`Error in monitoring loop for ${token.tokenAddress}:`, error);
          }
        }

        const elapsed = Date.now() - startTime;
        const sleepTime = Math.max(0, this.checkInterval - elapsed);
        
        if (sleepTime > 0) {
          await new Promise(resolve => setTimeout(resolve, sleepTime));
        }
      }
    };

    runLoop().catch(error => {
      console.error('RugpullDetector loop crashed:', error);
      this.isRunning = false;
    });
  }

  stop() {
    this.isRunning = false;
    console.log('🛑 RugpullDetector stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getStats() {
    const tokens = Array.from(this.monitoredTokens.values());
    return {
      isRunning: this.isRunning,
      totalMonitored: tokens.length,
      activeTokens: tokens.filter(t => t.status === 'active').length,
      soldTokens: tokens.filter(t => t.status === 'sold').length,
      ruggedTokens: tokens.filter(t => t.status === 'rugged').length,
      totalSignals: tokens.reduce((sum, t) => sum + t.signals.length, 0),
      criticalSignals: tokens.reduce((sum, t) => sum + t.signals.filter(s => s.severity === 'CRITICAL').length, 0),
    };
  }
}

export const rugpullDetector = new RugpullDetector();
export type { TokenMonitorConfig, MonitoredToken, RugpullSignal };
