# x402 Micropayment Integration Guide

## Overview
BasedMem integrates the **x402 protocol** for seamless USDC micropayments on premium features. This enables zero-fee, instant payments using Coinbase's facilitator on Base L2.

## Architecture

### Backend Components

#### 1. Payment Middleware (`server/middleware/x402.ts`)
```typescript
import { createX402Middleware } from './middleware/x402';

// Protect premium endpoints
app.post("/api/tokens/premium", 
  createX402Middleware("PREMIUM_TOKEN_LAUNCH"), 
  async (req, res) => {
    // Premium token creation logic
  }
);
```

**Features:**
- Automatic 402 Payment Required responses
- Payment proof verification
- Request augmentation with payment metadata
- Coinbase facilitator integration

#### 2. Database Schema (`shared/schema.ts`)
```typescript
export const x402Payments = pgTable("x402_payments", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
  feature: varchar("feature", { length: 50 }).notNull(),
  amount: varchar("amount", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  transactionHash: varchar("transaction_hash", { length: 66 }),
  endpoint: varchar("endpoint", { length: 100 }).notNull(),
  paymentProof: text("payment_proof"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});
```

#### 3. Storage Layer (`server/storage.ts`)
```typescript
interface IStorage {
  // x402 Payment tracking
  createX402Payment(payment: InsertX402Payment): Promise<X402Payment>;
  getX402PaymentsByWallet(walletAddress: string): Promise<X402Payment[]>;
  updateX402PaymentStatus(id: number, updates: Partial<X402Payment>): Promise<void>;
}
```

### Frontend Components

#### 1. Payment Hook (`client/src/hooks/useX402Payment.ts`)
```typescript
const { fetchWithPayment, isPending } = useX402Payment();

// Make payment-protected request
const result = await fetchWithPayment({
  url: "/api/tokens/premium",
  method: "POST",
  body: { tokenData },
});
```

**Features:**
- Automatic wallet provider detection (Farcaster SDK or MetaMask)
- Payment proof signing
- Error handling with user-friendly messages
- TanStack Query integration

#### 2. UI Integration (`client/src/components/CreateTokenForm.tsx`)
```typescript
const [isPremiumLaunch, setIsPremiumLaunch] = useState(false);

// Premium launch card with benefits
<Card onClick={() => setIsPremiumLaunch(true)}>
  <Crown /> Premium Launch - $0.05 USDC
  ✓ Verified Badge
  ✓ Featured Placement
  ✓ Priority Support
</Card>
```

## Premium Features Pricing

| Feature | Price | Endpoint | Benefits |
|---------|-------|----------|----------|
| Premium Token Launch | $0.05 USDC | `/api/tokens/premium` | Verified badge, featured placement, priority support |
| Advanced Analytics | $0.01 USDC | `/api/analytics/advanced` | Whale tracking, on-chain insights |
| Priority Prediction | $0.01 USDC | `/api/predictions/priority` | Featured prediction market |
| AI Trading API | $0.005 USDC | `/api/trade/ai` | Programmatic trading access |

## Environment Variables

```env
# x402 Protocol Configuration
X402_PAYMENT_WALLET_ADDRESS=0xYourWalletAddress
NEXT_PUBLIC_ONCHAINKIT_API_KEY=your_cdp_api_key
X402_NETWORK=base-sepolia # or base for mainnet
```

**Getting API Keys:**
1. **Coinbase Developer Platform**: https://portal.cdp.coinbase.com/products/onchainkit
2. **Wallet Address**: Your Base wallet address to receive USDC payments

## Security & Audit Trail

### Payment Verification
- **Coinbase Facilitator Verification**: Uses `facilitator.verify()` to validate payment proofs
- **Payer Address Extraction**: Validates wallet address from verification result
- **Settlement Enforcement**: Calls `facilitator.settle()` to complete on-chain settlement
- **Audit Logging**: All payments tracked with verification and settlement timestamps

### Settlement Timestamp Recording
- ✅ `settledAt` ONLY recorded after successful `settle()` call
- ✅ Failed settlements keep `settledAt: null` for retry capability
- ✅ Settlement errors stored in `metadata` and `errorMessage` fields
- ✅ Returns 503 error when settlement fails (no premium access granted)

### Storage Failure Handling
- ✅ Returns 500 error if payment record can't be stored after settlement
- ✅ Extensive logging for manual review/recovery (PAYMENT AUDIT ALERT)
- ✅ Prevents premium access without audit trail
- ✅ Ensures no mismatch between settled payments and database records

### Error Scenarios
| Scenario | Response | Database Record | Premium Access |
|----------|----------|-----------------|----------------|
| Verification fails | 402 Payment Required | None | Denied |
| Settlement fails | 503 Service Unavailable | Created with `settledAt: null` and error | Denied |
| Storage fails | 500 Internal Error | None (with extensive audit logging) | Denied |
| Success | 200 OK | Complete with all timestamps | Granted |

