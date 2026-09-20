import { useChain, CHAIN_CONFIG } from "@/contexts/ChainContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Check } from "lucide-react";
import type { ChainType } from "@shared/schema";

// Chain logo components
function BaseLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 111 111" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="55.5" cy="55.5" r="55.5" fill="#0052FF"/>
      <path d="M55.5 96C77.8675 96 96 77.8675 96 55.5C96 33.1325 77.8675 15 55.5 15C34.0283 15 16.4627 31.6567 15.0457 52.7143H71.9143V58.2857H15.0457C16.4627 79.3433 34.0283 96 55.5 96Z" fill="white"/>
    </svg>
  );
}

function SolanaLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 397.7 311.7" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="solana-gradient-1" x1="360.88" y1="351.46" x2="141.21" y2="-69.29" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00ffa3"/>
          <stop offset="1" stopColor="#dc1fff"/>
        </linearGradient>
        <linearGradient id="solana-gradient-2" x1="264.83" y1="401.6" x2="45.16" y2="-19.15" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00ffa3"/>
          <stop offset="1" stopColor="#dc1fff"/>
        </linearGradient>
        <linearGradient id="solana-gradient-3" x1="312.55" y1="376.69" x2="92.88" y2="-44.06" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00ffa3"/>
          <stop offset="1" stopColor="#dc1fff"/>
        </linearGradient>
      </defs>
      <path fill="url(#solana-gradient-1)" d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
      <path fill="url(#solana-gradient-2)" d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
      <path fill="url(#solana-gradient-3)" d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
    </svg>
  );
}

function InkLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="50" fill="#7B3AED"/>
      <g fill="white">
        <rect x="48" y="26" width="22" height="9" rx="4.5"/>
        <rect x="48" y="45.5" width="22" height="9" rx="4.5"/>
        <rect x="48" y="65" width="22" height="9" rx="4.5"/>
        <path d="M48 26 L38 26 Q24 26 24 50 Q24 74 38 74 L48 74 L48 65 L38 65 Q33 65 33 50 Q33 35 38 35 L48 35 Z"/>
      </g>
    </svg>
  );
}

function SoneiumLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="soneium-outer" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5DDFFF"/>
          <stop offset="40%" stopColor="#7B9FE8"/>
          <stop offset="70%" stopColor="#A77DD8"/>
          <stop offset="100%" stopColor="#E87DD8"/>
        </linearGradient>
        <linearGradient id="soneium-inner" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#40E0D0"/>
          <stop offset="50%" stopColor="#6BA4E8"/>
          <stop offset="100%" stopColor="#9B7BE8"/>
        </linearGradient>
      </defs>
      <path 
        d="M75 15 C95 30 100 60 85 82 C70 104 35 108 15 88 C5 78 2 62 8 48 L22 55 C18 65 22 78 32 86 C48 98 72 92 82 72 C88 60 85 42 72 30 Z"
        fill="url(#soneium-outer)"
      />
      <path 
        d="M25 85 C5 70 0 40 15 18 C30 -4 65 -8 85 12 C95 22 98 38 92 52 L78 45 C82 35 78 22 68 14 C52 2 28 8 18 28 C12 40 15 58 28 70 Z"
        fill="url(#soneium-inner)"
      />
    </svg>
  );
}

export function ChainLogo({ chain, className = "h-5 w-5" }: { chain: ChainType; className?: string }) {
  if (chain === 'base') return <BaseLogo className={className} />;
  if (chain === 'solana') return <SolanaLogo className={className} />;
  if (chain === 'soneium') return <SoneiumLogo className={className} />;
  if (chain === 'ink') return <InkLogo className={className} />;
  return null;
}

export function ChainSelector() {
  const { currentChain, chainInfo, switchChain, supportedChains } = useChain();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 min-w-[120px]"
          data-testid="button-chain-selector"
        >
          <ChainLogo chain={currentChain} className="h-5 w-5" />
          <span className="hidden sm:inline">{chainInfo.name}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="w-[160px] z-[100]">
        {supportedChains.map((chain) => {
          const config = CHAIN_CONFIG[chain];
          const isSelected = chain === currentChain;
          
          return (
            <DropdownMenuItem
              key={chain}
              onClick={() => switchChain(chain)}
              className="flex items-center justify-between cursor-pointer"
              data-testid={`menu-item-chain-${chain}`}
            >
              <div className="flex items-center gap-2">
                <ChainLogo chain={chain} className="h-5 w-5" />
                <span>{config.name}</span>
              </div>
              {isSelected && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ChainBadge({ chain }: { chain: ChainType }) {
  const config = CHAIN_CONFIG[chain];
  
  return (
    <span 
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted"
      data-testid={`badge-chain-${chain}`}
    >
      <ChainLogo chain={chain} className="h-4 w-4" />
      <span>{config.name}</span>
    </span>
  );
}
