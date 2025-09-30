import { NavigationBar } from '../NavigationBar';

export default function NavigationBarExample() {
  return (
    <NavigationBar 
      onConnectWallet={() => console.log('Connect wallet clicked')}
      isWalletConnected={true}
      walletAddress="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
    />
  );
}
