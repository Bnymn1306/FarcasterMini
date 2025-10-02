import { http, createConfig } from 'wagmi'
import { baseSepolia } from 'wagmi/chains'
import { farcasterFrame } from '@farcaster/frame-wagmi-connector'

export const config = createConfig({
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: http(),
  },
  connectors: [farcasterFrame()],
})
