import { ethers } from 'ethers';

export const ZERO_X_EXCHANGE_PROXY = '0xDef1C0ded9bec7F1a1670819833240f027b25EfF';
export const WETH_BASE = '0x4200000000000000000000000000000000000006';
export const BASE_CHAIN_ID = 8453;
export const DEFAULT_ORDER_EXPIRY_MINUTES = 1440; // 24 hours

export interface ZeroXOrder {
  maker: string;
  taker: string;
  makerToken: string;
  takerToken: string;
  makerAmount: string;
  takerAmount: string;
  expiry: string;
  salt: string;
  chainId: string;
  verifyingContract: string;
  feeRecipient: string;
  sender: string;
  pool: string;
}

export interface ZeroXTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  types: {
    LimitOrder: Array<{ name: string; type: string }>;
  };
  order: ZeroXOrder;
}

export function generateSalt(): string {
  const randomBytes = ethers.randomBytes(32);
  return ethers.hexlify(randomBytes);
}

export function buildZeroXLimitOrder(params: {
  walletAddress: string;
  tokenAddress: string;
  orderType: 'buy' | 'sell';
  makerAmount: string;
  takerAmount: string;
  expiryMinutes?: number;
}): ZeroXTypedData {
  const { 
    walletAddress, 
    tokenAddress, 
    orderType, 
    makerAmount, 
    takerAmount, 
    expiryMinutes = DEFAULT_ORDER_EXPIRY_MINUTES 
  } = params;
  
  const salt = generateSalt();
  const expiry = Math.floor(Date.now() / 1000) + (expiryMinutes * 60);
  
  const makerToken = orderType === 'buy' ? WETH_BASE : tokenAddress;
  const takerToken = orderType === 'buy' ? tokenAddress : WETH_BASE;
  
  const order: ZeroXOrder = {
    maker: walletAddress,
    taker: '0x0000000000000000000000000000000000000000',
    makerToken,
    takerToken,
    makerAmount,
    takerAmount,
    expiry: expiry.toString(),
    salt,
    chainId: BASE_CHAIN_ID.toString(),
    verifyingContract: ZERO_X_EXCHANGE_PROXY,
    feeRecipient: '0x0000000000000000000000000000000000000000',
    sender: '0x0000000000000000000000000000000000000000',
    pool: '0x0000000000000000000000000000000000000000000000000000000000000000',
  };
  
  const domain = {
    name: '0x Protocol',
    version: '4',
    chainId: BASE_CHAIN_ID,
    verifyingContract: ZERO_X_EXCHANGE_PROXY,
  };
  
  const types = {
    LimitOrder: [
      { name: 'maker', type: 'address' },
      { name: 'taker', type: 'address' },
      { name: 'makerToken', type: 'address' },
      { name: 'takerToken', type: 'address' },
      { name: 'makerAmount', type: 'uint256' },
      { name: 'takerAmount', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'salt', type: 'uint256' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
      { name: 'feeRecipient', type: 'address' },
      { name: 'sender', type: 'address' },
      { name: 'pool', type: 'bytes32' },
    ],
  };
  
  return { domain, types, order };
}

export async function signZeroXOrder(
  order: ZeroXOrder,
  domain: any,
  types: any,
  signer: ethers.Signer
): Promise<string> {
  const signature = await signer.signTypedData(domain, types, order);
  return signature;
}

export function computeOrderHash(order: ZeroXOrder, domain: any): string {
  const typeHash = ethers.keccak256(
    ethers.toUtf8Bytes(
      'LimitOrder(address maker,address taker,address makerToken,address takerToken,uint256 makerAmount,uint256 takerAmount,uint256 expiry,uint256 salt,uint256 chainId,address verifyingContract,address feeRecipient,address sender,bytes32 pool)'
    )
  );
  
  const structHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'address', 'address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'address', 'address', 'bytes32'],
      [
        typeHash,
        order.maker,
        order.taker,
        order.makerToken,
        order.takerToken,
        order.makerAmount,
        order.takerAmount,
        order.expiry,
        order.salt,
        order.chainId,
        order.verifyingContract,
        order.feeRecipient,
        order.sender,
        order.pool,
      ]
    )
  );
  
  const domainSeparator = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        ethers.keccak256(ethers.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
        ethers.keccak256(ethers.toUtf8Bytes(domain.name)),
        ethers.keccak256(ethers.toUtf8Bytes(domain.version)),
        domain.chainId,
        domain.verifyingContract,
      ]
    )
  );
  
  return ethers.keccak256(
    ethers.solidityPacked(['string', 'bytes32', 'bytes32'], ['\x19\x01', domainSeparator, structHash])
  );
}

// ✅ Use direct RPC for read-only calls (works in Farcaster Frame)
const BASE_RPC = "https://mainnet.base.org";

export async function getTokenDecimals(
  tokenAddress: string,
  _provider?: ethers.Provider // Optional, not used - we use RPC directly
): Promise<number> {
  // ✅ Always use RPC provider for read-only calls (Farcaster wallet doesn't support reads)
  const rpcProvider = new ethers.JsonRpcProvider(BASE_RPC);
  const tokenContract = new ethers.Contract(
    tokenAddress,
    ['function decimals() view returns (uint8)'],
    rpcProvider
  );
  const decimals = await tokenContract.decimals();
  return Number(decimals);
}

export function formatOrderForSubmission(
  order: ZeroXOrder,
  signature: string,
  orderHash: string,
  userId: string,
  tokenSymbol: string,
  orderType: 'buy' | 'sell',
  targetPrice: string,
  ethAmount: string,
  tokenAmount: string,
  totalValue: string,
  tokenId?: string | null
) {
  const tokenAddress = orderType === 'buy' ? order.takerToken : order.makerToken;
  
  const orderForJson = {
    maker: order.maker,
    taker: order.taker,
    makerToken: order.makerToken,
    takerToken: order.takerToken,
    makerAmount: String(order.makerAmount),
    takerAmount: String(order.takerAmount),
    expiry: String(order.expiry),
    salt: String(order.salt),
    chainId: String(order.chainId),
    verifyingContract: order.verifyingContract,
    feeRecipient: order.feeRecipient,
    sender: order.sender,
    pool: order.pool,
  };
  
  return {
    userId,
    tokenId,
    tokenAddress,
    tokenSymbol,
    orderType,
    targetPrice,
    ethAmount,
    tokenAmount,
    totalValue,
    signature,
    salt: String(order.salt),
    orderHash,
    makerAmount: String(order.makerAmount),
    takerAmount: String(order.takerAmount),
    makerToken: order.makerToken,
    takerToken: order.takerToken,
    expiry: parseInt(String(order.expiry)),
    orderJson: JSON.stringify(orderForJson),
  };
}
