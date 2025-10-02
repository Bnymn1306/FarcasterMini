import { http, createConfig } from 'wagmi'
import { base } from 'wagmi/chains'
import { frameConnector } from './frame-connector'

export const config = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  connectors: [frameConnector()],
})
