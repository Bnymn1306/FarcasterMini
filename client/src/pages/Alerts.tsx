import { AlertsList } from "@/components/AlertsList";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiFarcaster } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { PriceAlertWithToken } from "@shared/schema";

export default function Alerts() {
  const { toast } = useToast();
  const [farcasterUsername, setFarcasterUsername] = useState("yourusername");
  const [isConnected, setIsConnected] = useState(true);

  const handleConnectFarcaster = () => {
    if (isConnected) {
      setIsConnected(false);
      toast({
        title: "Farcaster Bağlantısı Kesildi",
        description: "Bildirimler devre dışı bırakıldı",
      });
    } else {
      setIsConnected(true);
      toast({
        title: "Farcaster Bağlandı! 🎉",
        description: "Fiyat uyarıları profilinize cast olarak gönderilecek",
      });
    }
  };

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

  const handleToggleAlert = (id: string, isActive: boolean) => {
    console.log('Toggle alert:', id, isActive);
    toast({
      title: isActive ? "Uyarı Aktif" : "Uyarı Devre Dışı",
      description: isActive ? "Bildirimler tekrar açıldı" : "Bildirimler kapatıldı",
    });
  };

  const handleDeleteAlert = (id: string) => {
    console.log('Delete alert:', id);
    toast({
      title: "Uyarı Silindi",
      description: "Fiyat uyarısı başarıyla kaldırıldı",
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-2">Fiyat Uyarıları</h1>
        <p className="text-muted-foreground">
          Token fiyatlarını takip edin ve Farcaster profilinize bildirim alın
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <AlertsList 
            alerts={mockAlerts}
            onToggleAlert={handleToggleAlert}
            onDeleteAlert={handleDeleteAlert}
          />
        </div>

        <div>
          <Card className="p-6 space-y-6 sticky top-24">
            <div className="space-y-2">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <SiFarcaster className="h-5 w-5 text-primary" />
                Farcaster Bildirimleri
              </h3>
              <p className="text-sm text-muted-foreground">
                Fiyat uyarılarınız Farcaster profilinize cast olarak gönderilecek
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="farcaster-username" className="text-xs uppercase font-semibold">
                  Farcaster Kullanıcı Adı
                </Label>
                <Input
                  id="farcaster-username"
                  value={farcasterUsername}
                  onChange={(e) => setFarcasterUsername(e.target.value)}
                  placeholder="@yourusername"
                  disabled={!isConnected}
                  data-testid="input-farcaster-username"
                />
              </div>

              <Button
                onClick={handleConnectFarcaster}
                variant={isConnected ? "outline" : "default"}
                className="w-full gap-2"
                data-testid="button-connect-farcaster"
              >
                <SiFarcaster className="h-4 w-4" />
                {isConnected ? "Bağlantıyı Kes" : "Farcaster'a Bağlan"}
              </Button>
            </div>

            {isConnected && (
              <div className="p-4 bg-chart-2/10 border border-chart-2/20 rounded-lg space-y-2">
                <p className="font-semibold text-sm text-chart-2">✓ Bağlandı</p>
                <p className="text-xs text-muted-foreground">
                  Uyarılar @{farcasterUsername} profiline gönderilecek
                </p>
              </div>
            )}

            <div className="pt-4 border-t border-border space-y-3">
              <h4 className="font-semibold text-sm">Nasıl Çalışır?</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span>1.</span>
                  <span>Token detay sayfasından fiyat uyarısı oluşturun</span>
                </li>
                <li className="flex gap-2">
                  <span>2.</span>
                  <span>Hedef fiyata ulaşıldığında otomatik bildirim</span>
                </li>
                <li className="flex gap-2">
                  <span>3.</span>
                  <span>Farcaster profilinize cast olarak gönderilir</span>
                </li>
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
