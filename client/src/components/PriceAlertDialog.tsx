import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Token } from "@shared/schema";

interface PriceAlertDialogProps {
  token: Token;
  onCreateAlert?: (data: AlertData) => void;
}

export interface AlertData {
  tokenId: string;
  targetPrice: string;
  condition: string;
  notifyViaFarcaster: boolean;
}

export function PriceAlertDialog({ token, onCreateAlert }: PriceAlertDialogProps) {
  const [open, setOpen] = useState(false);
  const [targetPrice, setTargetPrice] = useState("");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [notifyViaFarcaster, setNotifyViaFarcaster] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!targetPrice || parseFloat(targetPrice) <= 0) {
      return;
    }

    const alertData: AlertData = {
      tokenId: token.id,
      targetPrice,
      condition,
      notifyViaFarcaster,
    };

    console.log('Creating price alert:', alertData);
    onCreateAlert?.(alertData);
    
    setOpen(false);
    setTargetPrice("");
    setCondition("above");
    setNotifyViaFarcaster(true);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" data-testid="button-create-alert">
          <Bell className="h-4 w-4" />
          Price Alert
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Price Alert</DialogTitle>
          <DialogDescription>
            Set a price alert for {token.symbol}. You'll receive a notification on your Farcaster profile when the target price is reached.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="current-price" className="text-xs uppercase font-semibold">
              Current Price
            </Label>
            <div className="text-2xl font-mono font-bold text-primary">
              ${parseFloat(token.currentPrice).toFixed(6)}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="condition" className="text-xs uppercase font-semibold">
              Condition
            </Label>
            <Select value={condition} onValueChange={(value: any) => setCondition(value)}>
              <SelectTrigger data-testid="select-condition">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="above">When price goes above</SelectItem>
                <SelectItem value="below">When price falls below</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-price" className="text-xs uppercase font-semibold">
              Target Price (USD)
            </Label>
            <Input
              id="target-price"
              type="number"
              step="0.000001"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              placeholder="0.00"
              required
              data-testid="input-target-price"
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="farcaster-notify" className="font-semibold">
                Farcaster Notification
              </Label>
              <p className="text-xs text-muted-foreground">
                Send as a cast to your profile
              </p>
            </div>
            <Switch
              id="farcaster-notify"
              checked={notifyViaFarcaster}
              onCheckedChange={setNotifyViaFarcaster}
              data-testid="switch-farcaster"
            />
          </div>

          <DialogFooter>
            <Button type="submit" className="w-full" data-testid="button-submit-alert">
              Create Alert
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
