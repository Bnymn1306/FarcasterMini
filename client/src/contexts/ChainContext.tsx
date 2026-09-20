import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { ChainType } from "@shared/schema";

interface ChainInfo {
  id: ChainType;
  name: string;
  icon: string;
  chainId: number | null;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrl: string;
  explorerUrl: string;
  isEVM: boolean;
}

export const CHAIN_CONFIG: Record<ChainType, ChainInfo> = {
  base: {
    id: 'base',
    name: 'Base',
    icon: '🔵',
    chainId: 8453,
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    isEVM: true,
  },
  solana: {
    id: 'solana',
    name: 'Solana',
    icon: '🟣',
    chainId: null,
    nativeCurrency: {
      name: 'Solana',
      symbol: 'SOL',
      decimals: 9,
    },
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    explorerUrl: 'https://solscan.io',
    isEVM: false,
  },
  soneium: {
    id: 'soneium',
    name: 'Soneium',
    icon: '🔴',
    chainId: 1868,
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrl: 'https://rpc.soneium.org',
    explorerUrl: 'https://soneium.blockscout.com',
    isEVM: true,
  },
  ink: {
    id: 'ink',
    name: 'INK',
    icon: '🖊️',
    chainId: 57073,
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrl: 'https://rpc-gel.inkonchain.com',
    explorerUrl: 'https://explorer.inkonchain.com',
    isEVM: true,
  },
};

interface ChainContextType {
  currentChain: ChainType;
  chainInfo: ChainInfo;
  switchChain: (chain: ChainType) => void;
  isBase: boolean;
  isSolana: boolean;
  isSoneium: boolean;
  isInk: boolean;
  supportedChains: ChainType[];
}

const ChainContext = createContext<ChainContextType | undefined>(undefined);

export function ChainProvider({ children }: { children: ReactNode }) {
  const [currentChain, setCurrentChain] = useState<ChainType>('base');

  const switchChain = useCallback((chain: ChainType) => {
    console.log(`🔗 Switching chain to: ${chain}`);
    setCurrentChain(chain);
    localStorage.setItem('basedmem_chain', chain);
  }, []);

  const chainInfo = CHAIN_CONFIG[currentChain];
  const isBase = currentChain === 'base';
  const isSolana = currentChain === 'solana';
  const isSoneium = currentChain === 'soneium';
  const isInk = currentChain === 'ink';
  const supportedChains: ChainType[] = ['base', 'solana', 'soneium', 'ink'];

  return (
    <ChainContext.Provider
      value={{
        currentChain,
        chainInfo,
        switchChain,
        isBase,
        isSolana,
        isSoneium,
        isInk,
        supportedChains,
      }}
    >
      {children}
    </ChainContext.Provider>
  );
}

export function useChain() {
  const context = useContext(ChainContext);
  if (context === undefined) {
    throw new Error("useChain must be used within a ChainProvider");
  }
  return context;
}
