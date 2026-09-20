import { Connection, VersionedTransaction, PublicKey } from '@solana/web3.js';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

interface OrderInfo {
  publicKey: string;
  account: {
    maker: string;
    inputMint: string;
    outputMint: string;
    makingAmount: string;
    takingAmount: string;
    expiredAt: string | null;
    uniqueId: string;
    oriMakingAmount: string;
    oriTakingAmount: string;
    borrowMakingAmount: string;
    createdAt: string;
    updatedAt: string;
  };
}

interface JupiterLimitOrderService {
  createOrder(params: {
    maker: string;
    inputMint: string;
    outputMint: string;
    makingAmount: string;
    takingAmount: string;
    expiredAt?: number;
  }): Promise<{ transaction: string; order: string } | null>;
  
  cancelOrder(maker: string, orderPubkey?: string): Promise<string[] | null>;
  
  getOpenOrders(wallet: string): Promise<OrderInfo[]>;
  
  getOrderHistory(wallet: string): Promise<any[]>;
}

class JupiterLimitOrder implements JupiterLimitOrderService {
  private connection: Connection;
  private baseUrl = 'https://api.jup.ag/trigger/v1';
  private apiKey: string | undefined;

  constructor() {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.apiKey = process.env.JUPITER_API_KEY;
    
    if (!this.apiKey) {
      console.warn('⚠️ JUPITER_API_KEY not set - limit orders may not work');
    } else {
      console.log('✅ Jupiter API key configured');
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }
    return headers;
  }

  async createOrder(params: {
    maker: string;
    inputMint: string;
    outputMint: string;
    makingAmount: string;
    takingAmount: string;
    expiredAt?: number;
  }): Promise<{ transaction: string; order: string } | null> {
    try {
      console.log('📝 Creating Jupiter limit order (Trigger API v1)...');
      console.log('   Maker:', params.maker);
      console.log('   Input:', params.inputMint, params.makingAmount);
      console.log('   Output:', params.outputMint, params.takingAmount);

      const requestBody = {
        maker: params.maker,
        payer: params.maker,
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        params: {
          makingAmount: params.makingAmount,
          takingAmount: params.takingAmount,
          ...(params.expiredAt && { expiredAt: params.expiredAt.toString() }),
        },
        computeUnitPrice: 'auto',
        wrapAndUnwrapSol: true,
      };

      console.log('📤 Request body:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${this.baseUrl}/createOrder`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      console.log('📥 Response status:', response.status);
      console.log('📥 Response:', responseText.slice(0, 500));

      if (!response.ok) {
        console.error('❌ Jupiter createOrder failed:', response.status, responseText);
        return null;
      }

      const data = JSON.parse(responseText);
      console.log('✅ Jupiter order created, tx length:', data.transaction?.length || 0);
      
      return {
        transaction: data.transaction,
        order: data.order || data.requestId || 'unknown',
      };
    } catch (error) {
      console.error('❌ Error creating Jupiter limit order:', error);
      return null;
    }
  }

  async cancelOrder(maker: string, orderPubkey?: string): Promise<string[] | null> {
    try {
      console.log('🚫 Cancelling Jupiter limit order (Trigger API v1)...');
      console.log('   Maker:', maker);
      if (orderPubkey) console.log('   Order:', orderPubkey);

      const body: any = {
        maker,
        computeUnitPrice: 'auto',
      };

      if (orderPubkey) {
        body.orders = [orderPubkey];
      }

      const response = await fetch(`${this.baseUrl}/cancelOrders`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Jupiter cancelOrders failed:', response.status, errorText);
        return null;
      }

      const data = await response.json();
      console.log('✅ Cancel transactions generated:', data.transactions?.length || 0);
      
      return data.transactions || [];
    } catch (error) {
      console.error('❌ Error cancelling Jupiter limit order:', error);
      return null;
    }
  }

  async getOpenOrders(wallet: string): Promise<OrderInfo[]> {
    try {
      console.log('📋 Fetching Jupiter open orders for:', wallet);
      
      const response = await fetch(`${this.baseUrl}/getTriggerOrders?user=${wallet}`, {
        headers: this.getHeaders(),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Jupiter getTriggerOrders failed:', response.status, errorText);
        return [];
      }

      const data = await response.json();
      const orders = data.orders || [];
      console.log(`📋 Found ${orders.length} open Jupiter orders for ${wallet.slice(0, 8)}...`);
      
      return orders;
    } catch (error) {
      console.error('❌ Error fetching Jupiter open orders:', error);
      return [];
    }
  }

  async getOrderHistory(wallet: string): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/orderHistory?wallet=${wallet}`, {
        headers: this.getHeaders(),
      });
      
      if (!response.ok) {
        console.error('❌ Jupiter orderHistory failed:', response.status);
        return [];
      }

      const history = await response.json();
      return history;
    } catch (error) {
      console.error('❌ Error fetching Jupiter order history:', error);
      return [];
    }
  }

  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: string
  ): Promise<{ outAmount: string; priceImpact: number } | null> {
    try {
      const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`;
      const response = await fetch(quoteUrl);
      
      if (!response.ok) {
        console.error('❌ Failed to get quote');
        return null;
      }

      const quote = await response.json();
      return {
        outAmount: quote.outAmount,
        priceImpact: quote.priceImpactPct || 0,
      };
    } catch (error) {
      console.error('❌ Error getting quote:', error);
      return null;
    }
  }

  getConnection(): Connection {
    return this.connection;
  }
}

export const jupiterLimitOrderService = new JupiterLimitOrder();
export { JupiterLimitOrder, OrderInfo };
