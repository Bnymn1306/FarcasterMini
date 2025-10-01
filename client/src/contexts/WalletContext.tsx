import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface WalletContextType {
  isWalletConnected: boolean;
  walletAddress: string;
  isFarcasterConnected: boolean;
  farcasterUsername: string;
  farcasterFid: string;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  connectFarcaster: (username: string, fid: string) => void;
  disconnectFarcaster: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

let cachedSDK: any = null;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [isFarcasterConnected, setIsFarcasterConnected] = useState(false);
  const [farcasterUsername, setFarcasterUsername] = useState("");
  const [farcasterFid, setFarcasterFid] = useState("");

  useEffect(() => {
    const savedWallet = localStorage.getItem("basedmem_wallet");
    const savedFarcaster = localStorage.getItem("basedmem_farcaster");
    
    if (savedWallet) {
      const { address } = JSON.parse(savedWallet);
      setIsWalletConnected(true);
      setWalletAddress(address);
    }
    
    if (savedFarcaster) {
      const { username, fid } = JSON.parse(savedFarcaster);
      setIsFarcasterConnected(true);
      setFarcasterUsername(username);
      setFarcasterFid(fid);
    }
  }, []);

  const connectWallet = useCallback(async () => {
    try {
      if (!cachedSDK) {
        cachedSDK = (await import("@farcaster/frame-sdk")).default;
      }
      const accounts = await cachedSDK.wallet.ethProvider.request({ method: "eth_accounts" });
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        setIsWalletConnected(true);
        setWalletAddress(address);
        localStorage.setItem("basedmem_wallet", JSON.stringify({ address }));
      } else {
        const mockAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb4";
        setIsWalletConnected(true);
        setWalletAddress(mockAddress);
        localStorage.setItem("basedmem_wallet", JSON.stringify({ address: mockAddress }));
      }
    } catch (error) {
      console.log("SDK wallet not available, using mock:", error);
      const mockAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb4";
      setIsWalletConnected(true);
      setWalletAddress(mockAddress);
      localStorage.setItem("basedmem_wallet", JSON.stringify({ address: mockAddress }));
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setIsWalletConnected(false);
    setWalletAddress("");
    localStorage.removeItem("basedmem_wallet");
  }, []);

  const connectFarcaster = useCallback((username: string, fid: string) => {
    setIsFarcasterConnected(true);
    setFarcasterUsername(username);
    setFarcasterFid(fid);
    localStorage.setItem("basedmem_farcaster", JSON.stringify({ username, fid }));
  }, []);

  const disconnectFarcaster = useCallback(() => {
    setIsFarcasterConnected(false);
    setFarcasterUsername("");
    setFarcasterFid("");
    localStorage.removeItem("basedmem_farcaster");
  }, []);

  return (
    <WalletContext.Provider
      value={{
        isWalletConnected,
        walletAddress,
        isFarcasterConnected,
        farcasterUsername,
        farcasterFid,
        connectWallet,
        disconnectWallet,
        connectFarcaster,
        disconnectFarcaster,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
