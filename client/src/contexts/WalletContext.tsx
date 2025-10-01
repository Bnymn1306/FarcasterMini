import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface WalletContextType {
  isWalletConnected: boolean;
  walletAddress: string;
  walletBalance: string;
  isFarcasterConnected: boolean;
  farcasterUsername: string;
  farcasterFid: string;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  connectFarcaster: (username: string, fid: string) => void;
  disconnectFarcaster: () => void;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

let cachedSDK: any = null;

function formatEthBalance(balanceHex: string): string {
  try {
    const balanceWei = BigInt(balanceHex);
    const ethDivisor = BigInt("1000000000000000000");
    const ethPart = balanceWei / ethDivisor;
    const weiRemainder = balanceWei % ethDivisor;
    const decimals = weiRemainder.toString().padStart(18, '0').slice(0, 4);
    return `${ethPart}.${decimals}`;
  } catch {
    return "0.0000";
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletBalance, setWalletBalance] = useState("0.0000");
  const [isFarcasterConnected, setIsFarcasterConnected] = useState(false);
  const [farcasterUsername, setFarcasterUsername] = useState("");
  const [farcasterFid, setFarcasterFid] = useState("");

  const refreshBalance = useCallback(async (address?: string) => {
    try {
      if (!cachedSDK) {
        cachedSDK = (await import("@farcaster/frame-sdk")).default;
      }
      
      let targetAddress = address;
      if (!targetAddress) {
        const accounts = await cachedSDK.wallet.ethProvider.request({ method: "eth_accounts" });
        if (accounts && accounts.length > 0) {
          targetAddress = accounts[0];
        }
      }
      
      if (targetAddress) {
        try {
          const balanceHex = await cachedSDK.wallet.ethProvider.request({
            method: "eth_getBalance",
            params: [targetAddress, "latest"]
          });
          
          const balanceEth = formatEthBalance(balanceHex);
          setWalletBalance(balanceEth);
        } catch (balanceError) {
          console.log("Failed to fetch balance:", balanceError);
          setWalletBalance("0.0000");
        }
      }
    } catch (error) {
      console.log("Failed to refresh balance:", error);
      setWalletBalance("0.0000");
    }
  }, []);

  useEffect(() => {
    const savedWallet = localStorage.getItem("basedmem_wallet");
    const savedFarcaster = localStorage.getItem("basedmem_farcaster");
    
    if (savedWallet) {
      const { address } = JSON.parse(savedWallet);
      setIsWalletConnected(true);
      setWalletAddress(address);
      
      refreshBalance(address).catch(err => {
        console.log("Failed to refresh balance on init:", err);
      });
    }
    
    if (savedFarcaster) {
      const { username, fid } = JSON.parse(savedFarcaster);
      setIsFarcasterConnected(true);
      setFarcasterUsername(username);
      setFarcasterFid(fid);
    }
  }, [refreshBalance]);

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
        
        await refreshBalance(address);
      } else {
        const mockAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb4";
        setIsWalletConnected(true);
        setWalletAddress(mockAddress);
        setWalletBalance("1.5000");
        localStorage.setItem("basedmem_wallet", JSON.stringify({ address: mockAddress }));
      }
    } catch (error) {
      console.log("SDK wallet not available, using mock:", error);
      const mockAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb4";
      setIsWalletConnected(true);
      setWalletAddress(mockAddress);
      setWalletBalance("1.5000");
      localStorage.setItem("basedmem_wallet", JSON.stringify({ address: mockAddress }));
    }
  }, [refreshBalance]);

  const disconnectWallet = useCallback(() => {
    setIsWalletConnected(false);
    setWalletAddress("");
    setWalletBalance("0.0000");
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
        walletBalance,
        isFarcasterConnected,
        farcasterUsername,
        farcasterFid,
        connectWallet,
        disconnectWallet,
        connectFarcaster,
        disconnectFarcaster,
        refreshBalance,
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
