// Popular Base network tokens for portfolio display
export interface BaseToken {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoUrl?: string;
  coingeckoId?: string;
}

// Helper function to proxy external image URLs for Farcaster Frame CORS compatibility
const proxyUrl = (url: string) => `/api/token-image-proxy?url=${encodeURIComponent(url)}`;

// Top Base network tokens (whitelisted + popular)
export const BASE_TOKENS: BaseToken[] = [
  {
    symbol: 'ETH',
    name: 'Ether',
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Native ETH placeholder
    decimals: 18,
    logoUrl: proxyUrl('https://icons.llamao.fi/icons/chains/rsz_base.jpg'),
    coingeckoId: 'ethereum',
  },
  {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    address: '0x4200000000000000000000000000000000000006',
    decimals: 18,
    logoUrl: proxyUrl('https://icons.llamao.fi/icons/chains/rsz_base.jpg'),
    coingeckoId: 'weth',
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
    logoUrl: proxyUrl('https://icons.llamao.fi/icons/protocols/usdc'),
    coingeckoId: 'usd-coin',
  },
  {
    symbol: 'AERO',
    name: 'Aerodrome Finance',
    address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
    decimals: 18,
    logoUrl: proxyUrl('https://assets.coingecko.com/coins/images/31745/small/token.png'),
    coingeckoId: 'aerodrome-finance',
  },
  {
    symbol: 'DEGEN',
    name: 'Degen',
    address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Eff9Ed',
    decimals: 18,
    logoUrl: proxyUrl('https://assets.coingecko.com/coins/images/34515/small/degen-hat-nouns.png'),
    coingeckoId: 'degen-base',
  },
  {
    symbol: 'BRETT',
    name: 'Brett',
    address: '0x532f27101965dd16442E59d40670FaF5eBB142E4',
    decimals: 18,
    logoUrl: proxyUrl('https://assets.coingecko.com/coins/images/35579/small/BRETT.jpg'),
    coingeckoId: 'based-brett',
  },
  {
    symbol: 'VIRTUAL',
    name: 'Virtual Protocol',
    address: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b',
    decimals: 18,
    logoUrl: proxyUrl('https://assets.coingecko.com/coins/images/44085/small/virt.png'),
    coingeckoId: 'virtual-protocol',
  },
  {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    decimals: 18,
    logoUrl: proxyUrl('https://icons.llamao.fi/icons/protocols/makerdao'),
    coingeckoId: 'dai',
  },
  {
    symbol: 'cbETH',
    name: 'Coinbase Wrapped Staked ETH',
    address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
    decimals: 18,
    logoUrl: proxyUrl('https://assets.coingecko.com/coins/images/27008/small/cbeth.png'),
    coingeckoId: 'coinbase-wrapped-staked-eth',
  },
  {
    symbol: 'USDbC',
    name: 'USD Base Coin',
    address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    decimals: 6,
    logoUrl: proxyUrl('https://icons.llamao.fi/icons/protocols/usdc'),
    coingeckoId: 'bridged-usd-coin-base',
  },
];

// ERC20 ABI (minimal - just balanceOf)
export const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];
