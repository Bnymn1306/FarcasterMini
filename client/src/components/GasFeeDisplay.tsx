import { SiEthereum } from "react-icons/si";
import { Badge } from "@/components/ui/badge";

interface GasFeeDisplayProps {
  gasFee: string;
  className?: string;
  showBadge?: boolean;
}

export function GasFeeDisplay({ gasFee, className = "", showBadge = false }: GasFeeDisplayProps) {
  if (showBadge) {
    return (
      <Badge variant="outline" className={`gap-2 ${className}`}>
        <SiEthereum className="h-3 w-3" />
        <span className="text-xs">Gas: {gasFee} ETH</span>
      </Badge>
    );
  }

  return (
    <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
      <SiEthereum className="h-3 w-3" />
      <span>Base Network Gas Fee: {gasFee} ETH</span>
    </div>
  );
}
