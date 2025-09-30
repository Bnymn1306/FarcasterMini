import { TokenGrid } from '../TokenGrid';
import type { Token } from '@shared/schema';

const mockTokens: Token[] = [
  {
    id: '1',
    creatorId: 'creator1',
    name: 'Doge Moon',
    symbol: 'DMOON',
    description: 'To the moon! 🚀',
    logoUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=dmoon',
    contractAddress: '0x123...',
    totalSupply: '1000000000',
    currentPrice: '0.0042',
    marketCap: '420000',
    volume24h: '52000',
    priceChange24h: '15.8',
    holderCount: 1337,
    twitterUrl: null,
    telegramUrl: null,
    websiteUrl: null,
    isVerified: true,
    createdAt: new Date(),
  },
  {
    id: '2',
    creatorId: 'creator2',
    name: 'Pepe Coin',
    symbol: 'PEPE',
    description: 'Feels good man',
    logoUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=pepe',
    contractAddress: '0x456...',
    totalSupply: '500000000',
    currentPrice: '0.0089',
    marketCap: '890000',
    volume24h: '120000',
    priceChange24h: '-5.2',
    holderCount: 2451,
    twitterUrl: null,
    telegramUrl: null,
    websiteUrl: null,
    isVerified: false,
    createdAt: new Date(),
  },
  {
    id: '3',
    creatorId: 'creator3',
    name: 'Shiba Universe',
    symbol: 'SHIBU',
    description: 'Community driven meme token',
    logoUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=shibu',
    contractAddress: '0x789...',
    totalSupply: '2000000000',
    currentPrice: '0.0021',
    marketCap: '320000',
    volume24h: '45000',
    priceChange24h: '8.7',
    holderCount: 892,
    twitterUrl: null,
    telegramUrl: null,
    websiteUrl: null,
    isVerified: false,
    createdAt: new Date(),
  },
];

export default function TokenGridExample() {
  return (
    <div className="p-8">
      <TokenGrid 
        tokens={mockTokens}
        onTrade={(id) => console.log('Trade:', id)}
        onViewDetails={(id) => console.log('View details:', id)}
      />
    </div>
  );
}
