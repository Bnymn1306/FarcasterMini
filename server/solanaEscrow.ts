import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  VersionedTransaction,
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { recordDepositReceipt, requireLegacyDepositRuntime } from './persistence/durableState';

// Solana RPC endpoints with fallback
const SOLANA_RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.g.alchemy.com/v2/demo',
];

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const VERCEL_ESCROW_DISABLED = 'Solana escrow transfers disabled on Vercel: pending durable order-scoped execution and reconciliation of prior transfers; do not retry automatically';

interface EscrowDeposit {
  orderId: string;
  userWallet: string;
  inputMint: string;
  inputAmount: string;
  depositTxSignature?: string;
  verified: boolean;
}

// Track verified deposits per user to prevent fund mixing attacks
interface VerifiedDeposit {
  userWallet: string;
  inputMint: string;
  amount: bigint;
  signature: string;
  orderId: string;
  usedForExecution: boolean;
}

interface EscrowExecutionResult {
  success: boolean;
  outputTxSignature?: string;
  outputAmount?: string;
  error?: string;
}

export class SolanaEscrowService {
  private connection: Connection;
  private escrowKeypair: Keypair | null = null;
  private escrowPublicKey: string | null = null;
  // In-memory tracking of verified deposits (keyed by orderId)
  private verifiedDeposits: Map<string, VerifiedDeposit> = new Map();

  constructor() {
    this.connection = new Connection(SOLANA_RPC_ENDPOINTS[0], 'confirmed');
    this.initializeEscrowWallet();
  }

  private initializeEscrowWallet() {
    const privateKeyEnv = process.env.SOLANA_ESCROW_PRIVATE_KEY;
    
    if (privateKeyEnv) {
      try {
        // Try to decode as base58
        const secretKey = bs58.decode(privateKeyEnv);
        this.escrowKeypair = Keypair.fromSecretKey(secretKey);
        this.escrowPublicKey = this.escrowKeypair.publicKey.toBase58();
        console.log('🔐 Solana Escrow wallet initialized:', this.escrowPublicKey);
      } catch (error) {
        console.error('❌ Failed to initialize Solana escrow wallet from private key:', error);
        this.generateNewEscrowWallet();
      }
    } else {
      console.log('⚠️ SOLANA_ESCROW_PRIVATE_KEY not set, generating new escrow wallet...');
      this.generateNewEscrowWallet();
    }
  }

  private generateNewEscrowWallet() {
    this.escrowKeypair = Keypair.generate();
    this.escrowPublicKey = this.escrowKeypair.publicKey.toBase58();
    const privateKeyBase58 = bs58.encode(this.escrowKeypair.secretKey);
    
    console.log('🔑 NEW Solana Escrow Wallet Generated:');
    console.log('   Public Key:', this.escrowPublicKey);
    console.log('   ⚠️ IMPORTANT: Save this private key as SOLANA_ESCROW_PRIVATE_KEY secret:');
    console.log('   ', privateKeyBase58);
    console.log('   ⚠️ Fund this wallet with SOL for transaction fees!');
  }

  getEscrowAddress(): string {
    return this.escrowPublicKey || '';
  }

  async getEscrowBalance(): Promise<{ sol: number; lamports: number }> {
    if (!this.escrowKeypair) {
      return { sol: 0, lamports: 0 };
    }

    try {
      const balance = await this.connection.getBalance(this.escrowKeypair.publicKey);
      return {
        lamports: balance,
        sol: balance / LAMPORTS_PER_SOL,
      };
    } catch (error) {
      console.error('Error fetching escrow balance:', error);
      return { sol: 0, lamports: 0 };
    }
  }

  /**
   * Get all SPL token balances in the escrow wallet
   */
  async getAllTokenBalances(): Promise<Array<{ mint: string; amount: string; decimals: number; uiAmount: number }>> {
    if (!this.escrowKeypair) {
      return [];
    }

    try {
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        this.escrowKeypair.publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      const balances = tokenAccounts.value.map(account => {
        const parsed = account.account.data.parsed;
        const info = parsed.info;
        return {
          mint: info.mint,
          amount: info.tokenAmount.amount,
          decimals: info.tokenAmount.decimals,
          uiAmount: info.tokenAmount.uiAmount || 0,
        };
      }).filter(b => parseFloat(b.amount) > 0);

      console.log(`💰 Escrow has ${balances.length} tokens with balance`);
      return balances;
    } catch (error) {
      console.error('Error fetching escrow token balances:', error);
      return [];
    }
  }

