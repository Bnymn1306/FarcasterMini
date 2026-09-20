import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { BrowserProvider, parseEther, formatEther, Network } from "ethers";
import { getSDK, isInFarcasterFrame, ensureMiniAppDetection } from "@/lib/farcasterInit";
import type { User } from "@shared/schema";
import { assertSelectedAccount, BASE_CHAIN_ID, BASE_RPC_URL, selectPersistedProvider, switchAndAssertBase } from "@/lib/walletSecurity";

export type WalletType = 'browser' | 'smart' | 'farcaster' | null;

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<any>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
}

export interface InjectedWallet {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
  provider: Eip1193Provider;
}

interface WalletContextType {
  isWalletConnected: boolean;
  walletAddress: string;
  walletBalance: string;
  walletType: WalletType;
  isSiwaVerified: boolean;
  user: User | null;
  isUserReady: boolean;
  isFarcasterConnected: boolean;
  farcasterUsername: string;
  farcasterFid: string;
  injectedWallets: InjectedWallet[];
  connectWallet: (providerUuid?: string) => Promise<void>;
  connectSmartWallet: () => Promise<void>;
  verifySiwa: () => Promise<boolean>;
  disconnectWallet: () => void;
  connectFarcaster: (username: string, fid: string) => void;
  disconnectFarcaster: () => void;
  refreshBalance: () => Promise<void>;
  sendETH: (to: string, amount: string) => Promise<string>;
  getProvider: () => BrowserProvider | null;
  ensureBaseChain: () => Promise<void>;
  requireUser: () => User;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// ✅ CRITICAL FIX: Pre-define Base network to skip auto-detection (prevents RPC timeout errors)
const BASE_NETWORK = new Network("base", BASE_CHAIN_ID);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletBalance, setWalletBalance] = useState("0.0000");
  const [walletType, setWalletType] = useState<WalletType>(null);
  const [isSiwaVerified, setIsSiwaVerified] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isUserReady, setIsUserReady] = useState(false);
  const [isFarcasterConnected, setIsFarcasterConnected] = useState(false);
  const [farcasterUsername, setFarcasterUsername] = useState("");
  const [farcasterFid, setFarcasterFid] = useState("");
  const [ethersProvider, setEthersProvider] = useState<BrowserProvider | null>(null);
  const [injectedWallets, setInjectedWallets] = useState<InjectedWallet[]>([]);
  const selectedEip1193Provider = useRef<Eip1193Provider | null>(null);

  useEffect(() => {
    const discovered = new Map<string, InjectedWallet>();
    const announce = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.info?.uuid || typeof detail?.provider?.request !== "function") return;
      discovered.set(detail.info.uuid, {
        uuid: detail.info.uuid,
        name: detail.info.name || "Browser wallet",
        icon: detail.info.icon || "",
        rdns: detail.info.rdns || "",
        provider: detail.provider,
      });
      setInjectedWallets(Array.from(discovered.values()));
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", announce);
  }, []);

  useEffect(() => {
    if (!injectedWallets.length) return;
    try {
      const saved = JSON.parse(localStorage.getItem("basedmem_wallet") || "null");
      if (!saved?.address || saved.walletType === "smart" || saved.walletType === "farcaster") return;
      if (!saved.providerUuid && injectedWallets.length > 1) {
        setIsWalletConnected(false);
        setWalletAddress("");
        setWalletBalance("0.0000");
        setUser(null);
        setIsUserReady(false);
        selectedEip1193Provider.current = null;
        setEthersProvider(null);
        localStorage.removeItem("basedmem_wallet");
        localStorage.removeItem("basedmem_user");
        return;
      }
      const selected = selectPersistedProvider(injectedWallets, saved.providerUuid);
      if (!selected) {
        setIsWalletConnected(false);
        selectedEip1193Provider.current = null;
        setEthersProvider(null);
        return;
      }
      selectedEip1193Provider.current = selected.provider;
      setEthersProvider(new BrowserProvider(selected.provider, BASE_NETWORK));
      localStorage.setItem("basedmem_wallet", JSON.stringify({
        address: saved.address,
        walletType: "browser",
        providerUuid: selected.uuid,
      }));
    } catch {
      // Ignore malformed legacy wallet state.
    }
  }, [injectedWallets]);

  const getProvider = useCallback((): BrowserProvider | null => {
    return ethersProvider;
  }, [ethersProvider]);

  const ensureBaseChain = useCallback(async () => {
    const provider = selectedEip1193Provider.current;
    if (!provider) throw new Error("Reconnect the wallet you want to use.");
    await switchAndAssertBase(provider);
    const accounts = await provider.request({ method: "eth_accounts" }) as string[];
    assertSelectedAccount(accounts, walletAddress);
  }, [walletAddress]);

  const refreshBalance = useCallback(async (address?: string) => {
    const targetAddress = address || walletAddress;
    if (!targetAddress) {
      console.warn("⚠️ No address available for balance fetch");
      return;
    }
    
    try {
      console.log("💰 Fetching balance for:", targetAddress);
      
      // ✅ FARCASTER-SAFE: Use backend API for reliable balance fetch
      const response = await fetch(`/api/token-balance?walletAddress=${targetAddress}&tokenAddress=ETH`);
      if (response.ok) {
        const data = await response.json();
        const formatted = parseFloat(data.formattedBalance || "0").toFixed(4);
        console.log("✅ Balance from API:", formatted, "ETH");
        setWalletBalance(formatted);
        return;
      }
      
      // Fallback to provider if API fails
      if (ethersProvider) {
        const balance = await ethersProvider.getBalance(targetAddress);
        const balanceEth = formatEther(balance);
        const formatted = parseFloat(balanceEth).toFixed(4);
        console.log("✅ Balance from provider:", formatted, "ETH");
        setWalletBalance(formatted);
      }
    } catch (error) {
      console.error("❌ Failed to refresh balance:", error);
      
      // Retry with provider as fallback
      if (ethersProvider) {
        try {
          const balance = await ethersProvider.getBalance(targetAddress);
          const balanceEth = formatEther(balance);
          const formatted = parseFloat(balanceEth).toFixed(4);
          console.log("✅ Balance from provider fallback:", formatted, "ETH");
          setWalletBalance(formatted);
        } catch (providerError) {
          console.error("❌ Provider fallback also failed:", providerError);
          setWalletBalance("0.0000");
        }
      } else {
        setWalletBalance("0.0000");
      }
    }
  }, [walletAddress, ethersProvider]);

  // Helper: Ensure user exists in database (fetch or create)
  // In-flight cache to prevent duplicate POSTs
  const userProvisioningPromises = useRef<Map<string, Promise<User>>>(new Map());
  
  const ensureUserExists = useCallback(async (address: string): Promise<User> => {
    // Check if already in-flight
    const inFlight = userProvisioningPromises.current.get(address);
    if (inFlight) {
      console.log("⏳ User provisioning already in progress for:", address);
      return inFlight;
    }
    
    // Create new promise
    const promise = (async () => {
      try {
        console.log("👤 Provisioning user for address:", address);
        
        // Try to fetch existing user
        const response = await fetch(`/api/users?walletAddress=${address}`);
        if (response.ok) {
          const userData = await response.json();
          console.log("✅ User found:", userData.id);
          
          // ✅ Recover notification token from localStorage if user doesn't have one
          const storedToken = localStorage.getItem('basedmem_notification_token');
          const storedUrl = localStorage.getItem('basedmem_notification_url');
          if (storedToken && storedUrl && userData.id && !userData.farcasterNotificationToken) {
            console.log("🔔 Recovering notification token from localStorage for existing user...");
            try {
              await fetch(`/api/users/${userData.id}/farcaster`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  farcasterNotificationToken: storedToken,
                  farcasterNotificationUrl: storedUrl,
                }),
              });
              console.log("✅ Notification token recovered and saved!");
            } catch (err) {
              console.warn("Failed to recover notification token:", err);
            }
          }
          
          return userData;
        }
        
        // User not found, create new one
        console.log("📝 Creating new user...");
        const createResponse = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: address }),
        });
        
        if (!createResponse.ok) {
          const errorData = await createResponse.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to create user');
        }
        
        const newUser = await createResponse.json();
        console.log("✅ User created:", newUser.id);
        
        // ✅ Recover notification token from localStorage if available
        const storedToken = localStorage.getItem('basedmem_notification_token');
        const storedUrl = localStorage.getItem('basedmem_notification_url');
        if (storedToken && storedUrl && newUser.id) {
          console.log("🔔 Recovering notification token from localStorage...");
          try {
            await fetch(`/api/users/${newUser.id}/farcaster`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                farcasterNotificationToken: storedToken,
                farcasterNotificationUrl: storedUrl,
              }),
            });
            console.log("✅ Notification token recovered and saved!");
          } catch (err) {
            console.warn("Failed to recover notification token:", err);
          }
        }
        
        return newUser;
      } catch (error: any) {
        console.error("❌ User provisioning error:", error);
        throw new Error(error.message || "Failed to create or fetch user. Please try again.");
      } finally {
        // Clear from cache
        userProvisioningPromises.current.delete(address);
      }
    })();
    
    // Store in cache
    userProvisioningPromises.current.set(address, promise);
    return promise;
  }, []);

  useEffect(() => {
    const savedWallet = localStorage.getItem("basedmem_wallet");
    const savedFarcaster = localStorage.getItem("basedmem_farcaster");
    const savedUser = localStorage.getItem("basedmem_user");
    
    // ✅ AUTO-CONNECT FARCASTER FRAME (CRITICAL FIX)
    // If no saved wallet but we're in Frame, silently initialize provider and address
    (async () => {
      try {
        // ✅ BASE APP FIX: await official Mini App detection first — the Base app
        // webview isn't caught by UA/iframe sniffing, only by sdk.isInMiniApp().
        await ensureMiniAppDetection();
        const inFrame = isInFarcasterFrame();
        if (!savedWallet && inFrame) {
          console.log("🔷 FRAME AUTO-CONNECT: Initializing Farcaster wallet...");
          
          const sdk = getSDK();
          
          // ✅ CRITICAL FIX: AWAIT sdk.actions.ready() before accessing wallet!
          // Mobile app: ready() resolves quickly
          // Desktop browser: ready() never resolves - use timeout
          console.log("📱 Calling SDK ready()...");
          try {
            await Promise.race([
              sdk.actions.ready(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('SDK ready timeout')), 3000))
            ]);
            console.log("✅ SDK ready - Farcaster provider initialized!");
          } catch (error) {
            console.warn("⚠️ SDK ready timeout (desktop browser) - continuing anyway");
          }
          
          const ethProvider = sdk?.wallet?.ethProvider;
          
          if (ethProvider) {
            console.log("✅ Farcaster wallet provider found!");
            // ✅ Pass BASE_NETWORK to skip network detection (prevents RPC timeout)
            const provider = new BrowserProvider(ethProvider, BASE_NETWORK);
            setEthersProvider(provider);
            
            // Get wallet address - try localStorage first, then eth_accounts
            try {
              // ✅ CRITICAL FIX: Multi-step address resolution
              // 1. Check localStorage (from previous session)
              // 2. Fall back to eth_accounts with retry
              console.log("🔍 Getting wallet address...");
              
              let address: string | null = null;
              
              // Try localStorage first (fastest, most reliable)
              const savedWalletStr = localStorage.getItem("basedmem_wallet");
              if (savedWalletStr) {
                try {
                  const { address: cachedAddress } = JSON.parse(savedWalletStr);
                  if (cachedAddress && typeof cachedAddress === 'string' && cachedAddress.startsWith('0x')) {
                    address = cachedAddress;
                    console.log("✅ Address restored from localStorage:", address);
                  }
                } catch (parseError) {
                  console.warn("⚠️ Failed to parse cached wallet:", parseError);
                }
              }
              
              // If no cached address, try eth_requestAccounts (Farcaster SDK v2 requirement)
              if (!address) {
                console.log("🔄 No cached address, requesting via eth_requestAccounts...");
                const MAX_ATTEMPTS = 3;
                const RETRY_DELAY = 500;
                
                for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                  try {
                    // ✅ CRITICAL FIX: Farcaster SDK v2 uses JSON-RPC format
                    const response = await Promise.race([
                      ethProvider.request({ method: "eth_requestAccounts" }),
                      new Promise<never>((_, reject) => 
                        setTimeout(() => reject(new Error("eth_requestAccounts timeout")), 5000)
                      )
                    ]);
                    
                    console.log(`🔍 Raw eth_requestAccounts response (attempt ${attempt}):`, response);
                    
                    // Handle both direct array and JSON-RPC wrapped response
                    let accounts: string[] | null = null;
                    
                    if (Array.isArray(response)) {
                      // Direct array response: ["0x..."]
                      accounts = response;
                    } else if (response && typeof response === 'object') {
                      // JSON-RPC wrapped: { result: ["0x..."] } or { jsonrpc: "2.0", result: [...] }
                      accounts = (response as any).result || (response as any).accounts || null;
                    }
                    
                    if (accounts && Array.isArray(accounts) && accounts.length > 0 && accounts[0].startsWith('0x')) {
                      address = accounts[0];
                      console.log(`✅ Address from eth_requestAccounts (attempt ${attempt}):`, address);
                      break;
                    } else {
                      console.warn(`⚠️ Invalid accounts response (attempt ${attempt}):`, accounts);
                    }
                  } catch (reqError) {
                    console.warn(`⚠️ eth_requestAccounts attempt ${attempt} failed:`, reqError);
                    if (attempt < MAX_ATTEMPTS) {
                      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                    }
                  }
                }
              }
              
              if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
                console.error("❌ Failed to get valid wallet address");
                throw new Error("No wallet address available");
              }
              
              console.log("✅ Farcaster wallet auto-connected:", address);
              
              setIsWalletConnected(true);
              setWalletAddress(address);
              
              // ✅ FARCASTER-SAFE: Fetch balance via backend API (more reliable)
              setTimeout(async () => {
                try {
                  console.log("💰 Auto-fetching balance for:", address);
                  const response = await fetch(`/api/token-balance?walletAddress=${address}&tokenAddress=ETH`);
                  if (response.ok) {
                    const data = await response.json();
                    const formatted = parseFloat(data.formattedBalance || "0").toFixed(4);
                    console.log("✅ Balance from API:", formatted, "ETH");
                    setWalletBalance(formatted);
                  } else {
                    // Fallback to provider
                    const balance = await provider.getBalance(address);
                    const balanceEth = formatEther(balance);
                    const formatted = parseFloat(balanceEth).toFixed(4);
                    console.log("✅ Balance from provider:", formatted, "ETH");
                    setWalletBalance(formatted);
                  }
                } catch (err) {
                  console.error("❌ Failed to fetch balance:", err);
                }
              }, 300);
              
              // Ensure user exists in database
              try {
                const userData = await ensureUserExists(address);
                setUser(userData);
                setIsUserReady(true);
                console.log("✅ User provisioned:", userData.id);
                
                // Save to localStorage for future visits
                localStorage.setItem("basedmem_wallet", JSON.stringify({ address }));
                localStorage.setItem("basedmem_user", JSON.stringify(userData));
              } catch (userError: any) {
                console.error("❌ User provisioning failed:", userError);
                // Don't block wallet connection if user provisioning fails
                setIsUserReady(false);
              }
            } catch (signerError) {
              console.error("❌ Failed to get Farcaster wallet address:", signerError);
            }
          } else {
            console.log("⚠️ Frame mode but no Farcaster wallet provider found");
          }
        }
      } catch (error) {
        console.error("❌ Frame auto-connect error:", error);
      }
    })();
    
    if (savedWallet) {
      const { address, walletType: savedWalletType } = JSON.parse(savedWallet);
      console.log("Restoring wallet:", address);
      setIsWalletConnected(true);
      setWalletAddress(address);
      if (savedWalletType) setWalletType(savedWalletType);
      // Restore SIWA verification
      const siwaKey = `basedmem_siwa_${address.toLowerCase()}`;
      if (localStorage.getItem(siwaKey) === "verified") {
        setIsSiwaVerified(true);
      }
      
      // Restore user from localStorage and validate
      if (savedUser) {
        (async () => {
          try {
            const cachedUser: User = JSON.parse(savedUser);
            console.log("👤 Validating cached user:", cachedUser.id);
            
            // Validate user still exists in backend
            const response = await fetch(`/api/users?walletAddress=${address}`);
            if (response.ok) {
              const backendUser = await response.json();
              setUser(backendUser);
              setIsUserReady(true);
              console.log("✅ User rehydrated:", backendUser.id);
            } else {
              // User not found in backend, recreate
              console.log("📝 User not found in backend, recreating...");
              const newUser = await ensureUserExists(address);
              setUser(newUser);
              setIsUserReady(true);
              localStorage.setItem("basedmem_user", JSON.stringify(newUser));
            }
          } catch (error: any) {
            console.error("❌ User rehydration failed:", error);
            console.warn("⚠️ Unable to restore user session. Please reconnect your wallet.");
            // Clear invalid cache and reset wallet state
            localStorage.removeItem("basedmem_user");
            localStorage.removeItem("basedmem_wallet");
            setUser(null);
            setIsUserReady(false);
            setIsWalletConnected(false);
            setWalletAddress("");
            setWalletBalance("0.0000");
            setEthersProvider(null);
          }
        })();
      }
      
      // Re-initialize provider on mount
      (async () => {
        try {
          console.log("Initializing wallet provider...");
          
          // Try Farcaster provider first
          const sdk = getSDK();
          const ethProvider = sdk?.wallet?.ethProvider;
          
          if (ethProvider) {
            console.log("Using Farcaster provider for restore");
            // ✅ Pass BASE_NETWORK to skip network detection (prevents RPC timeout)
            const provider = new BrowserProvider(ethProvider, BASE_NETWORK);
            selectedEip1193Provider.current = ethProvider as unknown as Eip1193Provider;
            setEthersProvider(provider);
            
            // ✅ FARCASTER-SAFE: Fetch balance via backend API
            setTimeout(async () => {
              try {
                console.log("💰 Restoring balance for:", address);
                const response = await fetch(`/api/token-balance?walletAddress=${address}&tokenAddress=ETH`);
                if (response.ok) {
                  const data = await response.json();
                  const formatted = parseFloat(data.formattedBalance || "0").toFixed(4);
                  console.log("✅ Balance from API:", formatted, "ETH");
                  setWalletBalance(formatted);
                } else {
                  const balance = await provider.getBalance(address);
                  const balanceEth = formatEther(balance);
                  const formatted = parseFloat(balanceEth).toFixed(4);
                  console.log("✅ Balance from provider:", formatted, "ETH");
                  setWalletBalance(formatted);
                }
              } catch (err) {
                console.error("❌ Failed to fetch balance:", err);
              }
            }, 300);
          } else if (typeof window !== 'undefined' && (window as any).ethereum) {
            // Fallback to MetaMask in browser mode
            console.log("Using browser wallet provider for restore");
            const browserProvider = (window as any).ethereum;
            // ✅ Pass BASE_NETWORK to skip network detection (prevents RPC timeout)
            const provider = new BrowserProvider(browserProvider, BASE_NETWORK);
            selectedEip1193Provider.current = browserProvider;
            setEthersProvider(provider);
            
            // ✅ FARCASTER-SAFE: Fetch balance via backend API
            setTimeout(async () => {
              try {
                console.log("💰 Restoring balance for:", address);
                const response = await fetch(`/api/token-balance?walletAddress=${address}&tokenAddress=ETH`);
                if (response.ok) {
                  const data = await response.json();
                  const formatted = parseFloat(data.formattedBalance || "0").toFixed(4);
                  console.log("✅ Balance from API:", formatted, "ETH");
                  setWalletBalance(formatted);
                } else {
                  const balance = await provider.getBalance(address);
                  const balanceEth = formatEther(balance);
                  const formatted = parseFloat(balanceEth).toFixed(4);
                  console.log("✅ Balance from provider:", formatted, "ETH");
                  setWalletBalance(formatted);
                }
              } catch (err) {
                console.error("❌ Failed to fetch balance:", err);
              }
            }, 300);
          } else {
            console.warn("No wallet provider available");
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

  // Auto-refresh balance when provider or address changes
  useEffect(() => {
    if (ethersProvider && walletAddress) {
      console.log("🔄 Auto-refreshing balance - Provider:", !!ethersProvider, "Address:", walletAddress);
      refreshBalance();
    } else {
      console.log("⚠️ Cannot refresh balance - Provider:", !!ethersProvider, "Address:", walletAddress);
    }
  }, [ethersProvider, walletAddress, refreshBalance]);
  
  // Sync Farcaster FID to database when user is ready and FID is available
  useEffect(() => {
    const syncFarcasterToDatabase = async () => {
      // Only sync if user exists and has no FID in database but we have FID in state
      if (user?.id && farcasterFid && !user.farcasterFid) {
        try {
          console.log("💾 Syncing Farcaster FID to database:", farcasterFid);
          const response = await fetch(`/api/users/${user.id}/farcaster`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              farcasterUsername: farcasterUsername || "farcaster_user", 
              farcasterFid: parseInt(farcasterFid, 10) 
            }),
          });
          
          if (response.ok) {
            const updatedUser = await response.json();
            setUser(updatedUser);
            localStorage.setItem("basedmem_user", JSON.stringify(updatedUser));
            console.log("✅ Farcaster FID synced to database");
          }
        } catch (error) {
          console.error("❌ Error syncing Farcaster FID:", error);
        }
      }
    };
    
    syncFarcasterToDatabase();
  }, [user?.id, farcasterFid, farcasterUsername, user?.farcasterFid]);

  const connectWallet = useCallback(async (providerUuid?: string) => {
    try {
      // ✅ CRITICAL FIX: Check if we're ACTUALLY in Farcaster Frame (not just SDK present)
      // ✅ BASE APP FIX: ensure sdk.isInMiniApp() has been consulted (detects Base app)
      await ensureMiniAppDetection();
      const inFrame = isInFarcasterFrame();
      console.log("🔍 isInFarcasterFrame:", inFrame);
      
      // Only use Farcaster wallet if we're ACTUALLY in a Frame environment
      if (inFrame && !providerUuid) {
        const sdk = getSDK();
        console.log("🔍 SDK object:", !!sdk);
        console.log("🔍 SDK wallet:", !!sdk?.wallet);
        console.log("🔍 SDK wallet.ethProvider:", !!sdk?.wallet?.ethProvider);
        
        const ethProvider = sdk?.wallet?.ethProvider;
        
        // Only use Farcaster wallet if provider is properly initialized
        if (ethProvider && typeof ethProvider.request === 'function') {
          try {
            console.log("✅ Farcaster wallet provider found! Attempting connection...");
            // ✅ Pass BASE_NETWORK to skip network detection (prevents RPC timeout)
            const provider = new BrowserProvider(ethProvider, BASE_NETWORK);
            selectedEip1193Provider.current = ethProvider as unknown as Eip1193Provider;
            setEthersProvider(provider);
            
            const accounts = await ethProvider.request({ method: "eth_requestAccounts" });
            if (accounts && accounts.length > 0) {
              const address = accounts[0];
              console.log("✅ Connected to Farcaster wallet:", address);
              
              await switchAndAssertBase(ethProvider as unknown as Eip1193Provider);
              
              setIsWalletConnected(true);
              setWalletAddress(address);
              localStorage.setItem("basedmem_wallet", JSON.stringify({ address }));
              await refreshBalance(address);
              
              // Ensure user exists in database
              try {
                const userData = await ensureUserExists(address);
                setUser(userData);
                setIsUserReady(true);
                localStorage.setItem("basedmem_user", JSON.stringify(userData));
              } catch (userError: any) {
                // User provisioning failed - rollback wallet connection
                console.error("❌ User provisioning failed, rolling back wallet connection");
                setIsWalletConnected(false);
                setWalletAddress("");
                setWalletBalance("0.0000");
                setUser(null);
                setIsUserReady(false);
                setEthersProvider(null);
                localStorage.removeItem("basedmem_wallet");
                throw new Error(`Wallet connected but user creation failed: ${userError.message}. Please try again.`);
              }
              
              return;
            }
          } catch (farcasterError) {
            console.log("Farcaster wallet not available, trying browser wallet...");
          }
        }
      } else {
        console.log("📱 Not in Farcaster Frame - using browser wallet directly");
      }
      
      // Use MetaMask/window.ethereum (Browser mode or Frame fallback)
      if (!providerUuid && injectedWallets.length > 1) {
        throw new Error("Multiple EVM wallets were found. Choose the wallet you want from the Connect Wallet menu.");
      }
      const selectedWallet = providerUuid
        ? injectedWallets.find(wallet => wallet.uuid === providerUuid)
        : injectedWallets.length === 1 ? injectedWallets[0] : undefined;
      if (providerUuid && !selectedWallet) {
        throw new Error("The selected wallet is no longer available. Reopen the wallet list.");
      }
      const browserProvider = selectedWallet?.provider ?? (window as any).ethereum;
      if (typeof window !== 'undefined' && browserProvider) {
        console.log("Using selected browser wallet:", selectedWallet?.name || "legacy injected wallet");
        // ✅ Pass BASE_NETWORK to skip network detection (prevents RPC timeout)
        const provider = new BrowserProvider(browserProvider, BASE_NETWORK);
        selectedEip1193Provider.current = browserProvider;
        setEthersProvider(provider);
        
        const accounts = await browserProvider.request({ method: "eth_requestAccounts" });
        if (accounts && accounts.length > 0) {
          const address = accounts[0];
          console.log("✅ Connected to browser wallet:", address);
          
          await switchAndAssertBase(browserProvider);
          
          setIsWalletConnected(true);
          setWalletAddress(address);
          setWalletType("browser");
          localStorage.setItem("basedmem_wallet", JSON.stringify({
            address,
            walletType: "browser",
            providerUuid: selectedWallet?.uuid,
          }));
          await refreshBalance(address);
          
          // Ensure user exists in database
          try {
            const userData = await ensureUserExists(address);
            setUser(userData);
            setIsUserReady(true);
            localStorage.setItem("basedmem_user", JSON.stringify(userData));
          } catch (userError: any) {
            // User provisioning failed - rollback wallet connection
            console.error("❌ User provisioning failed, rolling back wallet connection");
            setIsWalletConnected(false);
            setWalletAddress("");
            setWalletBalance("0.0000");
            setUser(null);
            setIsUserReady(false);
            setEthersProvider(null);
            localStorage.removeItem("basedmem_wallet");
            throw new Error(`Wallet connected but user creation failed: ${userError.message}. Please try again.`);
          }
          
          return;
        }
      }
      
      // No wallet available
      throw new Error("No wallet found. Please install MetaMask or open in Farcaster app.");
    } catch (error: any) {
      console.error("Wallet connection failed:", error);
      throw new Error(error.message || "Failed to connect wallet");
    }
  }, [refreshBalance, injectedWallets]);

  const connectSmartWallet = useCallback(async () => {
    try {
      console.log("🔵 Connecting Base Smart Wallet...");
      const { default: CoinbaseWalletSDK } = await import('@coinbase/wallet-sdk');
      const sdk = new CoinbaseWalletSDK({
        appName: 'BasedMem',
        appLogoUrl: 'https://basedmem.xyz/icon.png',
      });
      const cbProvider = sdk.makeWeb3Provider();
      const accounts = await cbProvider.request({ method: 'eth_requestAccounts' }) as string[];
      if (!accounts || accounts.length === 0) throw new Error("No accounts returned");
      const address = accounts[0];
      console.log("✅ Smart Wallet connected:", address);

      await switchAndAssertBase(cbProvider as unknown as Eip1193Provider);

      const provider = new BrowserProvider(cbProvider as any, BASE_NETWORK);
      selectedEip1193Provider.current = cbProvider as unknown as Eip1193Provider;
      setEthersProvider(provider);
      setIsWalletConnected(true);
      setWalletAddress(address);
      setWalletType('smart');
      localStorage.setItem("basedmem_wallet", JSON.stringify({ address, walletType: 'smart' }));
      await refreshBalance(address);

      const userData = await ensureUserExists(address);
      setUser(userData);
      setIsUserReady(true);
      localStorage.setItem("basedmem_user", JSON.stringify(userData));

      // Restore SIWA verification from localStorage
      const siwaKey = `basedmem_siwa_${address.toLowerCase()}`;
      if (localStorage.getItem(siwaKey) === "verified") {
        setIsSiwaVerified(true);
      }
    } catch (error: any) {
      console.error("Smart Wallet connection failed:", error);
      throw new Error(error.message || "Failed to connect Smart Wallet");
    }
  }, [refreshBalance]);

  const verifySiwa = useCallback(async (): Promise<boolean> => {
    if (!ethersProvider || !walletAddress) return false;
    try {
      const timestamp = new Date().toISOString();
      const message = [
        "Sign In With BasedMem",
        "",
        "Agent Hub — Agentic Identity Registry",
        `Address: ${walletAddress}`,
        `Timestamp: ${timestamp}`,
        "",
        "By signing this message you verify ownership of this address.",
        "This is a gasless, off-chain operation."
      ].join("\n");

      const signer = await ethersProvider.getSigner();
      const signature = await signer.signMessage(message);
      if (!signature) throw new Error("No signature returned");

      const siwaKey = `basedmem_siwa_${walletAddress.toLowerCase()}`;
      localStorage.setItem(siwaKey, "verified");
      localStorage.setItem(`${siwaKey}_ts`, timestamp);
      setIsSiwaVerified(true);
      console.log("✅ SIWA verified for:", walletAddress);
      return true;
    } catch (err: any) {
      console.error("SIWA verification failed:", err);
      return false;
    }
  }, [ethersProvider, walletAddress]);

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
      
      // Wait for confirmation (fast: 1 block ~2s on Base)
      await tx.wait(1);
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
    setUser(null);
    setIsUserReady(false);
    setEthersProvider(null);
    selectedEip1193Provider.current = null;
    localStorage.removeItem("basedmem_wallet");
    localStorage.removeItem("basedmem_user");
  }, []);

  const connectFarcaster = useCallback(async (username: string, fid: string) => {
    setIsFarcasterConnected(true);
    setFarcasterUsername(username);
    setFarcasterFid(fid);
    localStorage.setItem("basedmem_farcaster", JSON.stringify({ username, fid }));
    
    // Save Farcaster FID to database for notifications
    if (user?.id) {
      try {
        console.log("💾 Saving Farcaster FID to database:", fid);
        const response = await fetch(`/api/users/${user.id}/farcaster`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            farcasterUsername: username, 
            farcasterFid: parseInt(fid, 10) 
          }),
        });
        
        if (response.ok) {
          const updatedUser = await response.json();
          setUser(updatedUser);
          localStorage.setItem("basedmem_user", JSON.stringify(updatedUser));
          console.log("✅ Farcaster FID saved to database");
        } else {
          console.warn("⚠️ Failed to save Farcaster FID to database");
        }
      } catch (error) {
        console.error("❌ Error saving Farcaster FID:", error);
      }
    }
  }, [user]);

  const disconnectFarcaster = useCallback(() => {
    setIsFarcasterConnected(false);
    setFarcasterUsername("");
    setFarcasterFid("");
    localStorage.removeItem("basedmem_farcaster");
  }, []);

  const requireUser = useCallback((): User => {
    if (!user || !isUserReady) {
      throw new Error("User not authenticated. Please reconnect your wallet.");
    }
    return user;
  }, [user, isUserReady]);

  return (
    <WalletContext.Provider
      value={{
        isWalletConnected,
        walletAddress,
        walletBalance,
        walletType,
        isSiwaVerified,
        user,
        isUserReady,
        isFarcasterConnected,
        farcasterUsername,
        farcasterFid,
        injectedWallets,
        connectWallet,
        connectSmartWallet,
        verifySiwa,
        disconnectWallet,
        connectFarcaster,
        disconnectFarcaster,
        refreshBalance,
        sendETH,
        getProvider,
        ensureBaseChain,
        requireUser,
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
