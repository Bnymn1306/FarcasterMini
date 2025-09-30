import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bell, BellOff, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { SiFarcaster } from "react-icons/si";
import type { PriceAlertWithToken } from "@shared/schema";

interface AlertsListProps {
  alerts: PriceAlertWithToken[];
  onToggleAlert?: (id: string, isActive: boolean) => void;
  onDeleteAlert?: (id: string) => void;
}

export function AlertsList({ alerts, onToggleAlert, onDeleteAlert }: AlertsListProps) {
  const formatPrice = (price: string) => {
    const value = parseFloat(price);
    if (value < 0.01) return `$${value.toFixed(6)}`;
    return `$${value.toFixed(4)}`;
  };

  return (
    <div className="space-y-4">
      {alerts.map((alert) => {
        const currentPrice = parseFloat(alert.token.currentPrice);
        const targetPrice = parseFloat(alert.targetPrice);
        const isAbove = alert.condition === "above";
        const percentDiff = ((targetPrice - currentPrice) / currentPrice * 100).toFixed(2);

        return (
          <Card 
            key={alert.id} 
            className={`p-4 ${alert.isActive ? '' : 'opacity-60'} ${alert.isTriggered ? 'border-chart-2' : ''}`}
            data-testid={`card-alert-${alert.id}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={alert.token.logoUrl || undefined} alt={alert.token.name} />
                  <AvatarFallback>{alert.token.symbol.slice(0, 2)}</AvatarFallback>
                </Avatar>

                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold">{alert.token.name}</h4>
                    <span className="text-sm text-muted-foreground uppercase">
                      ${alert.token.symbol}
                    </span>
                    {alert.isTriggered && (
                      <Badge className="bg-chart-2/20 text-chart-2">
                        Tetiklendi
                      </Badge>
                    )}
                    {!alert.isActive && (
                      <Badge variant="secondary">
                        Pasif
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">
                        Şu Anki Fiyat
                      </p>
                      <p className="font-mono font-semibold">
                        {formatPrice(alert.token.currentPrice)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">
                        Hedef Fiyat
                      </p>
                      <div className="flex items-center gap-2">
                        {isAbove ? (
                          <TrendingUp className="h-3 w-3 text-chart-2" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-destructive" />
                        )}
                        <p className="font-mono font-semibold">
                          {formatPrice(alert.targetPrice)}
                        </p>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${parseFloat(percentDiff) > 0 ? 'text-chart-2' : 'text-destructive'}`}
                        >
                          {percentDiff}%
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {isAbove ? 'Fiyat üzerine çıktığında' : 'Fiyat altına düştüğünde'} bildirim
                    </span>
                    {alert.notifyViaFarcaster && (
                      <>
                        <span>•</span>
                        <SiFarcaster className="h-3 w-3" />
                        <span>Farcaster</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onToggleAlert?.(alert.id, !alert.isActive)}
                  data-testid={`button-toggle-${alert.id}`}
                >
                  {alert.isActive ? (
                    <Bell className="h-4 w-4" />
                  ) : (
                    <BellOff className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDeleteAlert?.(alert.id)}
                  data-testid={`button-delete-${alert.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        );
      })}

      {alerts.length === 0 && (
        <Card className="p-12 text-center">
          <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-bold text-lg mb-2">Henüz Uyarı Yok</h3>
          <p className="text-sm text-muted-foreground">
            Token detay sayfasından fiyat uyarısı oluşturun
          </p>
        </Card>
      )}
    </div>
  );
}