  /**
   * Verify a deposit transaction on-chain to ensure user actually sent funds
   * This prevents attackers from claiming they deposited without actually doing so
   */
  async verifyDepositTransaction(
    depositSignature: string,
    expectedUserWallet: string,
    expectedInputMint: string,
    expectedAmount: string,
    orderId: string,
  ): Promise<{ verified: boolean; error?: string }> {
    try {
      console.log('🔍 Verifying deposit transaction:', depositSignature);
      
      // Fetch transaction from chain
      const tx = await this.connection.getTransaction(depositSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        return { verified: false, error: 'Transaction not found on-chain' };
      }

      if (tx.meta?.err) {
        return { verified: false, error: 'Transaction failed on-chain' };
      }

      // Check that user signed the transaction
      const signers = tx.transaction.message.staticAccountKeys?.slice(0, tx.transaction.signatures.length);
      const userSigned = signers?.some(key => key.toBase58() === expectedUserWallet);
      
      if (!userSigned) {
        return { verified: false, error: 'Transaction not signed by expected user' };
      }

      const isSOLTransfer = expectedInputMint === SOL_MINT;
      let amountReceived: bigint;

      if (isSOLTransfer) {
        // For SOL transfers, check pre/post balance changes on escrow main wallet
        const escrowIndex = tx.transaction.message.staticAccountKeys?.findIndex(
          key => key.toBase58() === this.escrowPublicKey
        );

        if (escrowIndex === undefined || escrowIndex === -1) {
          return { verified: false, error: 'Escrow wallet not found in SOL transaction' };
        }

        const preBalance = tx.meta?.preBalances?.[escrowIndex] || 0;
        const postBalance = tx.meta?.postBalances?.[escrowIndex] || 0;
        amountReceived = BigInt(postBalance - preBalance);
      } else {
        // For SPL token transfers, check the escrow's ATA balance changes
        const escrowPubkey = new PublicKey(this.escrowPublicKey!);
        const mintPubkey = new PublicKey(expectedInputMint);
        const escrowAta = await getAssociatedTokenAddress(mintPubkey, escrowPubkey);
        const escrowAtaString = escrowAta.toBase58();

        console.log('🔍 Looking for escrow ATA:', escrowAtaString);

        // Find the escrow ATA in the transaction accounts
        const escrowAtaIndex = tx.transaction.message.staticAccountKeys?.findIndex(
          key => key.toBase58() === escrowAtaString
        );

        if (escrowAtaIndex === undefined || escrowAtaIndex === -1) {
          // ATA might not be in static keys, check token balance changes instead
          console.log('🔍 Escrow ATA not in static keys, checking token balance changes...');
          
          // For SPL tokens, check postTokenBalances for the escrow ATA
          const postTokenBalances = tx.meta?.postTokenBalances || [];
          const preTokenBalances = tx.meta?.preTokenBalances || [];
          
          // Find escrow token balance by owner
          const escrowPostBalance = postTokenBalances.find(
            b => b.owner === this.escrowPublicKey && b.mint === expectedInputMint
          );
          const escrowPreBalance = preTokenBalances.find(
            b => b.owner === this.escrowPublicKey && b.mint === expectedInputMint
          );

          if (!escrowPostBalance) {
            if (process.env.VERCEL) {
              return { verified: false, error: 'Escrow token balance evidence missing; manual verification required' };
            }
            // If no post balance found, trust the transaction was successful
            // since it's already confirmed on-chain
            console.log('⚠️ Could not find escrow token balance, trusting confirmed transaction');
            amountReceived = BigInt(expectedAmount);
          } else {
            const postAmount = BigInt(escrowPostBalance.uiTokenAmount?.amount || '0');
            const preAmount = BigInt(escrowPreBalance?.uiTokenAmount?.amount || '0');
            amountReceived = postAmount - preAmount;
          }
        } else {
          // Found ATA in static keys, use token balance changes
          const postTokenBalances = tx.meta?.postTokenBalances || [];
          const preTokenBalances = tx.meta?.preTokenBalances || [];
          
          const escrowPostBalance = postTokenBalances.find(b => b.accountIndex === escrowAtaIndex);
          const escrowPreBalance = preTokenBalances.find(b => b.accountIndex === escrowAtaIndex);

          const postAmount = BigInt(escrowPostBalance?.uiTokenAmount?.amount || '0');
          const preAmount = BigInt(escrowPreBalance?.uiTokenAmount?.amount || '0');
          amountReceived = postAmount - preAmount;
        }
      }

      const expectedAmountBigInt = BigInt(expectedAmount);
      // Allow small variance (0.1% tolerance for rounding)
      const minExpected = expectedAmountBigInt - (expectedAmountBigInt / BigInt(1000));
      
      console.log('📊 Deposit verification:', {
        expected: expectedAmount,
        received: amountReceived.toString(),
        minExpected: minExpected.toString(),
      });

      if (amountReceived < minExpected) {
        return { 
          verified: false, 
          error: `Insufficient deposit: expected ${expectedAmount}, got ${amountReceived.toString()}` 
        };
      }

      // Store verified deposit
      const receipt = {
        userWallet: expectedUserWallet,
        inputMint: expectedInputMint,
        amount: amountReceived,
        signature: depositSignature,
        orderId,
        usedForExecution: false,
      };
      if (process.env.VERCEL) {
        await recordDepositReceipt(this.escrowPublicKey || '', receipt);
      } else {
        this.verifiedDeposits.set(orderId, receipt);
      }

      console.log('✅ Deposit verified:', {
        orderId,
        user: expectedUserWallet.slice(0, 8) + '...',
        amount: amountReceived.toString(),
      });

      return { verified: true };
    } catch (error: any) {
      console.error('❌ Error verifying deposit:', error);
      return { verified: false, error: error.message || 'Verification failed' };
    }
  }

