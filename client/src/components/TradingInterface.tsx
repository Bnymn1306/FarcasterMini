import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { ArrowDownUp } from "lucide-react";
import { GasFeeDisplay } from "./GasFeeDisplay";
import type { Token } from "@shared/schema";

interface TradingInterfaceProps {
  token: Token;
  userBalance?: string;
  onBuy?: (amount: string) => void;
  onSell?: (amount: string) => void;
}

export function TradingInterface({ 
  token, 
  userBalance = "1.5",
  onBuy,
  onSell 
}: TradingInterfaceProps) {
  const [amount, setAmount] = useState("");
  const [sliderValue, setSliderValue] = useState([50]);

  const handleBuy = () => {
    console.log('Buy', amount, token.symbol);
    onBuy?.(amount);
  };

  const handleSell = () => {
    console.log('Sell', amount, token.symbol);
    onSell?.(amount);
  };

  const updateFromSlider = (value: number[]) => {
    setSliderValue(value);
    const calculatedAmount = ((parseFloat(userBalance) * value[0]) / 100).toFixed(4);
    setAmount(calculatedAmount);
  };

  const formatPrice = (price: string) => {
    const value = parseFloat(price);
    if (value < 0.01) return `$${value.toFixed(6)}`;
    return `$${value.toFixed(4)}`;
  };

  return (
    <Card className="p-6 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-xl">{token.name}</h3>
          <span className="font-mono font-semibold text-2xl text-primary">
            {formatPrice(token.currentPrice)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground uppercase">
          ${token.symbol}
        </p>
      </div>

      <div className="h-64 bg-muted/30 rounded-lg flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">Price Chart</p>
          <div className="flex gap-2">
            {['1H', '24H', '7D', '30D'].map((period) => (
              <Button key={period} variant="ghost" size="sm">
                {period}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <Tabs defaultValue="buy" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="buy" data-testid="tab-buy">Buy</TabsTrigger>
          <TabsTrigger value="sell" data-testid="tab-sell">Sell</TabsTrigger>
        </TabsList>

        <TabsContent value="buy" className="space-y-4 mt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="buy-amount" className="text-xs uppercase font-semibold">
                Amount
              </Label>
              <span className="text-xs text-muted-foreground">
                Balance: {userBalance} ETH
              </span>
            </div>
            <div className="relative">
              <Input
                id="buy-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                className="pr-16"
                data-testid="input-buy-amount"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                ETH
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase font-semibold">Quick Select</Label>
            <Slider
              value={sliderValue}
              onValueChange={updateFromSlider}
              max={100}
              step={25}
              className="py-4"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>

          <div className="space-y-2 p-4 bg-muted/30 rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">You'll receive</span>
              <span className="font-mono font-semibold">
                ~{amount ? (parseFloat(amount) / parseFloat(token.currentPrice)).toFixed(2) : '0'} {token.symbol}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Price impact</span>
              <span className="font-mono text-chart-2">~0.5%</span>
            </div>
            <div className="pt-2 border-t border-border">
              <GasFeeDisplay gasFee="0.00012" />
            </div>
          </div>

          <Button
            onClick={handleBuy}
            className="w-full py-6 bg-chart-2 hover:bg-chart-2/90"
            size="lg"
            disabled={!amount || parseFloat(amount) <= 0}
            data-testid="button-buy"
          >
            <ArrowDownUp className="h-5 w-5 mr-2" />
            Buy {token.symbol}
          </Button>
        </TabsContent>

        <TabsContent value="sell" className="space-y-4 mt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="sell-amount" className="text-xs uppercase font-semibold">
                Amount
              </Label>
              <span className="text-xs text-muted-foreground">
                Balance: 0 {token.symbol}
              </span>
            </div>
            <div className="relative">
              <Input
                id="sell-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                className="pr-20"
                data-testid="input-sell-amount"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                {token.symbol}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase font-semibold">Quick Select</Label>
            <Slider
              value={sliderValue}
              onValueChange={updateFromSlider}
              max={100}
              step={25}
              className="py-4"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>

          <div className="space-y-2 p-4 bg-muted/30 rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">You'll receive</span>
              <span className="font-mono font-semibold">
                ~{amount ? (parseFloat(amount) * parseFloat(token.currentPrice)).toFixed(4) : '0'} ETH
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Price impact</span>
              <span className="font-mono text-chart-2">~0.5%</span>
            </div>
            <div className="pt-2 border-t border-border">
              <GasFeeDisplay gasFee="0.00012" />
            </div>
          </div>

          <Button
            onClick={handleSell}
            variant="destructive"
            className="w-full py-6"
            size="lg"
            disabled={!amount || parseFloat(amount) <= 0}
            data-testid="button-sell"
          >
            <ArrowDownUp className="h-5 w-5 mr-2" />
            Sell {token.symbol}
          </Button>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
