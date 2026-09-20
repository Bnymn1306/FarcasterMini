# Emergency WETH Withdrawal from ExecutorVault V2

## Quick Withdraw via Browser Console

1. Open Browser Console (F12 or Cmd+Option+I)
2. Paste this script and press Enter:

```javascript
(async () => {
  const VAULT_V2 = "0x830C397739485065513f94a3284ebd54aE638806";
  const WETH = "0x4200000000000000000000000000000000000006";
  const VAULT_ABI = [
    "function withdraw(address token, uint256 amount) external",
    "function balances(address user, address token) view returns (uint256)"
  ];
  
  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    
    const vault = new ethers.Contract(VAULT_V2, VAULT_ABI, signer);
    
    // Check balance
    const balance = await vault.balances(address, WETH);
    console.log(`Vault balance: ${ethers.formatEther(balance)} WETH`);
    
    if (balance === 0n) {
      console.log("No WETH to withdraw");
      return;
    }
    
    // Withdraw all
    console.log("Withdrawing all WETH...");
    const tx = await vault.withdraw(WETH, balance);
    console.log(`Transaction: ${tx.hash}`);
    
    await tx.wait();
    console.log("✅ Withdrawal successful!");
    
  } catch (err) {
    console.error("❌ Withdrawal failed:", err.message);
  }
})();
```

## Alternative: Via VaultPanel UI

1. Go to: **DEX Swap** page (`/swap`)
2. Scroll down on the **RIGHT sidebar** 
3. Find **"ExecutorVault"** card
4. In **"Withdraw from Vault"** section:
   - Click **Max** button
   - Click **Withdraw** button

## Notes
- V2 Vault: `0x830C397739485065513f94a3284ebd54aE638806`
- Make sure wallet is connected
- Withdraws all available WETH balance
