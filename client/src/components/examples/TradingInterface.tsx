import { TradingInterface } from '../TradingInterface';
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
  twitterUrl: null,
  telegramUrl: null,
  websiteUrl: null,
  isVerified: false,
  createdAt: new Date(),
};

export default function TradingInterfaceExample() {
  return (
    <div className="max-w-md mx-auto p-8">
      <TradingInterface 
        token={mockToken}
        userBalance="2.5"
        onBuy={(amount) => console.log('Buy:', amount)}
        onSell={(amount) => console.log('Sell:', amount)}
      />
    </div>
  );
}
