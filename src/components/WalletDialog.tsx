import * as Dialog from '@radix-ui/react-dialog'
import { Check, Loader2, ShieldCheck, Wallet } from 'lucide-react'
import type { BrowserWallet } from '../services/wallet'
import { cn } from '../lib/utils'

export function WalletDialog({ open, onOpenChange, wallets, onPick, busy }: {
  open: boolean
  onOpenChange: (value: boolean) => void
  wallets: BrowserWallet[]
  onPick: (wallet: BrowserWallet) => void
  busy: boolean
}) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-[#050818]/70 backdrop-blur-md" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[26px] border border-white/15 bg-[#111631] p-5 text-white shadow-[0_35px_100px_rgba(4,7,35,.72)] outline-none">
        <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_26%_0%,rgba(192,132,252,.3),transparent_48%),radial-gradient(circle_at_86%_0%,rgba(34,211,238,.22),transparent_42%)]" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <Dialog.Title className="font-display text-2xl tracking-tight">Connect a custody layer</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm leading-6 text-slate-300">Choose a browser wallet. ArcCredit never sees or stores your private keys.</Dialog.Description>
          </div>
          <div className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-white/10 text-cyan-200"><ShieldCheck className="size-5" /></div>
        </div>
        <div className="relative mt-6 space-y-2">
          {wallets.map((wallet) => <button key={wallet.info.uuid} disabled={busy} onClick={() => onPick(wallet)} className={cn('group flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[.045] px-4 py-3.5 text-left transition hover:border-cyan-300/40 hover:bg-cyan-100/[.08] disabled:cursor-wait disabled:opacity-60')}>
            <span className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-white/10 text-cyan-100"><Wallet className="size-4" /></span><span><span className="block font-medium">{wallet.info.name}</span><span className="mt-0.5 block text-xs text-slate-400">EIP-6963 compatible provider</span></span></span>
            {busy ? <Loader2 className="size-4 animate-spin text-cyan-200" /> : <Check className="size-4 text-white/25 group-hover:text-cyan-200" />}
          </button>)}
          {!wallets.length && <div className="rounded-2xl border border-dashed border-white/20 p-5 text-sm leading-6 text-slate-300">No compatible wallet was found. Unlock MetaMask, OKX Wallet, or another EVM browser wallet, then refresh this page.</div>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
