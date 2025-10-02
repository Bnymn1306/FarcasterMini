import { http, createConfig } from 'wagmi'
import { base } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const config = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  connectors: [
    injected({ shimDisconnect: true }), // Support MetaMask, Backpack, etc.
  ],
  ssr: false,
})
