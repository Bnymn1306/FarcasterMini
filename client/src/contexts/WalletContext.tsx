import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { BrowserProvider, parseEther, formatEther } from "ethers";

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
  sendETH: (to: string, amount: string) => Promise<string>;
  getProvider: () => BrowserProvider | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const BASE_CHAIN_ID = 8453; // Base Mainnet
const BASE_RPC_URL = "https://mainnet.base.org";

let cachedSDK: any = null;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletBalance, setWalletBalance] = useState("0.0000");
  const [isFarcasterConnected, setIsFarcasterConnected] = useState(false);
  const [farcasterUsername, setFarcasterUsername] = useState("");
  const [farcasterFid, setFarcasterFid] = useState("");
  const [ethersProvider, setEthersProvider] = useState<BrowserProvider | null>(null);

  const getProvider = useCallback((): BrowserProvider | null => {
    return ethersProvider;
  }, [ethersProvider]);

  const refreshBalance = useCallback(async (address?: string) => {
    try {
      // Ensure we have provider and address
      if (!ethersProvider) {
        console.warn("No provider available for balance fetch");
        return;
      }
      
      const targetAddress = address || walletAddress;
      if (!targetAddress) {
        console.warn("No address available for balance fetch");
        return;
      }
      
      console.log("Fetching balance for:", targetAddress);
      const balance = await ethersProvider.getBalance(targetAddress);
      const balanceEth = formatEther(balance);
      const formatted = parseFloat(balanceEth).toFixed(4);
      console.log("Balance fetched:", formatted, "ETH");
      setWalletBalance(formatted);
    } catch (error) {
      console.error("Failed to refresh balance:", error);
      setWalletBalance("0.0000");
    }
  }, [walletAddress]);

  useEffect(() => {
    const savedWallet = localStorage.getItem("basedmem_wallet");
    const savedFarcaster = localStorage.getItem("basedmem_farcaster");
    
    if (savedWallet) {
      const { address } = JSON.parse(savedWallet);
      console.log("Restoring wallet:", address);
      setIsWalletConnected(true);
      setWalletAddress(address);
      
      // Re-initialize provider on mount
      (async () => {
        try {
          console.log("Initializing wallet provider...");
          
          // Try Farcaster SDK first
          if (!cachedSDK) {
            cachedSDK = (await import("@farcaster/frame-sdk")).default;
          }
          const ethProvider = cachedSDK?.wallet?.ethProvider;
          
          if (ethProvider) {
            console.log("Using Farcaster provider for restore");
            const provider = new BrowserProvider(ethProvider);
            setEthersProvider(provider);
            
            // Wait a bit for provider to be ready
            setTimeout(async () => {
              try {
                const balance = await provider.getBalance(address);
                const balanceEth = formatEther(balance);
                const formatted = parseFloat(balanceEth).toFixed(4);
                console.log("Balance fetched:", formatted, "ETH");
                setWalletBalance(formatted);
              } catch (err) {
                console.error("Failed to fetch balance:", err);
              }
            }, 500);
          } else {
            console.warn("Farcaster provider not available");
          }
        } catch (err) {
          console.error("Failed to initialize provider on mount:", err);
        }
      })();
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
      // Try Farcaster SDK first (if in Farcaster frame)
      if (!cachedSDK) {
        try {
          cachedSDK = (await import("@farcaster/frame-sdk")).default;
        } catch (sdkError) {
          console.log("Farcaster SDK not available:", sdkError);
        }
      }
      
      // Use optional chaining to safely access wallet provider
      const ethProvider = cachedSDK?.wallet?.ethProvider;
      if (ethProvider) {
        console.log("Using Farcaster wallet provider");
        // Use Farcaster's provider
        const provider = new BrowserProvider(ethProvider);
        setEthersProvider(provider);
        
        // Request accounts
        const accounts = await ethProvider.request({ method: "eth_requestAccounts" });
        if (accounts && accounts.length > 0) {
          const address = accounts[0];
          console.log("Connected to Farcaster wallet:", address);
          
          // Switch to Base network if needed
          try {
            await ethProvider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: `0x${BASE_CHAIN_ID.toString(16)}` }],
            });
          } catch (switchError: any) {
            // Chain doesn't exist, add it
            if (switchError.code === 4902) {
              await ethProvider.request({
                method: "wallet_addEthereumChain",
                params: [{
                  chainId: `0x${BASE_CHAIN_ID.toString(16)}`,
                  chainName: "Base",
                  nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
                  rpcUrls: [BASE_RPC_URL],
                  blockExplorerUrls: ["https://basescan.org"],
                }],
              });
            }
          }
          
          setIsWalletConnected(true);
          setWalletAddress(address);
          localStorage.setItem("basedmem_wallet", JSON.stringify({ address }));
          await refreshBalance(address);
          return;
        }
      }
    } catch (farcasterError) {
      console.error("Farcaster wallet connection failed:", farcasterError);
      alert("Please open this app in Farcaster to connect your wallet!");
    }
  }, [refreshBalance]);

  const sendETH = useCallback(async (to: string, amount: string): Promise<string> => {
    console.log("=== sendETH called ===");
    console.log("to:", to);
    console.log("amount:", amount);
    
    if (!walletAddress) {
      const error = "Wallet address not found. Please reconnect your Farcaster wallet.";
      console.error(error);
      throw new Error(error);
    }
    
    if (!ethersProvider) {
      throw new Error("Farcaster wallet provider not available. Please reconnect your wallet.");
    }
    
    try {
      console.log("✅ Using Farcaster wallet provider");
      const signer = await ethersProvider.getSigner();
      const valueWei = parseEther(amount);
      console.log("Transaction params:", { from: walletAddress, to, value: valueWei.toString() });
      
      // Send transaction via Farcaster wallet
      const tx = await signer.sendTransaction({
        to,
        value: valueWei,
      });
      
      console.log("✅ TX HASH:", tx.hash);
      
      // Wait for confirmation
      await tx.wait();
      console.log("✅ Transaction confirmed");
      
      await refreshBalance();
      return tx.hash;
    } catch (error: any) {
      console.error("❌ Farcaster wallet transaction error:", error);
      
      if (error.code === 4001 || error.message?.includes("reject") || error.message?.includes("denied")) {
        throw new Error("Transaction cancelled by user");
      } else if (error.message?.includes("insufficient funds")) {
        throw new Error("Insufficient funds for this transaction");
      }
      
      throw new Error(error.message || "Transaction failed");
    }
  }, [refreshBalance, walletAddress]);

  const disconnectWallet = useCallback(() => {
    setIsWalletConnected(false);
    setWalletAddress("");
    setWalletBalance("0.0000");
    setEthersProvider(null);
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
        sendETH,
        getProvider,
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
