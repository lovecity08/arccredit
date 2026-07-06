import { createPublicClient, createWalletClient, custom, http, isAddress, type Address, type EIP1193Provider } from 'viem'
import { arcTestnet, ARC_CHAIN_HEX, ARC_USDC_ADDRESS } from '../config/arc'

export type WalletInfo = { uuid: string; name: string; icon: string; rdns: string }
export type WalletProvider = EIP1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
}
export type BrowserWallet = { info: WalletInfo; provider: WalletProvider }

const balanceAbi = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] }] as const

export const arcPublicClient = createPublicClient({ chain: arcTestnet, transport: http() })

export function walletClient(provider: EIP1193Provider) {
  return createWalletClient({ chain: arcTestnet, transport: custom(provider) })
}

export async function discoverWallets(waitMs = 700): Promise<BrowserWallet[]> {
  const found = new Map<string, BrowserWallet>()
  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent<BrowserWallet>).detail
    if (detail?.provider && detail?.info?.uuid) found.set(detail.info.uuid, detail)
  }

  window.addEventListener('eip6963:announceProvider', onAnnounce)
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  await new Promise((resolve) => window.setTimeout(resolve, waitMs))
  window.removeEventListener('eip6963:announceProvider', onAnnounce)

  if (found.size === 0 && window.ethereum) {
    found.set('browser-wallet', {
      info: { uuid: 'browser-wallet', name: 'Browser wallet', icon: '', rdns: 'injected.wallet' },
      provider: window.ethereum as WalletProvider,
    })
  }
  return [...found.values()]
}

export async function connect(provider: WalletProvider) {
  const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[]
  const address = accounts?.[0]
  if (!address || !isAddress(address)) throw new Error('The wallet did not return a valid account.')
  const chainId = await provider.request({ method: 'eth_chainId' }) as string
  return { address: address as Address, chainId }
}

export function onArc(chainId?: string) {
  return chainId?.toLowerCase() === ARC_CHAIN_HEX.toLowerCase()
}

export async function switchArc(provider: WalletProvider) {
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: ARC_CHAIN_HEX }] })
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: ARC_CHAIN_HEX,
        chainName: 'Arc Testnet',
        nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
        rpcUrls: ['https://rpc.testnet.arc.network'],
        blockExplorerUrls: ['https://testnet.arcscan.app'],
      }],
    })
  }
}

export async function readUsdcBalance(address: Address) {
  return arcPublicClient.readContract({ address: ARC_USDC_ADDRESS, abi: balanceAbi, functionName: 'balanceOf', args: [address] })
}

declare global {
  interface Window { ethereum?: WalletProvider }
}
