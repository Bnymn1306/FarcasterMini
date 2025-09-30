import { TokenGrid } from "@/components/TokenGrid";
import { useLocation } from "wouter";
import type { Token } from "@shared/schema";

export default function Browse() {
  const [, setLocation] = useLocation();

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
      twitterUrl: 'https://twitter.com/dogemoon',
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
    {
      id: '4',
      creatorId: 'creator4',
      name: 'Wojak Finance',
      symbol: 'WOJAK',
      description: 'For the culture',
      logoUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=wojak',
      contractAddress: '0xabc...',
      totalSupply: '750000000',
      currentPrice: '0.0156',
      marketCap: '1200000',
      volume24h: '200000',
      priceChange24h: '24.3',
      holderCount: 3456,
      twitterUrl: null,
      telegramUrl: null,
      websiteUrl: null,
      isVerified: true,
      createdAt: new Date(),
    },
    {
      id: '5',
      creatorId: 'creator5',
      name: 'Cat Vibes',
      symbol: 'VIBES',
      description: 'Just vibing 😺',
      logoUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=vibes',
      contractAddress: '0xdef...',
      totalSupply: '1500000000',
      currentPrice: '0.0033',
      marketCap: '495000',
      volume24h: '67000',
      priceChange24h: '12.1',
      holderCount: 1789,
      twitterUrl: null,
      telegramUrl: null,
      websiteUrl: null,
      isVerified: false,
      createdAt: new Date(),
    },
    {
      id: '6',
      creatorId: 'creator6',
      name: 'Based Frog',
      symbol: 'BFROG',
      description: 'Ribbit on Base',
      logoUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=bfrog',
      contractAddress: '0xghi...',
      totalSupply: '3000000000',
      currentPrice: '0.0015',
      marketCap: '450000',
      volume24h: '38000',
      priceChange24h: '-2.8',
      holderCount: 945,
      twitterUrl: null,
      telegramUrl: null,
      websiteUrl: null,
      isVerified: false,
      createdAt: new Date(),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-2">Explore Meme Tokens</h1>
        <p className="text-muted-foreground">Discover and trade the hottest meme coins on Base</p>
      </div>
      
      <TokenGrid 
        tokens={mockTokens}
        onTrade={(id) => setLocation(`/token/${id}`)}
        onViewDetails={(id) => setLocation(`/token/${id}`)}
      />
    </div>
  );
}
