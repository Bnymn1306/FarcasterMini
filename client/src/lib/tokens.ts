export interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoURI?: string;
}

// Helper: Generate path-based proxy URL (no query strings for Warpcast mobile compatibility)
// Uses URL-safe base64 encoding: + -> -, / -> _
const proxyUrl = (url: string) => {
  const base64 = btoa(url);
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `/token-logo/${base64url}.png`;
};

export const BASE_TOKENS: Token[] = [
  {
    symbol: 'ETH',
    name: 'Ethereum',
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ✅ Native ETH sentinel (for 0x API)
    decimals: 18,
    logoURI: proxyUrl('https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png')
  },
  {
    symbol: 'WETH',
    name: 'Wrapped Ethereum',
    address: '0x4200000000000000000000000000000000000006', // Base WETH contract
    decimals: 18,
    logoURI: proxyUrl('https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png')
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
    logoURI: proxyUrl('https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png')
  },
  {
    symbol: 'USDbC',
    name: 'USD Base Coin',
    address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    decimals: 6,
    logoURI: proxyUrl('https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png')
  },
  {
    symbol: 'axlUSDC',
    name: 'Axelar Wrapped USDC',
    address: '0xEB466342C4d449BC9f53A865D5Cb90586f405215',
    decimals: 6,
    logoURI: proxyUrl('https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png')
  },
  {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    decimals: 18,
    logoURI: proxyUrl('https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png')
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    decimals: 6,
    logoURI: proxyUrl('https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png')
  },
  {
    symbol: 'cbBTC',
    name: 'Coinbase Wrapped BTC',
    address: '0x805aF152eebc7e280628A0Bb30Dd916b5B7716fb',
    decimals: 8,
    logoURI: proxyUrl('https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png')
  },
  {
    symbol: 'BRETT',
    name: 'Based Brett',
    address: '0x532f27101965dd16442e59d40670faf5ebb142e4',
    decimals: 18,
    logoURI: proxyUrl('https://assets.coingecko.com/coins/images/35521/standard/BRETT.png')
  },
  {
    symbol: 'AERO',
    name: 'Aerodrome Finance',
    address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
    decimals: 18,
    logoURI: proxyUrl('https://assets.coingecko.com/coins/images/31745/standard/token.png')
  }
];

export const NATIVE_ETH = BASE_TOKENS[0];
export const WETH = BASE_TOKENS[1];
export const USDC = BASE_TOKENS[2];

// 0x API native ETH sentinel address (use instead of WETH for native ETH swaps)
export const ZEROX_NATIVE_ETH_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
