import { TokenCard } from "./TokenCard";
import type { Token } from "@shared/schema";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TokenGridProps {
  tokens: Token[];
  onTrade?: (tokenId: string) => void;
  onViewDetails?: (tokenId: string) => void;
}

export function TokenGrid({ tokens, onTrade, onViewDetails }: TokenGridProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <Tabs defaultValue="all" className="w-full sm:w-auto">
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
            <TabsTrigger value="hot" data-testid="tab-hot">🔥 Hot</TabsTrigger>
            <TabsTrigger value="new" data-testid="tab-new">✨ New</TabsTrigger>
            <TabsTrigger value="top" data-testid="tab-top">📈 Top</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select defaultValue="volume">
          <SelectTrigger className="w-[180px]" data-testid="select-sort">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="volume">Volume</SelectItem>
            <SelectItem value="marketcap">Market Cap</SelectItem>
            <SelectItem value="price">Price</SelectItem>
            <SelectItem value="holders">Holders</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tokens.map((token) => (
          <TokenCard
            key={token.id}
            token={token}
            onTrade={onTrade}
            onViewDetails={onViewDetails}
          />
        ))}
      </div>

      {tokens.length === 0 && (
        <div className="text-center py-20">
          <p className="text-muted-foreground">No tokens found</p>
        </div>
      )}
    </div>
  );
}