## Payment Flow

### 1. User Initiates Premium Action
```typescript
// User clicks "Premium Launch" button
const handlePremiumLaunch = async () => {
  await fetchWithPayment({
    url: "/api/tokens/premium",
    method: "POST",
    body: tokenData,
  });
};
```

### 2. Backend Returns 402 Payment Required
```json
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "base-sepolia",
    "maxAmountRequired": "0.05",
    "resource": "/api/tokens/premium",
    "payTo": "0x...",
    "asset": "USDC",
    "currency": "USDC"
  }],
  "error": "Payment required for this premium feature"
}
```

### 3. x402-fetch Auto-handles Payment
- Detects 402 response
- Prompts wallet signature
- Constructs payment proof
- Retries request with `X-Payment` header

### 4. Backend Verifies & Processes
```typescript
// Middleware extracts payment proof
const proof = req.headers['x-payment'];

// Store payment record
await storage.createX402Payment({
  walletAddress,
  feature: "premium_token_launch",
  amount: "0.05",
  status: "completed",
  transactionHash,
});

// Execute premium action
res.json({ success: true, tokenId, verified: true });
```

## Testing Guide

### Base Sepolia Testnet

1. **Get Testnet USDC:**
   ```
   Network: Base Sepolia
   USDC Contract: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
   Faucet: https://faucet.circle.com/
   ```

2. **Configure Environment:**
   ```env
   X402_NETWORK=base-sepolia
   X402_PAYMENT_WALLET_ADDRESS=0xYourSepoliaWallet
   ```

3. **Test Premium Launch:**
   - Navigate to Create Token page
   - Select "Premium Launch"
   - Fill form and submit
   - Approve USDC payment in wallet
   - Verify token created with verified badge

4. **Verify on BaseScan:**
   ```
   https://sepolia.basescan.org/tx/{transactionHash}
   ```

### Production Migration

1. **Switch to Base Mainnet:**
   ```env
   X402_NETWORK=base
   ```

2. **Update USDC Contract:**
   ```typescript
   // Base Mainnet USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
   ```

3. **Fund Payment Wallet:**
   - Ensure sufficient ETH for gas
   - Monitor USDC balance

## Security Considerations

### Payment Verification
- All payments verified by Coinbase facilitator
- Double-spend protection via blockchain
- Automatic refund on failed transactions

### Wallet Safety
- Never expose private keys
- Use environment variables for sensitive data
- Validate all payment proofs server-side

### Rate Limiting
```typescript
// Prevent payment spam
const recentPayments = await storage.getX402PaymentsByWallet(address);
if (recentPayments.filter(p => p.createdAt > recentTime).length > 10) {
  throw new Error("Rate limit exceeded");
}
```

## Troubleshooting

### Common Issues

**1. "Wallet not connected" Error**
```typescript
// Ensure wallet is connected before payment
if (!wallet.walletAddress) {
  toast({ title: "Connect wallet first" });
  return;
}
```

**2. "Insufficient USDC" Error**
```typescript
// Check USDC balance
const balance = await usdcContract.balanceOf(address);
if (balance < requiredAmount) {
  toast({ title: "Insufficient USDC balance" });
}
```

**3. Payment Proof Verification Failed**
- Ensure `NEXT_PUBLIC_ONCHAINKIT_API_KEY` is set
- Check network matches (sepolia vs mainnet)
- Verify wallet has USDC approval

**4. 402 Response Not Handled**
```typescript
// Ensure using wrapFetchWithPayment
import { wrapFetchWithPayment } from "x402-fetch";
const fetchWithPayment = wrapFetchWithPayment(fetch, signer);
```

## Benefits

### For Users
- **Zero Gas Fees**: USDC payments on L2
- **Instant**: Sub-second payment confirmation
- **Transparent**: All transactions on-chain
- **Secure**: Coinbase facilitator trusted

### For Platform
- **Monetization**: Direct revenue from premium features
- **Scalable**: Handles high transaction volume
- **Compliant**: On-chain payment records
- **Flexible**: Easy to add new premium features

## Future Enhancements

### Planned Features
1. **Subscription Model**: Monthly premium membership
2. **Bulk Payments**: Discount for batch actions
3. **Refund System**: Automatic refunds on failures
4. **Analytics Dashboard**: Payment metrics and revenue tracking

### Integration Opportunities
- Premium prediction markets
- Advanced trading bots API access
- VIP token listings
- Exclusive airdrops for premium users

## Resources

- **x402 Protocol**: https://github.com/coinbase/x402
- **Coinbase Onchain Kit**: https://onchainkit.xyz/
- **Base Developer Docs**: https://docs.base.org/
- **USDC on Base**: https://www.circle.com/en/usdc-on-base

## Support

For x402 integration issues:
1. Check environment variables
2. Verify network configuration
3. Test with Sepolia first
4. Contact Coinbase support for facilitator issues
