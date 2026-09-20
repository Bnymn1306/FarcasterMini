import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram, VersionedTransaction } from "@solana/web3.js";
import { useChain } from "./ChainContext";
import { isInFarcasterFrame } from "@/lib/farcasterInit";

// Official Farcaster Solana integration
import { FarcasterSolanaProvider } from '@farcaster/mini-app-solana';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';

// Use Solana public RPC for wallet adapter connection (balance fetch uses backend API)
const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";

export type SolanaWalletType = "phantom" | "okx" | "backpack" | "coinbase" | "solflare" | "trust" | "farcaster" | null;

interface WalletInfo {
  id: SolanaWalletType;
  name: string;
  icon: string;
  isInstalled: boolean;
  downloadUrl: string;
}

interface SolanaWalletContextType {
  isConnected: boolean;
  isConnecting: boolean;
  publicKey: string | null;
  balance: string;
  walletType: SolanaWalletType;
  availableWallets: WalletInfo[];
  connect: (walletType?: SolanaWalletType) => Promise<void>;
  disconnect: () => void;
  refreshBalance: (skipCache?: boolean) => Promise<void>;
  sendSOL: (to: string, amount: number) => Promise<string>;
  signTransaction: <T extends Transaction | VersionedTransaction>(transaction: T) => Promise<T>;
  getConnection: () => Connection;
  isFarcasterWallet: boolean;
  isInFarcasterFrame: boolean; // ✅ NEW: Indicates if we're in Farcaster Frame (PC or mobile)
}

const SolanaWalletContext = createContext<SolanaWalletContextType | undefined>(undefined);

function detectAvailableWallets(): WalletInfo[] {
  const win = window as any;
  
  const wallets: WalletInfo[] = [
    {
      id: "farcaster",
      name: "Farcaster Wallet",
      icon: "https://warpcast.com/favicon.ico",
      isInstalled: true, // Always available in Farcaster context
      downloadUrl: "https://warpcast.com"
    },
    {
      id: "phantom",
      name: "Phantom",
      icon: "https://phantom.app/img/logo.png",
      isInstalled: !!(win.phantom?.solana?.isPhantom),
      downloadUrl: "https://phantom.app/download"
    },
    {
      id: "okx",
      name: "OKX Wallet",
      icon: "https://www.okx.com/cdn/assets/imgs/2411/F82DD5B9D3DAEA00.png",
      isInstalled: !!(win.okxwallet?.solana || win.okx?.solana || win.okexchain?.solana),
      downloadUrl: "https://www.okx.com/download"
    },
    {
      id: "backpack",
      name: "Backpack",
      icon: "https://backpack.app/assets/backpack-icon.svg",
      isInstalled: !!(win.backpack?.solana || win.backpack),
      downloadUrl: "https://backpack.app/downloads"
    },
    {
      id: "solflare",
      name: "Solflare",
      icon: "https://solflare.com/favicon.ico",
      isInstalled: !!(win.solflare?.isSolflare),
      downloadUrl: "https://solflare.com/download"
    },
    {
      id: "coinbase",
      name: "Coinbase Wallet",
      icon: "https://www.coinbase.com/favicon.ico",
      isInstalled: !!(win.coinbaseSolana || win.coinbaseWalletExtension?.solana),
      downloadUrl: "https://www.coinbase.com/wallet"
    }
  ];
  
  return wallets;
}

