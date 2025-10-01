import { TokenGrid } from "@/components/TokenGrid";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Token } from "@shared/schema";

export default function Browse() {
  const [, setLocation] = useLocation();

  const { data: tokens = [], isLoading, isError } = useQuery<Token[]>({
    queryKey: ["/api/tokens"],
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black mb-2">Browse Tokens</h1>
          <p className="text-muted-foreground">Loading tokens...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black mb-2">Browse Tokens</h1>
          <p className="text-destructive">Failed to load tokens. Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-2">Explore Meme Tokens</h1>
        <p className="text-muted-foreground">Discover and trade the hottest meme coins on Base</p>
      </div>
      
      <TokenGrid 
        tokens={tokens}
        onTrade={(id) => setLocation(`/token/${id}`)}
        onViewDetails={(id) => setLocation(`/token/${id}`)}
      />
    </div>
  );
}
