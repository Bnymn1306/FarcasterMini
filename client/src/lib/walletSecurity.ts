export interface RequestProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<any>;
}

export const BASE_CHAIN_ID = 8453;
export const BASE_RPC_URL = "https://mainnet.base.org";

export async function switchAndAssertBase(provider: RequestProvider) {
  const baseChainHex = `0x${BASE_CHAIN_ID.toString(16)}`;
  let chainId = await provider.request({ method: "eth_chainId" });
  if (Number(BigInt(chainId)) !== BASE_CHAIN_ID) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: baseChainHex }],
      });
    } catch (error: any) {
      if (error?.code !== 4902) throw error;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: baseChainHex,
          chainName: "Base",
          nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
          rpcUrls: [BASE_RPC_URL],
          blockExplorerUrls: ["https://basescan.org"],
        }],
      });
    }
    chainId = await provider.request({ method: "eth_chainId" });
  }
  if (Number(BigInt(chainId)) !== BASE_CHAIN_ID) {
    throw new Error("Base network is required. The wallet did not switch networks.");
  }
}

export function assertSelectedAccount(accounts: string[], selectedAddress: string) {
  if (!selectedAddress || !accounts.some(account => account.toLowerCase() === selectedAddress.toLowerCase())) {
    throw new Error("The selected wallet account changed. Reconnect it before continuing.");
  }
}

export function selectPersistedProvider<T extends { uuid: string }>(
  wallets: T[],
  savedProviderUuid?: string,
): T | undefined {
  if (savedProviderUuid) return wallets.find(wallet => wallet.uuid === savedProviderUuid);
  return wallets.length === 1 ? wallets[0] : undefined;
}