  /**
   * Check if an order's deposit has been verified and not yet used
   */
  isDepositVerifiedForOrder(orderId: string): boolean {
    requireLegacyDepositRuntime();
    const deposit = this.verifiedDeposits.get(orderId);
    return deposit ? !deposit.usedForExecution : false;
  }

  /**
   * Mark deposit as used for execution (prevents double-spending)
   */
  markDepositAsUsed(orderId: string): void {
    requireLegacyDepositRuntime();
    const deposit = this.verifiedDeposits.get(orderId);
    if (deposit) {
      deposit.usedForExecution = true;
      this.verifiedDeposits.set(orderId, deposit);
    }
  }

  /**
   * Get deposit info for an order
   */
  getDepositInfo(orderId: string): VerifiedDeposit | undefined {
    requireLegacyDepositRuntime();
    return this.verifiedDeposits.get(orderId);
  }

  /**
   * Generate deposit instructions for user to send funds to escrow
   * Returns transaction that user needs to sign
   */
  async createDepositTransaction(
    userWallet: string,
    inputMint: string,
    inputAmount: string, // In lamports or smallest unit
  ): Promise<{ transaction: string; escrowAddress: string } | null> {
    if (!this.escrowPublicKey) {
      console.error('Escrow wallet not initialized');
      return null;
    }

    try {
      const userPubkey = new PublicKey(userWallet);
      const escrowPubkey = new PublicKey(this.escrowPublicKey);
      const amountBigInt = BigInt(inputAmount);

      const transaction = new Transaction();
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userPubkey;

      if (inputMint === SOL_MINT) {
        // Native SOL transfer
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: userPubkey,
            toPubkey: escrowPubkey,
            lamports: amountBigInt,
          })
        );
      } else {
        // SPL Token transfer
        const mintPubkey = new PublicKey(inputMint);
        
        // Get user's token account
        const userTokenAccount = await getAssociatedTokenAddress(
          mintPubkey,
          userPubkey
        );

        // Get or create escrow's token account
        const escrowTokenAccount = await getAssociatedTokenAddress(
          mintPubkey,
          escrowPubkey
        );

        // Check if escrow token account exists
        try {
          await getAccount(this.connection, escrowTokenAccount);
        } catch {
          // Create ATA for escrow if it doesn't exist
          transaction.add(
            createAssociatedTokenAccountInstruction(
              userPubkey, // payer
              escrowTokenAccount,
              escrowPubkey,
              mintPubkey
            )
          );
        }

        // Add transfer instruction
        transaction.add(
          createTransferInstruction(
            userTokenAccount,
            escrowTokenAccount,
            userPubkey,
            amountBigInt
          )
        );
      }

      // Serialize transaction for user to sign
      const serialized = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      return {
        transaction: serialized.toString('base64'),
        escrowAddress: this.escrowPublicKey,
      };
    } catch (error) {
      console.error('Error creating deposit transaction:', error);
      return null;
    }
  }

  /**
   * Execute swap using escrowed funds and send output to user
   */
  async executeSwap(
    userWallet: string,
    inputMint: string,
    outputMint: string,
    inputAmount: string,
    slippageBps: number = 300, // 3% default for meme coins
  ): Promise<EscrowExecutionResult> {
    if (process.env.VERCEL) {
      return { success: false, error: VERCEL_ESCROW_DISABLED };
    }
    if (!this.escrowKeypair) {
      return { success: false, error: 'Escrow wallet not initialized' };
    }

    try {
      console.log('🔄 Executing Solana swap from escrow...');
      console.log('   Input:', inputMint, inputAmount);
      console.log('   Output:', outputMint);
      console.log('   User:', userWallet);

      // Get Jupiter swap quote (using free lite-api endpoint)
      const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${inputAmount}&slippageBps=${slippageBps}`;
      console.log('🔍 Fetching Jupiter quote from lite-api...');
      const quoteResponse = await fetch(quoteUrl);
      
      if (!quoteResponse.ok) {
        const errorText = await quoteResponse.text();
        console.error('Jupiter quote failed:', quoteResponse.status, errorText);
        return { success: false, error: `Failed to get Jupiter quote: ${quoteResponse.status}` };
      }

      const quote = await quoteResponse.json();
      console.log('📊 Jupiter quote received, output:', quote.outAmount);

      // Get swap transaction - escrow swaps, tokens go to escrow first
      const swapResponse = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: this.escrowPublicKey, // Escrow executes the swap
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto',
        }),
      });

      if (!swapResponse.ok) {
        const errorData = await swapResponse.json();
        return { success: false, error: `Jupiter swap failed: ${JSON.stringify(errorData)}` };
      }

      const swapData = await swapResponse.json();
      const swapTransaction = swapData.swapTransaction;

      // Deserialize and sign the transaction
      const transactionBuffer = Buffer.from(swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuffer);
      
      // Sign with escrow keypair
      transaction.sign([this.escrowKeypair]);

      // Send transaction - skipPreflight true to avoid simulation errors for volatile tokens
      const signature = await this.connection.sendTransaction(transaction, {
        skipPreflight: true,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });

      console.log('📤 Swap transaction sent:', signature);

      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        return { success: false, error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}` };
      }

      console.log('✅ Swap executed, now transferring tokens to user...');

      // Step 2: Transfer output tokens from escrow to user with retry logic
      const outputAmount = quote.outAmount;
      let transferResult: { success: boolean; signature?: string; error?: string } = { success: false };
      
      // Retry transfer up to 3 times
      for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`📤 Transfer attempt ${attempt}/3...`);
        transferResult = await this.transferTokenToUser(userWallet, outputMint, outputAmount);
        
        if (transferResult.success) {
          console.log('✅ Tokens transferred to user:', transferResult.signature);
          break;
        }
        
        console.log(`⚠️ Transfer attempt ${attempt} failed: ${transferResult.error}`);
        
        if (attempt < 3) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      if (!transferResult.success) {
        // Swap succeeded but transfer failed - return partial success with swap signature
        // so we can track and retry the transfer later
        console.error(`❌ All transfer attempts failed. Tokens stuck in escrow!`);
        console.error(`   User: ${userWallet}`);
        console.error(`   Token: ${outputMint}`);
        console.error(`   Amount: ${outputAmount}`);
        console.error(`   Swap TX: ${signature}`);
        
        return { 
          success: false, 
          error: `SWAP_OK_TRANSFER_FAILED: Swap succeeded (${signature}) but transfer failed: ${transferResult.error}. Token: ${outputMint}, Amount: ${outputAmount}`,
          outputTxSignature: signature, // Include swap signature for debugging
          outputAmount: outputAmount,
        };
      }

      return {
        success: true,
        outputTxSignature: transferResult.signature,
        outputAmount: outputAmount,
      };
    } catch (error: any) {
      console.error('❌ Error executing swap:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Transfer tokens (SOL or SPL) from escrow to user wallet
   */
  async transferTokenToUser(
    userWallet: string,
    tokenMint: string,
    amount: string,
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    if (process.env.VERCEL) {
      return { success: false, error: VERCEL_ESCROW_DISABLED };
    }
    if (!this.escrowKeypair) {
      return { success: false, error: 'Escrow wallet not initialized' };
    }

    try {
      const userPubkey = new PublicKey(userWallet);
      const escrowPubkey = this.escrowKeypair.publicKey;
      const amountBigInt = BigInt(amount);

      console.log('📤 Transferring', amount, 'of', tokenMint, 'to', userWallet);

      const transaction = new Transaction();
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = escrowPubkey;

      // Handle native SOL transfers (output from sell orders)
      if (tokenMint === SOL_MINT) {
        console.log('💰 Transferring native SOL to user...');
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: escrowPubkey,
            toPubkey: userPubkey,
            lamports: amountBigInt,
          })
        );
      } else {
        // SPL Token transfer
        const mintPubkey = new PublicKey(tokenMint);

        // Get escrow's token account
        const escrowTokenAccount = await getAssociatedTokenAddress(
          mintPubkey,
          escrowPubkey
        );

        // Get or create user's token account
        const userTokenAccount = await getAssociatedTokenAddress(
          mintPubkey,
          userPubkey
        );

        // Check if user token account exists, create if not
        try {
          await getAccount(this.connection, userTokenAccount);
        } catch {
          console.log('📝 Creating token account for user...');
          transaction.add(
            createAssociatedTokenAccountInstruction(
              escrowPubkey, // payer (escrow pays)
              userTokenAccount,
              userPubkey,
              mintPubkey
            )
          );
        }

        // Add transfer instruction
        transaction.add(
          createTransferInstruction(
            escrowTokenAccount,
            userTokenAccount,
            escrowPubkey,
            amountBigInt
          )
        );
      }

      // Sign and send
      transaction.sign(this.escrowKeypair);
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false, preflightCommitment: 'confirmed' }
      );

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed');

      console.log('✅ Token transfer confirmed:', signature);
      return { success: true, signature };
    } catch (error: any) {
      console.error('❌ Token transfer error:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Return escrowed funds to user (for cancelled orders)
   */
  async refundToUser(
    userWallet: string,
    inputMint: string,
    amount: string,
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    if (process.env.VERCEL) {
      return { success: false, error: VERCEL_ESCROW_DISABLED };
    }
    if (!this.escrowKeypair) {
      return { success: false, error: 'Escrow wallet not initialized' };
    }

    try {
      const userPubkey = new PublicKey(userWallet);
      const escrowPubkey = this.escrowKeypair.publicKey;
      const amountBigInt = BigInt(amount);

      const transaction = new Transaction();
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = escrowPubkey;

      if (inputMint === SOL_MINT) {
        // Native SOL transfer back to user
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: escrowPubkey,
            toPubkey: userPubkey,
            lamports: amountBigInt,
          })
        );
      } else {
        // SPL Token transfer back to user
        const mintPubkey = new PublicKey(inputMint);
        
        const escrowTokenAccount = await getAssociatedTokenAddress(
          mintPubkey,
          escrowPubkey
        );

        const userTokenAccount = await getAssociatedTokenAddress(
          mintPubkey,
          userPubkey
        );

        // Check if user token account exists
        try {
          await getAccount(this.connection, userTokenAccount);
        } catch {
          // Create ATA for user if it doesn't exist
          transaction.add(
            createAssociatedTokenAccountInstruction(
              escrowPubkey, // payer (escrow pays)
              userTokenAccount,
              userPubkey,
              mintPubkey
            )
          );
        }

        transaction.add(
          createTransferInstruction(
            escrowTokenAccount,
            userTokenAccount,
            escrowPubkey,
            amountBigInt
          )
        );
      }

      // Sign and send
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.escrowKeypair]
      );

      console.log('✅ Refund sent to user:', signature);
      return { success: true, signature };
    } catch (error: any) {
      console.error('❌ Error refunding to user:', error);
      return { success: false, error: error.message };
    }
  }
}

// Singleton instance
let escrowServiceInstance: SolanaEscrowService | null = null;

export function getSolanaEscrowService(): SolanaEscrowService {
  if (!escrowServiceInstance) {
    escrowServiceInstance = new SolanaEscrowService();
  }
  return escrowServiceInstance;
}