// Inner component that uses wallet adapter hooks
function SolanaWalletContextProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const { 
    publicKey: walletPublicKey, 
    connected, 
    connecting,
    select,
    connect: walletConnect,
    disconnect: walletDisconnect,
    signTransaction: walletSignTransaction,
    sendTransaction,
    wallet
  } = useWallet();
  
  const [balance, setBalance] = useState("0.0000");
  const [availableWallets, setAvailableWallets] = useState<WalletInfo[]>([]);
  const { isSolana } = useChain();

  // Detect available wallets on mount
  useEffect(() => {
    const wallets = detectAvailableWallets();
    setAvailableWallets(wallets);
    console.log("🔍 Detected Solana wallets:", wallets.filter(w => w.isInstalled).map(w => w.name));
  }, []);

  // ✅ FARCASTER AUTO-CONNECT: More aggressive for PC Farcaster
  const autoConnectAttempted = useRef(false);
  
  useEffect(() => {
    // Don't run if already connected or connecting
    if (connected || connecting || autoConnectAttempted.current) {
      return;
    }
    
    const win = window as any;
    let pollCount = 0;
    const maxPolls = 20; // 20 * 300ms = 6 seconds max
    
    const tryAutoConnect = async () => {
      pollCount++;
      
      const hasFrameEnv = win.__FRAME_ENV === true;
      const isPCFarcaster = win.__IS_PC_FARCASTER === true;
      const inFrame = isInFarcasterFrame();
      const hasFarcasterSolana = !!(win.farcaster?.solana);
      const isMobileWebView = win.__FRAME_DETECTION?.isMobileWebView === true;
      
      console.log(`🔷 Solana auto-connect poll #${pollCount}:`, {
        hasFrameEnv, isPCFarcaster, inFrame, hasFarcasterSolana, isMobileWebView
      });
      
      // ✅ CRITICAL: Connect if ANY Farcaster Frame indicator is true
      // - PC Farcaster: __IS_PC_FARCASTER = true
      // - Mobile Farcaster: __FRAME_ENV = true, inFrame = true, or isMobileWebView = true
      const shouldAutoConnect = hasFrameEnv || isPCFarcaster || inFrame || hasFarcasterSolana || isMobileWebView;
      
      if (shouldAutoConnect) {
        autoConnectAttempted.current = true;
        
        console.log("🔷 FARCASTER SOLANA AUTO-CONNECT: Selecting and connecting Farcaster Wallet...");
        
        try {
          // Step 1: Select the Farcaster Wallet
          select('Farcaster Wallet' as any);
          console.log("✅ Farcaster Solana wallet selected");
          
          // Step 2: Wait a bit then call connect()
          setTimeout(async () => {
            try {
              console.log("🔷 Calling walletConnect()...");
              await walletConnect();
              console.log("✅ Farcaster Solana wallet connected!");
            } catch (connectError) {
              console.warn("⚠️ Farcaster Solana connect() failed:", connectError);
            }
          }, 500);
        } catch (error) {
          console.warn("⚠️ Farcaster Solana auto-connect failed:", error);
        }
        return; // Stop polling
      }
      
      // Continue polling if not at max
      if (pollCount < maxPolls) {
        setTimeout(tryAutoConnect, 300);
      } else {
        console.log("🔷 Solana auto-connect: Max polls reached, not in Farcaster Frame");
        autoConnectAttempted.current = true;
      }
    };
    
    // Start polling after initial delay (wait for frame detection)
    const startTimer = setTimeout(tryAutoConnect, 500);
    
    return () => clearTimeout(startTimer);
  }, [connected, connecting, select, walletConnect]);

  // Derive public key string
  const publicKey = useMemo(() => {
    return walletPublicKey?.toBase58() || null;
  }, [walletPublicKey]);

  // Log connection status changes
  useEffect(() => {
    if (connected && publicKey) {
      console.log("✅ Solana wallet connected:", publicKey);
      console.log("📱 Wallet name:", wallet?.adapter?.name);
    }
  }, [connected, publicKey, wallet]);

  const getConnection = useCallback(() => connection, [connection]);

  const refreshBalance = useCallback(async (skipCache: boolean = false) => {
    if (!walletPublicKey) {
      console.log("⚠️ Cannot refresh balance - no public key");
      return;
    }
    
    try {
      // Use backend API to fetch balance (avoids CORS and rate limiting issues)
      const address = walletPublicKey.toBase58();
      console.log(`🔄 Fetching SOL balance via backend API for ${address.substring(0, 8)}...${skipCache ? ' (skip cache)' : ''}`);
      
      // Add timestamp to bust cache when skipCache is true
      const url = skipCache 
        ? `/api/solana/balance/${address}?t=${Date.now()}` 
        : `/api/solana/balance/${address}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      const sol = data.balance;
      setBalance(sol.toFixed(4));
      console.log("💰 SOL Balance:", sol.toFixed(4), data.cached ? "(cached)" : "");
    } catch (error: any) {
      console.error("❌ Failed to fetch SOL balance:", error?.message || error);
      // Don't reset balance to 0, keep previous value
    }
  }, [walletPublicKey]);

  // Auto-refresh balance when connected (regardless of selected chain)
  useEffect(() => {
    if (connected && walletPublicKey) {
      console.log("🔄 Auto-refreshing SOL balance (connected)...");
      refreshBalance();
    }
  }, [connected, walletPublicKey, refreshBalance]);
  
  // Also refresh when chain switches to Solana
  useEffect(() => {
    if (connected && walletPublicKey && isSolana) {
      console.log("🔄 Chain switched to Solana, refreshing balance...");
      refreshBalance();
    }
  }, [isSolana]);

  const connect = useCallback(async (selectedWalletType?: SolanaWalletType) => {
    console.log("🔗 Connect requested, wallet type:", selectedWalletType);
    
    if (!selectedWalletType) {
      console.warn("⚠️ No wallet type specified");
      return;
    }
    
    // Map our wallet IDs to adapter names
    const walletNameMap: Record<string, string> = {
      'farcaster': 'Farcaster Wallet',
      'phantom': 'Phantom',
      'okx': 'OKX Wallet',
      'backpack': 'Backpack',
      'solflare': 'Solflare',
      'coinbase': 'Coinbase Wallet',
    };
    
    const adapterName = walletNameMap[selectedWalletType];
    if (!adapterName) {
      console.error("❌ Unknown wallet type:", selectedWalletType);
      throw new Error(`Unknown wallet type: ${selectedWalletType}`);
    }
    
    console.log("🔄 Selecting wallet adapter:", adapterName);
    
    try {
      // Use the wallet adapter's select function
      select(adapterName as any);
      console.log("✅ Wallet selected, waiting for connection...");
    } catch (error) {
      console.error("❌ Failed to select wallet:", error);
      throw error;
    }
  }, [select]);

  const disconnect = useCallback(() => {
    console.log("🔌 Disconnecting Solana wallet...");
    walletDisconnect();
    setBalance("0.0000");
  }, [walletDisconnect]);

  const sendSOL = useCallback(async (to: string, amount: number): Promise<string> => {
    if (!walletPublicKey) {
      throw new Error("Wallet not connected");
    }
    
    console.log(`📤 Sending ${amount} SOL to ${to}...`);
    
    const toPubkey = new PublicKey(to);
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
    
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: walletPublicKey,
        toPubkey,
        lamports,
      })
    );
    
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletPublicKey;
    
    const signature = await sendTransaction(transaction, connection);
    
    // Wait for confirmation
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    });
    
    console.log("✅ Transaction confirmed:", signature);
    
    // Refresh balance after send
    setTimeout(() => refreshBalance(), 2000);
    
    return signature;
  }, [walletPublicKey, connection, sendTransaction, refreshBalance]);

  const signTransaction = useCallback(async <T extends Transaction | VersionedTransaction>(
    transaction: T
  ): Promise<T> => {
    if (!walletSignTransaction) {
      throw new Error("Wallet does not support signing");
    }
    
    console.log("📝 Signing transaction...");
    return await walletSignTransaction(transaction);
  }, [walletSignTransaction]);

  // Determine wallet type
  const walletType = useMemo((): SolanaWalletType => {
    if (!wallet?.adapter?.name) return null;
    const name = wallet.adapter.name.toLowerCase();
    if (name.includes('farcaster')) return 'farcaster';
    if (name.includes('phantom')) return 'phantom';
    if (name.includes('okx')) return 'okx';
    if (name.includes('backpack')) return 'backpack';
    if (name.includes('solflare')) return 'solflare';
    if (name.includes('coinbase')) return 'coinbase';
    return null;
  }, [wallet]);

  const isFarcasterWallet = useMemo(() => {
    return wallet?.adapter?.name?.toLowerCase().includes('farcaster') || false;
  }, [wallet]);

  // ✅ NEW: Check if we're in Farcaster Frame (PC or mobile)
  const isInFarcasterFrameContext = useMemo(() => {
    const win = window as any;
    return !!(win.__FRAME_ENV === true || win.__IS_PC_FARCASTER === true);
  }, []);

  return (
    <SolanaWalletContext.Provider
      value={{
        isConnected: connected,
        isConnecting: connecting,
        publicKey,
        balance,
        walletType,
        availableWallets,
        connect,
        disconnect,
        refreshBalance,
        sendSOL,
        signTransaction,
        getConnection,
        isFarcasterWallet,
        isInFarcasterFrame: isInFarcasterFrameContext,
      }}
    >
      {children}
    </SolanaWalletContext.Provider>
  );
}

// Main provider that wraps with FarcasterSolanaProvider
export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  return (
    <FarcasterSolanaProvider endpoint={SOLANA_RPC_URL}>
      <SolanaWalletContextProvider>
        {children}
      </SolanaWalletContextProvider>
    </FarcasterSolanaProvider>
  );
}

export function useSolanaWallet() {
  const context = useContext(SolanaWalletContext);
  if (context === undefined) {
    throw new Error("useSolanaWallet must be used within a SolanaWalletProvider");
  }
  return context;
}
