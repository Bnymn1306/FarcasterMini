import { TokenCard } from '../TokenCard';
import type { Token } from '@shared/schema';

const mockToken: Token = {
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
  twitterUrl: 'https://twitter.com/dogemoon',
  telegramUrl: null,
  websiteUrl: null,
  isVerified: true,
  createdAt: new Date(),
};

export default function TokenCardExample() {
  return (
    <div className="max-w-sm">
      <TokenCard 
        token={mockToken}
        onTrade={(id) => console.log('Trade token:', id)}
        onViewDetails={(id) => console.log('View details:', id)}
      />
    </div>
  );
}
