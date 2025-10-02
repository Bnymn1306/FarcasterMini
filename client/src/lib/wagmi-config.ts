import { http, createConfig } from 'wagmi'
import { base } from 'wagmi/chains'
import { farcasterFrame } from '@farcaster/frame-wagmi-connector'
import { injected } from 'wagmi/connectors'

export const config = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  connectors: [
    farcasterFrame(),
    injected({ target: 'metaMask' }),
  ],
  ssr: false,
})
