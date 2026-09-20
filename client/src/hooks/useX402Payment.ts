import { wrapFetchWithPayment } from "x402-fetch";
import { useWallet } from "@/contexts/WalletContext";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import sdk from "@farcaster/frame-sdk";
import { ensureMiniAppDetection, isInFarcasterFrame } from "@/lib/farcasterInit";
import { createWalletClient, custom } from "viem";
import { baseSepolia, base } from "viem/chains";

interface X402PaymentOptions {
  url: string;
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

export function useX402Payment() {
  const wallet = useWallet();
  const { toast } = useToast();

  // Create payment-enabled fetch function
  const createPaymentFetch = async () => {
    try {
      // FIRST: Check if we have wallet address from WalletContext
      if (!wallet.walletAddress || !wallet.isWalletConnected) {
        console.error("❌ Wallet not connected in WalletContext");
        throw new Error("Please connect your wallet first");
      }

      const userAddress = wallet.walletAddress;
      console.log("📍 Using wallet address from context:", userAddress);

      let walletClient = null;
      let activeProvider = null;

      // ✅ BASE APP FIX: inside a Mini App host (Base app / Warpcast) the ONLY
      // working provider is the SDK's ethProvider. window.ethereum may be
      // missing or unresponsive there, which made payments silently return
      // with no wallet approval prompt. Detect the environment first and pick
      // the provider accordingly.
      const inMiniApp = (await ensureMiniAppDetection()) || isInFarcasterFrame();

      // sdk.actions.ready() can hang forever outside a mini app host —
      // always race it against a timeout so payment init fails fast instead.
      const readyWithTimeout = (ms: number) =>
        Promise.race([
          sdk.actions.ready(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("SDK ready timeout")), ms)),
        ]);

      if (inMiniApp && sdk) {
        // PRIORITY 1 (Mini App): Farcaster/Base app SDK provider
        try {
          try { await readyWithTimeout(3000); } catch { /* continue — provider may already be live */ }
          const ethProvider = await sdk.wallet.ethProvider;
          if (ethProvider) {
            activeProvider = ethProvider;
            console.log("✅ Using Mini App SDK provider (Base app / Warpcast)");
          }
        } catch (error) {
          console.log("⚠️ Mini App SDK provider not available:", error);
        }
      }

      // Browser (or SDK provider unavailable): use window.ethereum
      if (!activeProvider && typeof window !== 'undefined' && (window as any).ethereum) {
        activeProvider = (window as any).ethereum;
        console.log("✅ Using window.ethereum provider (browser wallet)");
      }

      // Last resort: try SDK provider even outside a detected Mini App
      if (!activeProvider && sdk) {
        try {
          try { await readyWithTimeout(3000); } catch { /* continue — provider may already be live */ }
          const ethProvider = await sdk.wallet.ethProvider;
          if (ethProvider) {
            activeProvider = ethProvider;
            console.log("✅ Using Farcaster SDK provider (fallback)");
          }
        } catch (error) {
          console.log("⚠️ Farcaster SDK not available:", error);
        }
      }

      if (!activeProvider) {
        throw new Error("No wallet provider available. Please install MetaMask or connect a wallet.");
      }

      // Get the active chain ID from the wallet
      let activeChainId: string;
      try {
        activeChainId = await activeProvider.request({ method: 'eth_chainId' });
        console.log("🔗 Wallet active chainId:", activeChainId, "=", parseInt(activeChainId, 16));
      } catch (error) {
        console.error("Failed to get chainId:", error);
        activeChainId = "0x2105"; // Default to Base Mainnet
      }

      // Map chainId to viem chain object
      const chainIdDecimal = parseInt(activeChainId, 16);
      const chain = chainIdDecimal === 84532 ? baseSepolia : base;
      console.log("🔗 Using chain:", chain.name, "(", chain.id, ")");

      // Create wallet client WITH account parameter (x402-fetch requirement)
      // Use the address from WalletContext instead of trying to fetch it
      walletClient = createWalletClient({
        chain,
        transport: custom(activeProvider),
        account: userAddress as `0x${string}`,
      });
      
      console.log("✅ Wallet client created with account:", userAddress);
      console.log("✅ Wallet client account.address:", walletClient.account?.address);

      if (!walletClient) {
        throw new Error("Please connect your wallet first to use Premium Launch");
      }

      // Wrap fetch with x402 payment handling
      const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient as any);
      
      return fetchWithPayment;
    } catch (error) {
      console.error("Error creating payment fetch:", error);
      throw error;
    }
  };

  // Payment mutation
  const paymentMutation = useMutation({
    mutationFn: async (options: X402PaymentOptions) => {
      const fetchWithPayment = await createPaymentFetch();

      // Get chain ID from wallet context
      let chainId = "8453"; // Default Base Mainnet
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        try {
          const hexChainId = await (window as any).ethereum.request({ method: 'eth_chainId' });
          chainId = parseInt(hexChainId, 16).toString();
        } catch (err) {
          console.warn("Failed to get chainId, using default:", err);
        }
      }

      const response = await fetchWithPayment(options.url, {
        method: options.method || "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Chain-Id": chainId, // Send chain ID to server
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        if (response.status === 402) {
          // Payment required
          const data = await response.json();
          throw new Error(data.error || "Payment required");
        }
        throw new Error(`Request failed: ${response.statusText}`);
      }

      return response.json();
    },
    onError: (error: Error) => {
      console.error("❌ Payment error:", error);
      
      // User rejected the payment
      if (error.message.includes("User rejected") || error.message.includes("user rejected")) {
        toast({
          title: "Payment Cancelled",
          description: "You cancelled the payment request",
          variant: "default",
        });
      } else if (error.message.includes("Payment required") || error.message.includes("402")) {
        toast({
          title: "Payment Required",
          description: "This premium feature requires USDC payment",
          variant: "destructive",
        });
      } else if (error.message.includes("Wallet not connected")) {
        toast({
          title: "Wallet Not Connected",
          description: "Please connect your wallet to use premium features",
          variant: "destructive",
        });
      } else if (error.message.includes("insufficient")) {
        toast({
          title: "Insufficient Balance",
          description: "You don't have enough USDC to complete this payment",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Payment Failed",
          description: error.message || "An unknown error occurred",
          variant: "destructive",
        });
      }
    },
  });

  return {
    fetchWithPayment: paymentMutation.mutateAsync,
    isPending: paymentMutation.isPending,
    isError: paymentMutation.isError,
    error: paymentMutation.error,
  };
}
