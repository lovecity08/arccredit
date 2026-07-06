import { defineChain } from 'viem'

export const ARC_CHAIN_ID = 5_042_002
export const ARC_CHAIN_HEX = '0x4CF1D2'
export const ARC_RPC_URL = 'https://rpc.testnet.arc.network'
export const ARC_EXPLORER_URL = 'https://testnet.arcscan.app'
export const ARC_USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const

export const arcTestnet = defineChain({
  id: ARC_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC_URL] } },
  blockExplorers: { default: { name: 'ArcScan', url: ARC_EXPLORER_URL } },
  testnet: true,
})
