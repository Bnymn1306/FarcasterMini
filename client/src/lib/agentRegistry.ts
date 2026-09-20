import { BrowserProvider, Contract, keccak256, toUtf8Bytes } from "ethers";

// Official ERC-8004 IdentityRegistry — Base Mainnet
export const AGENT_REGISTRY_ADDRESS = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
export const AGENT_REGISTRY_CHAIN   = 8453; // Base mainnet

// Minimal ABI for the official ERC-8004 IdentityRegistry (ERC-721 based)
export const AGENT_REGISTRY_ABI = [
  // Registration
  "function register(string agentURI) external returns (uint256 agentId)",
  "function register() external returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string newURI) external",
  "function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue) external",
  // Read (ERC-721)
  "function balanceOf(address owner) external view returns (uint256)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  // Agent-specific reads
  "function getAgentWallet(uint256 agentId) external view returns (address)",
  "function getMetadata(uint256 agentId, string metadataKey) external view returns (bytes)",
  // Transfer (for enumeration via events)
  "function transferFrom(address from, address to, uint256 tokenId) external",
  "function safeTransferFrom(address from, address to, uint256 tokenId) external",
  // Events
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event URIUpdated(uint256 indexed agentId, string newURI, address updatedBy)",
] as const;

export function getRegistryContract(provider: BrowserProvider) {
  return new Contract(AGENT_REGISTRY_ADDRESS, AGENT_REGISTRY_ABI, provider);
}

export async function getRegistryWithSigner(provider: BrowserProvider) {
  const signer = await provider.getSigner();
  return new Contract(AGENT_REGISTRY_ADDRESS, AGENT_REGISTRY_ABI, signer);
}

export function hashDescription(text: string): string {
  return keccak256(toUtf8Bytes(text));
}

/** Build an ERC-8004-compliant agentURI as a data: URI (fully on-chain) */
export function buildAgentURI(name: string, personality: string, bio: string): string {
  const registration = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name,
    description: bio || `${name} — AI agent on BasedMem. Personality: ${personality}`,
    image: "https://basedmem.xyz/icon.png",
    services: [
      {
        name: "web",
        endpoint: "https://basedmem.xyz",
      },
    ],
    x402Support: false,
    active: true,
    registrations: [],
  };
  const json = JSON.stringify(registration);
  return `data:application/json;base64,${btoa(unescape(encodeURIComponent(json)))}`;
}

/** Legacy alias — kept for old code that calls buildMetadataURI */
export const buildMetadataURI = buildAgentURI;

/** Parse the Registered event from a tx receipt, returns tokenId as string */
export function parseRegisteredEvent(receipt: any, iface: any): string | null {
  for (const log of receipt.logs ?? []) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "Registered") return String(parsed.args.agentId);
    } catch { /* skip */ }
  }
  // Fallback: parse Transfer from 0x0 (mint)
  for (const log of receipt.logs ?? []) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "Transfer" && parsed.args.from === "0x0000000000000000000000000000000000000000") {
        return String(parsed.args.tokenId);
      }
    } catch { /* skip */ }
  }
  return null;
}

/** Legacy alias */
export const parseAgentRegisteredEvent = parseRegisteredEvent;

export function parseServiceRequestEvent(receipt: any, iface: any): string | null {
  for (const log of receipt.logs ?? []) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "ServiceRequestCreated") return parsed.args.requestId as string;
    } catch { /* skip */ }
  }
  return null;
}

/** Whether an agentId represents a confirmed on-chain registration.
 *  Official registry uses uint256 sequential IDs (e.g. "46092").
 *  Old V1/V2 used bytes32 (0x + 64 hex chars). Both are accepted. */
export function isOnChainAgentId(id?: string | null): boolean {
  if (!id) return false;
  // Official ERC-8004: numeric string > 0
  if (/^\d+$/.test(id) && parseInt(id) > 0) return true;
  // Legacy V1/V2: 0x + 64 hex chars (bytes32)
  if (id.startsWith("0x") && id.length === 66) return true;
  return false;
}

/** Get 8004scan.io link for an agent */
export function get8004scanUrl(agentId: string): string {
  if (/^\d+$/.test(agentId)) {
    return `https://8004scan.io/agents/base/${agentId}`;
  }
  return `https://basescan.org/address/${AGENT_REGISTRY_ADDRESS}`;
}
