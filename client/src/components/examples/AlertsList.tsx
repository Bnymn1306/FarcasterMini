import { AlertsList } from '../AlertsList';
import type { PriceAlertWithToken } from '@shared/schema';

const mockAlerts: PriceAlertWithToken[] = [
  {
    id: '1',
    userId: 'user1',
    tokenId: 'token1',
    targetPrice: '0.0050',
    condition: 'above',
    isActive: true,
    isTriggered: false,
    notifyViaFarcaster: true,
    triggeredAt: null,
    createdAt: new Date(),
    token: {
      id: 'token1',
      creatorId: 'creator1',
      name: 'Doge Moon',
      symbol: 'DMOON',
      description: 'To the moon!',
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
  },
  {
    id: '2',
    userId: 'user1',
    tokenId: 'token2',
    targetPrice: '0.0080',
    condition: 'below',
    isActive: true,
    isTriggered: false,
    notifyViaFarcaster: true,
    triggeredAt: null,
    createdAt: new Date(),
    token: {
      id: 'token2',
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
  },
];

export default function AlertsListExample() {
  return (
    <div className="max-w-2xl p-8">
      <AlertsList 
        alerts={mockAlerts}
        onToggleAlert={(id, isActive) => console.log('Toggle alert:', id, isActive)}
        onDeleteAlert={(id) => console.log('Delete alert:', id)}
      />
    </div>
  );
}
