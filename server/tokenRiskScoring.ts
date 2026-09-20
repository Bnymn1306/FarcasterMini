import { ethers } from 'ethers';

export type TokenRiskLevel = 'approved' | 'guarded' | 'blocked';

export interface TokenRiskScore {
  address: string;
  riskLevel: TokenRiskLevel;
  score: number; // 0-100 (0 = safest, 100 = most risky)
  checks: {
    isERC20Valid: boolean;
    hasLiquidity: boolean;
    isOnWhitelist: boolean;
    isOnBlacklist: boolean;
    hasReasonableDecimals: boolean;
    liquidityUSD?: number;
  };
  warnings: string[];
  blockedReasons: string[];
}

// Whitelisted tokens with metadata (known safe tokens on Base)
const WHITELISTED_TOKENS = [
  { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', symbol: 'AERO', name: 'Aerodrome Finance', decimals: 18 },
  { address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Eff9Ed', symbol: 'DEGEN', name: 'Degen', decimals: 18 },
  { address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', symbol: 'BRETT', name: 'Brett', decimals: 18 },
  { address: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', symbol: 'VIRTUAL', name: 'Virtual Protocol', decimals: 18 },
];

// Extended popular Base tokens list (for wallet balance discovery)
export const POPULAR_BASE_TOKENS = [
  ...WHITELISTED_TOKENS,
  // Top Base chain tokens (by market cap/volume)
  { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
  { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', symbol: 'USDbC', name: 'USD Base Coin', decimals: 6 },
  { address: '0xfA980cEd6895AC314E7dE34Ef1bFAE90a5AdD21b', symbol: 'PRIME', name: 'Prime', decimals: 18 },
  { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH', decimals: 18 },
  { address: '0xB6fe221Fe9EeF5aBa221c348bA20A1Bf5e73624c', symbol: 'RLB', name: 'Rollbit Coin', decimals: 18 },
  { address: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42', symbol: 'EURC', name: 'Euro Coin', decimals: 6 },
  { address: '0xd85c31854c2B0Fb40aaA9E2Fc4Da23C21f829d46', symbol: 'PING', name: 'Ping', decimals: 18 },
  { address: '0x236aa50979D5f3De3Bd1Eeb40E81137F22ab794b', symbol: 'tBTC', name: 'Threshold Bitcoin', decimals: 18 },
  { address: '0x4A3A6Dd60A34bB2Aba60D73B4C88315E9CeB6A3D', symbol: 'MOG', name: 'Mog Coin', decimals: 18 },
  { address: '0x97c806e7665d3AFd84A8Fe1837921403D59F3Dcc', symbol: 'WELL', name: 'Moonwell', decimals: 18 },
  { address: '0x6921B130D297cc43754afba22e5EAc0FBf8Db75b', symbol: 'DOGINME', name: 'Dog In Me', decimals: 18 },
  { address: '0x9EaF8C1E34F05a589EDa6BAfdF391Cf6Ad3CB239', symbol: 'YFI', name: 'yearn.finance', decimals: 18 },
  { address: '0x3992B27dA26848C2b19CeA6Fd25ad5568B68AB98', symbol: 'GHST', name: 'Aavegotchi GHST Token', decimals: 18 },
  { address: '0x9Bcef72be871e61ED4fBbc7630889beE758eb81D', symbol: 'rETH', name: 'Rocket Pool ETH', decimals: 18 },
  { address: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452', symbol: 'wstETH', name: 'Wrapped liquid staked Ether 2.0', decimals: 18 },
  { address: '0xe3086852a4b125803c815a158249ae468a3254ca', symbol: 'MFER', name: 'mfercoin', decimals: 18 },
  { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  { address: '0xEB466342C4d449BC9f53A865D5Cb90586f405215', symbol: 'axlUSDC', name: 'Axelar Wrapped USDC', decimals: 6 },
  { address: '0x548f93779fBC992010C07467cBaf329DD5F059B7', symbol: 'MIGGLES', name: 'Miggles', decimals: 18 },
  { address: '0x4158734D47Fc9692176B5085E0F52ee0Da5d47F1', symbol: 'BALD', name: 'Bald', decimals: 18 },
];

// Create lookup maps
const WHITELIST = new Set(WHITELISTED_TOKENS.map(t => t.address.toLowerCase()));
const TOKEN_BY_SYMBOL = new Map(WHITELISTED_TOKENS.map(t => [t.symbol.toLowerCase(), t]));
const TOKEN_BY_ADDRESS = new Map(WHITELISTED_TOKENS.map(t => [t.address.toLowerCase(), t]));

// Hardcoded blacklist (known scam/honeypot tokens)
const BLACKLIST = new Set<string>([
  // Add known scam addresses here as they are discovered
  // Example: '0xscamaddress123...',
]);

// Cache for token risk scores (24 hour TTL)
const riskScoreCache = new Map<string, { score: TokenRiskScore, timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Helper: Search token on DEXScreener (Base chain only)
async function searchTokenOnDEXScreener(symbolQuery: string): Promise<{
  address: string;
  symbol: string;
  name: string;
  decimals: number;
} | null> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/search/?q=${encodeURIComponent(symbolQuery)}`);
    
    if (!response.ok) {
      console.error('❌ DEXScreener search failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.pairs || data.pairs.length === 0) {
      console.log(`🔍 No pairs found for symbol: ${symbolQuery}`);
      return null;
    }
    
    // Filter for Base chain only
    const basePairs = data.pairs.filter((p: any) => p.chainId === 'base');
    
    if (basePairs.length === 0) {
      console.log(`🔍 No Base chain pairs found for: ${symbolQuery}`);
      return null;
    }
    
    // Sort by liquidity (highest first)
    basePairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    
    // Find the first pair where either base or quote matches the query
    const symbolUpper = symbolQuery.toUpperCase();
    let matchedPair: any = null;
    let matchedToken: any = null;
    let matchedSide: 'base' | 'quote' = 'base';
    
    for (const pair of basePairs) {
      // Exact symbol match first (highest priority)
      if (pair.baseToken.symbol.toUpperCase() === symbolUpper) {
        matchedPair = pair;
        matchedToken = pair.baseToken;
        matchedSide = 'base';
        break;
      } else if (pair.quoteToken.symbol.toUpperCase() === symbolUpper) {
        matchedPair = pair;
        matchedToken = pair.quoteToken;
        matchedSide = 'quote';
        break;
      }
    }
    
    // Fallback: Name contains query (lower priority)
    if (!matchedToken) {
      for (const pair of basePairs) {
        if (pair.baseToken.name.toUpperCase().includes(symbolUpper)) {
          matchedPair = pair;
          matchedToken = pair.baseToken;
          matchedSide = 'base';
          break;
        } else if (pair.quoteToken.name.toUpperCase().includes(symbolUpper)) {
          matchedPair = pair;
          matchedToken = pair.quoteToken;
          matchedSide = 'quote';
          break;
        }
      }
    }
    
    if (!matchedToken) {
      console.log(`🔍 No matching token found in Base pairs for: ${symbolQuery}`);
      return null;
    }
    
    console.log(`✅ Found token on DEXScreener: ${matchedToken.symbol} (${matchedToken.name}) - ${matchedSide} token in pair - $${matchedPair.liquidity?.usd?.toLocaleString()} liquidity`);
    const token = matchedToken;
    
    // Get decimals from contract (RPC call)
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org');
    const contract = new ethers.Contract(token.address, ['function decimals() view returns (uint8)'], provider);
    const decimals = await contract.decimals();
    
    return {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: Number(decimals),
    };
  } catch (error: any) {
    console.error('❌ DEXScreener search error:', error.message);
    return null;
  }
}

// Helper: Search token by symbol (case-insensitive)
// First checks whitelist, then DEXScreener if not found
export async function searchTokenBySymbol(symbolQuery: string): Promise<{
  address: string;
  symbol: string;
  name: string;
  decimals: number;
} | null> {
  const normalized = symbolQuery.trim().toUpperCase();
  
  // First check whitelist
  const whitelisted = TOKEN_BY_SYMBOL.get(normalized.toLowerCase());
  if (whitelisted) {
    console.log(`✅ Found whitelisted token: ${whitelisted.symbol}`);
    return whitelisted;
  }
  
  // If not whitelisted, search on DEXScreener
  console.log(`🔍 Searching DEXScreener for: ${symbolQuery}`);
  return await searchTokenOnDEXScreener(symbolQuery);
}

// Helper: Get whitelisted tokens list
export function getWhitelistedTokens(): typeof WHITELISTED_TOKENS {
  return WHITELISTED_TOKENS;
}

export async function getTokenRiskScore(tokenAddress: string, provider: ethers.Provider): Promise<TokenRiskScore> {
  const lowerCaseAddress = tokenAddress.toLowerCase();
  
  // Check cache first
  const cached = riskScoreCache.get(lowerCaseAddress);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.score;
  }

  const warnings: string[] = [];
  const blockedReasons: string[] = [];
  const checks = {
    isERC20Valid: false,
    hasLiquidity: false,
    isOnWhitelist: false,
    isOnBlacklist: false,
    hasReasonableDecimals: false,
    liquidityUSD: 0,
  };

  // Check whitelist
  checks.isOnWhitelist = WHITELIST.has(lowerCaseAddress);
  
  // Check blacklist
  checks.isOnBlacklist = BLACKLIST.has(lowerCaseAddress);
  
  if (checks.isOnBlacklist) {
    blockedReasons.push('Token is on scam/honeypot blacklist');
  }

  // Early return for whitelisted tokens (skip all validation)
  if (checks.isOnWhitelist) {
    const result: TokenRiskScore = {
      address: lowerCaseAddress,
      riskLevel: 'approved',
      score: 0,
      checks: {
        isERC20Valid: true,
        hasLiquidity: true,
        isOnWhitelist: true,
        isOnBlacklist: false,
        hasReasonableDecimals: true,
        liquidityUSD: 0, // Not checked for whitelisted tokens
      },
      warnings: [],
      blockedReasons: [],
    };
    
    // Cache result
    riskScoreCache.set(lowerCaseAddress, {
      score: result,
      timestamp: Date.now(),
    });
    
    return result;
  }
  
  // Non-whitelisted token validation
  {
    // ERC20 validation for non-whitelisted tokens
    try {
    const ERC20_ABI = [
      'function symbol() view returns (string)',
      'function name() view returns (string)',
      'function decimals() view returns (uint8)',
      'function totalSupply() view returns (uint256)',
    ];

    const contract = new ethers.Contract(lowerCaseAddress, ERC20_ABI, provider);
    
    // Retry logic for RPC calls (Base RPC can be flaky)
    const retryCall = async <T>(fn: () => Promise<T>, retries = 2): Promise<T | null> => {
      for (let i = 0; i <= retries; i++) {
        try {
          return await fn();
        } catch (err) {
          if (i === retries) return null;
          await new Promise(resolve => setTimeout(resolve, 500 * (i + 1))); // 500ms, 1s backoff
        }
      }
      return null;
    };
    
    const [symbol, name, decimals, totalSupply] = await Promise.all([
      retryCall(() => contract.symbol()),
      retryCall(() => contract.name()),
      retryCall(() => contract.decimals()),
      retryCall(() => contract.totalSupply()),
    ]);

    // More lenient validation: decimals alone is enough for basic ERC-20
    checks.isERC20Valid = decimals !== null;
    
    if (!checks.isERC20Valid) {
      blockedReasons.push('Invalid ERC-20 contract (missing decimals method)');
    } else if (!symbol || !name) {
      warnings.push('Token metadata incomplete (missing symbol or name)');
    }

    // Check decimals (should be <= 18, anything > 77 is suspicious)
    if (decimals !== null) {
      const decimalNum = Number(decimals);
      checks.hasReasonableDecimals = decimalNum <= 18;
      
      if (decimalNum > 77) {
        blockedReasons.push(`Suspicious decimals: ${decimalNum} (expected <= 18)`);
      } else if (decimalNum > 18) {
        warnings.push(`High decimals: ${decimalNum} (unusual but not blocked)`);
      }
    }

    } catch (error) {
      blockedReasons.push('Failed to fetch token metadata (not a valid ERC-20)');
    }

  // Liquidity check (DEXScreener API)
  try {
    const dexResponse = await fetch(`https://api.dexscreener.com/token-pairs/v1/base/${lowerCaseAddress}`);
    
    if (dexResponse.ok) {
      const dexData = await dexResponse.json();
      
      // DEXScreener returns { pairs: [...] } format
      const pairs = dexData.pairs || [];
      
      if (Array.isArray(pairs) && pairs.length > 0) {
        // Sort by liquidity and take the most liquid pair
        const sortedPairs = pairs.sort((a: any, b: any) => {
          const liquidityA = parseFloat(a.liquidity?.usd || 0);
          const liquidityB = parseFloat(b.liquidity?.usd || 0);
          return liquidityB - liquidityA;
        });
        
        const topPair = sortedPairs[0];
        const liquidityUSD = parseFloat(topPair.liquidity?.usd || 0);
        checks.liquidityUSD = liquidityUSD;
        checks.hasLiquidity = liquidityUSD > 1000; // $1k minimum liquidity
        
        if (liquidityUSD < 1000) {
          warnings.push(`Low liquidity: $${liquidityUSD.toLocaleString()} (risk of slippage)`);
        }
        
        if (liquidityUSD < 100) {
          blockedReasons.push(`Insufficient liquidity: $${liquidityUSD.toLocaleString()} (minimum $100 required)`);
        }
      } else {
        warnings.push('No DEX pairs found (token may not be tradeable)');
      }
    }
  } catch (error) {
    console.warn(`Failed to fetch liquidity for ${lowerCaseAddress}:`, error);
    warnings.push('Could not verify liquidity (proceed with caution)');
  }
  } // End of non-whitelisted validation scope

  // Calculate risk score (0-100)
  let score = 0;
  
  // Whitelist = 0 (safest)
  if (checks.isOnWhitelist) {
    score = 0;
  } 
  // Blacklist = 100 (blocked)
  else if (checks.isOnBlacklist) {
    score = 100;
  }
  // Calculate based on checks
  else {
    if (!checks.isERC20Valid) score += 50;
    if (!checks.hasReasonableDecimals) score += 20;
    if (!checks.hasLiquidity) score += 20;
    if (warnings.length > 0) score += warnings.length * 5;
  }

  // Determine risk level
  let riskLevel: TokenRiskLevel;
  if (blockedReasons.length > 0 || score >= 80) {
    riskLevel = 'blocked';
  } else if (score >= 30 || warnings.length > 0) {
    riskLevel = 'guarded';
  } else {
    riskLevel = 'approved';
  }

  const result: TokenRiskScore = {
    address: lowerCaseAddress,
    riskLevel,
    score: Math.min(score, 100),
    checks,
    warnings,
    blockedReasons,
  };

  // Cache result
  riskScoreCache.set(lowerCaseAddress, {
    score: result,
    timestamp: Date.now(),
  });

  return result;
}

// Utility function to check if token is safe to trade
export function isTokenSafeToTrade(riskScore: TokenRiskScore): boolean {
  return riskScore.riskLevel !== 'blocked' && riskScore.blockedReasons.length === 0;
}

// Get human-readable risk explanation
export function getRiskExplanation(riskScore: TokenRiskScore): string {
  if (riskScore.riskLevel === 'approved') {
    return 'This token appears safe to trade with no major red flags.';
  } else if (riskScore.riskLevel === 'guarded') {
    return `Exercise caution: ${riskScore.warnings.join(', ')}`;
  } else {
    return `Trading blocked: ${riskScore.blockedReasons.join(', ')}`;
  }
}
