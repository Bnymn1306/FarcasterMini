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
let ethersProvider: BrowserProvider | null = null;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletBalance, setWalletBalance] = useState("0.0000");
  const [isFarcasterConnected, setIsFarcasterConnected] = useState(false);
  const [farcasterUsername, setFarcasterUsername] = useState("");
  const [farcasterFid, setFarcasterFid] = useState("");

  const getProvider = useCallback((): BrowserProvider | null => {
    return ethersProvider;
  }, []);

  const refreshBalance = useCallback(async (address?: string) => {
    try {
      if (!ethersProvider) return;
      
      const targetAddress = address || walletAddress;
      if (!targetAddress) return;
      
      const balance = await ethersProvider.getBalance(targetAddress);
      const balanceEth = formatEther(balance);
      const formatted = parseFloat(balanceEth).toFixed(4);
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
      // Try Farcaster SDK first (if in Farcaster frame)
      if (!cachedSDK) {
        cachedSDK = (await import("@farcaster/frame-sdk")).default;
      }
      
      const ethProvider = cachedSDK.wallet.ethProvider;
      if (ethProvider) {
        // Use Farcaster's provider
        ethersProvider = new BrowserProvider(ethProvider);
        
        // Request accounts
        const accounts = await ethProvider.request({ method: "eth_requestAccounts" });
        if (accounts && accounts.length > 0) {
          const address = accounts[0];
          
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
      console.log("Farcaster wallet not available, trying MetaMask:", farcasterError);
    }
    
    // Fallback to MetaMask/browser wallet
    try {
      if (typeof window.ethereum !== "undefined") {
        ethersProvider = new BrowserProvider(window.ethereum);
        
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        if (accounts && accounts.length > 0) {
          const address = accounts[0];
          
          // Switch to Base network
          try {
            await window.ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: `0x${BASE_CHAIN_ID.toString(16)}` }],
            });
          } catch (switchError: any) {
            if (switchError.code === 4902) {
              await window.ethereum.request({
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
      
      throw new Error("No wallet detected");
    } catch (error) {
      console.error("Wallet connection failed:", error);
      alert("Please install MetaMask or open this app in Farcaster to connect your wallet!");
    }
  }, [refreshBalance]);

  const sendETH = useCallback(async (to: string, amount: string): Promise<string> => {
    if (!ethersProvider) {
      throw new Error("Wallet not connected");
    }
    
    try {
      const signer = await ethersProvider.getSigner();
      const tx = await signer.sendTransaction({
        to,
        value: parseEther(amount),
      });
      
      console.log("Transaction sent:", tx.hash);
      await tx.wait();
      console.log("Transaction confirmed:", tx.hash);
      
      // Refresh balance after transaction
      await refreshBalance();
      
      return tx.hash;
    } catch (error: any) {
      console.error("ETH transfer failed:", error);
      throw new Error(error.message || "Transaction failed");
    }
  }, [refreshBalance]);

  const disconnectWallet = useCallback(() => {
    setIsWalletConnected(false);
    setWalletAddress("");
    setWalletBalance("0.0000");
    ethersProvider = null;
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
