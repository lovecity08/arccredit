import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowDownLeft, ArrowUpRight, Banknote, ChevronRight, CircleGauge, ExternalLink, Landmark, Loader2, LockKeyhole, RefreshCw, ShieldCheck, Snowflake, Sparkles } from 'lucide-react'
import type { Address } from 'viem'
import { ARC_EXPLORER_URL } from './config/arc'
import { cn, formatUsdc, shortAddress } from './lib/utils'
import { WalletDialog } from './components/WalletDialog'
import { connect, discoverWallets, onArc, readUsdcBalance, switchArc, type BrowserWallet, type WalletProvider } from './services/wallet'
import { approveUsdc, closeCredit, creditAddress, drawCredit, freezeCredit, getFacility, isCreditConfigured, listBorrowed, listIssued, openFacility, repayCredit, type Facility } from './services/contracts'

type TxState = { kind: 'idle' | 'pending' | 'success' | 'error'; label: string; hash?: string; detail?: string }

const explorer = (tx?: string) => tx ? `${ARC_EXPLORER_URL}/tx/${tx}` : undefined
const errorMessage = (error: unknown) => error instanceof Error ? error.message.replace(/\n/g, ' ') : 'Unknown wallet or contract error.'

export default function App() {
  const [wallets, setWallets] = useState<BrowserWallet[]>([])
  const [walletOpen, setWalletOpen] = useState(false)
  const [provider, setProvider] = useState<WalletProvider>()
  const [account, setAccount] = useState<Address>()
  const [chainId, setChainId] = useState<string>()
  const [balance, setBalance] = useState<bigint>(0n)
  const [facilityId, setFacilityId] = useState('')
  const [facility, setFacility] = useState<Facility>()
  const [issuerIds, setIssuerIds] = useState<readonly bigint[]>([])
  const [borrowerIds, setBorrowerIds] = useState<readonly bigint[]>([])
  const [tx, setTx] = useState<TxState>({ kind: 'idle', label: 'Ready to connect.' })
  const [createForm, setCreateForm] = useState({ borrower: '', limit: '125', maturity: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16), feeBps: '75' })
  const [drawAmount, setDrawAmount] = useState('25')
  const [repayAmount, setRepayAmount] = useState('25')

  const arcReady = onArc(chainId)
  const activeFacility = facility ?? { id: 0n, issuer: '0x0000000000000000000000000000000000000000', borrower: '0x0000000000000000000000000000000000000000', creditLimit: 125000000n, available: 125000000n, outstanding: 0n, maturity: BigInt(Math.floor(Date.now() / 1000) + 30 * 86400), drawFeeBps: 75, drawsFrozen: false, closed: false }
  const usage = activeFacility.creditLimit > 0n ? Number((activeFacility.outstanding * 10000n) / activeFacility.creditLimit) / 100 : 0
  const availability = activeFacility.creditLimit > 0n ? Number((activeFacility.available * 100n) / activeFacility.creditLimit) : 0
  const maturityLabel = new Date(Number(activeFacility.maturity) * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const facilityState = useMemo(() => facility ? (facility.closed ? 'Closed' : facility.drawsFrozen ? 'Draws frozen' : Number(facility.maturity) * 1000 <= Date.now() ? 'Matured - repay only' : 'Active credit window') : 'No facility loaded', [facility])

  useEffect(() => { discoverWallets().then(setWallets).catch(() => setWallets([])) }, [])

  async function refresh(address = account) {
    if (!address) return
    try {
      setBalance(await readUsdcBalance(address))
      if (isCreditConfigured) {
        const [issued, borrowed] = await Promise.all([listIssued(address), listBorrowed(address)])
        setIssuerIds(issued)
        setBorrowerIds(borrowed)
      }
    } catch { /* tx rail shows status */ }
  }

  async function ensureArc() {
    if (!provider || !account) throw new Error('Connect a wallet first.')
    if (!arcReady) {
      setTx({ kind: 'pending', label: 'Switching to Arc Testnet...' })
      await switchArc(provider)
      const next = await provider.request({ method: 'eth_chainId' }) as string
      setChainId(next)
      if (!onArc(next)) throw new Error('Arc Testnet is not active.')
    }
  }

  async function run(label: string, work: () => Promise<{ transactionHash: string }>) {
    try {
      await ensureArc()
      if (!isCreditConfigured) throw new Error('Set VITE_ARC_CREDIT_ADDRESS in .env first.')
      setTx({ kind: 'pending', label })
      const receipt = await work()
      setTx({ kind: 'success', label: 'Confirmed on Arc Testnet.', hash: receipt.transactionHash })
      await refresh()
      if (facilityId) await loadFacility()
    } catch (error) {
      setTx({ kind: 'error', label: 'The action did not complete.', detail: errorMessage(error) })
    }
  }

  async function pickWallet(wallet: BrowserWallet) {
    try {
      setTx({ kind: 'pending', label: `Connecting ${wallet.info.name}...` })
      const session = await connect(wallet.provider)
      setProvider(wallet.provider)
      setAccount(session.address)
      setChainId(session.chainId)
      setWalletOpen(false)
      setTx({ kind: 'success', label: 'Wallet connected.' })
      await refresh(session.address)
    } catch (error) {
      setTx({ kind: 'error', label: 'Wallet connection failed.', detail: errorMessage(error) })
    }
  }

  async function loadFacility() {
    try {
      if (!isCreditConfigured) throw new Error('ArcCredit is not configured yet.')
      if (!/^\d+$/.test(facilityId)) throw new Error('Enter a numeric facility ID.')
      const value = await getFacility(BigInt(facilityId))
      if (value.issuer === '0x0000000000000000000000000000000000000000') throw new Error('No facility exists at that ID.')
      setFacility(value)
      setTx({ kind: 'success', label: `Facility #${facilityId} loaded.` })
    } catch (error) {
      setTx({ kind: 'error', label: 'Facility could not be loaded.', detail: errorMessage(error) })
    }
  }

  async function createFacility() {
    if (!provider || !account) return setWalletOpen(true)
    const maturity = Math.floor(new Date(createForm.maturity).getTime() / 1000)
    if (!Number.isFinite(maturity) || maturity <= Math.floor(Date.now() / 1000)) return setTx({ kind: 'error', label: 'Choose a future maturity date.' })
    await run('Approving funding USDC...', () => approveUsdc(provider, account, createForm.limit))
    await run('Opening the facility...', () => openFacility(provider, account, createForm.borrower as Address, createForm.limit, maturity, Number(createForm.feeBps)))
  }

  return <main className="min-h-screen bg-[#070a19] text-white">
    <div className="fixed inset-0 -z-10 aurora-grid" />
    <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
      <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[15px] border border-white/15 bg-white/5"><CircleGauge className="size-5 text-cyan-200" /></span><div><div className="font-display text-lg">ArcCredit</div><div className="text-[10px] uppercase tracking-[.22em] text-slate-400">Bilateral USDC facilities</div></div></div>
      <div className="flex gap-2"><button onClick={() => account ? refresh() : setWalletOpen(true)} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm">{account ? shortAddress(account) : 'Connect wallet'}</button><button onClick={() => provider && !arcReady ? ensureArc().catch((error) => setTx({ kind: 'error', label: 'Network switch failed.', detail: errorMessage(error) })) : undefined} className={cn('rounded-full border px-4 py-2 text-sm', arcReady ? 'border-cyan-200/20 bg-cyan-300/10 text-cyan-100' : 'border-amber-200/20 bg-amber-300/10 text-amber-100')}>{provider ? (arcReady ? 'Arc Testnet' : 'Switch to Arc') : 'Wallet offline'}</button></div>
    </header>

    <section className="mx-auto grid max-w-7xl gap-8 px-5 pb-12 pt-6 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:px-10 lg:pt-10">
      <div>
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-fuchsia-200/15 bg-fuchsia-300/10 px-3 py-1 text-xs text-fuchsia-100"><Sparkles className="size-3.5" /> Testnet private credit rail</div>
        <h1 className="font-display text-[clamp(3rem,7vw,6rem)] leading-[.92] tracking-[-.06em]">Draw trust into a credit window.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">ArcCredit turns a bilateral USDC commitment into a programmable facility: issuer-funded, borrower-drawn, wallet-signed, and visible on Arc Testnet.</p>
        <div className="mt-8 flex flex-wrap gap-3"><a href="#facility" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-200 to-cyan-100 px-5 py-3 text-sm font-bold text-[#0a0e25]">Open a facility <ChevronRight className="size-4" /></a><a href="#protocol" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm">How it works</a></div>
        <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3 text-sm"><Metric label="Custody" value="Wallet native" /><Metric label="Settlement" value="USDC / Arc" /><Metric label="Credit type" value="Bilateral" /></div>
      </div>
      <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <div className="flex items-start justify-between"><div><div className="text-xs uppercase tracking-[.2em] text-cyan-200/70">Live credit plane</div><div className="mt-2 text-sm text-slate-300">{facility ? `Facility #${facility.id}` : 'Preview geometry until a facility is loaded'}</div></div><div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">{facility ? facilityState : 'No facility loaded'}</div></div>
        <div className="mt-6 rounded-[999px] border border-white/10 p-2"><div className="grid aspect-square place-items-center rounded-[999px] border border-white/10 bg-[#0c112b]"><div className="text-center"><div className="text-xs uppercase tracking-[.2em] text-slate-400">Available now</div><div className="mt-2 font-display text-5xl">${formatUsdc(activeFacility.available, 0)}</div><div className="mt-2 text-sm text-cyan-100">{availability}% undrawn capacity</div></div></div></div>
        <div className="mt-5 grid grid-cols-2 gap-3"><MiniStat label="Outstanding" value={`$${formatUsdc(activeFacility.outstanding, 0)}`} icon={<ArrowUpRight className="size-4" />} /><MiniStat label="Draw fee" value={`${activeFacility.drawFeeBps / 100}%`} icon={<Banknote className="size-4" />} /><MiniStat label="Utilization" value={`${usage}%`} icon={<Activity className="size-4" />} /><MiniStat label="Maturity" value={maturityLabel} icon={<Landmark className="size-4" />} /></div>
      </div>
    </section>

    <section id="facility" className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
      <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-[.2em] text-fuchsia-200/70">Issuer console</div>
          <h2 className="mt-2 font-display text-3xl">Fund a specific borrower, not a black box.</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Borrower wallet" className="sm:col-span-2"><input value={createForm.borrower} onChange={(e) => setCreateForm({ ...createForm, borrower: e.target.value })} placeholder="0x..." /></Field>
            <Field label="Credit limit (USDC)"><input value={createForm.limit} onChange={(e) => setCreateForm({ ...createForm, limit: e.target.value })} inputMode="decimal" /></Field>
            <Field label="Draw fee (bps)"><input value={createForm.feeBps} onChange={(e) => setCreateForm({ ...createForm, feeBps: e.target.value })} inputMode="numeric" /></Field>
            <Field label="Maturity"><input type="datetime-local" value={createForm.maturity} onChange={(e) => setCreateForm({ ...createForm, maturity: e.target.value })} /></Field>
            <Field label="Action status"><div className="flex h-11 items-center justify-between rounded-xl border border-white/10 bg-[#080c20] px-3 text-sm text-slate-300"><span>Approve USDC then open</span><ShieldCheck className="size-4 text-cyan-200" /></div></Field>
          </div>
          <div className="mt-6 flex flex-wrap gap-3"><button onClick={createFacility} className="rounded-xl bg-gradient-to-r from-violet-200 to-cyan-100 px-4 py-3 text-sm font-bold text-[#0a0e25]">Open facility</button><button onClick={() => provider && account ? run('Approving facility USDC...', () => approveUsdc(provider, account, createForm.limit)) : setWalletOpen(true)} className="rounded-xl border border-fuchsia-200/20 bg-fuchsia-300/10 px-4 py-3 text-sm font-semibold text-fuchsia-50">Approve USDC</button></div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-[.2em] text-cyan-200/70">Registry</div>
          <div className="mt-2 font-display text-2xl">Facility lists</div>
          <div className="mt-5 space-y-2">
            {(issuerIds.length ? issuerIds : borrowerIds).slice(0, 4).map((id) => <button key={String(id)} onClick={() => { setFacilityId(String(id)); window.setTimeout(loadFacility, 0) }} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[.035] px-4 py-3 text-left hover:bg-white/[.07]"><span><span className="block text-sm font-medium">Facility #{String(id)}</span><span className="block text-xs text-slate-500">Load onchain state</span></span><ChevronRight className="size-4 text-cyan-200" /></button>)
            )}
            {!issuerIds.length && !borrowerIds.length && <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-slate-400">Connect a wallet to see issuer and borrower facility IDs.</div>}
          </div>
        </div>
      </div>
    </section>

    <section id="operate" className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
      <div className="grid gap-5 lg:grid-cols-[.75fr_1.1fr_.75fr]">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-[.2em] text-slate-400">Load facility</div>
          <div className="mt-3 flex gap-2"><input value={facilityId} onChange={(e) => setFacilityId(e.target.value)} placeholder="Facility ID" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#080c20] px-3 py-3 outline-none" /><button onClick={loadFacility} className="grid size-12 place-items-center rounded-xl border border-white/10 bg-white/5"><RefreshCw className="size-4" /></button></div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-sm text-slate-300"><div className="text-xs uppercase tracking-[.2em] text-slate-500">Current state</div><div className="mt-2 font-semibold">{facility ? facilityState : 'Nothing loaded yet'}</div><div className="mt-2 text-xs text-slate-500">{creditAddress ? `Contract: ${creditAddress}` : 'Deploy the contract and set VITE_ARC_CREDIT_ADDRESS.'}</div></div>
        </div>
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="grid gap-3 sm:grid-cols-2">
            <ActionCard title="Draw USDC" subtitle="Borrower-only. The contract transfers the net amount after the configured fee." icon={<ArrowDownLeft className="size-4" />}><div className="mt-3 flex gap-2"><input value={drawAmount} onChange={(e) => setDrawAmount(e.target.value)} inputMode="decimal" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#080c20] px-3 py-2.5 outline-none" /><button onClick={() => provider && account && facility ? run('Submitting a draw...', () => drawCredit(provider, account, facility.id, drawAmount)) : setWalletOpen(true)} className="rounded-xl bg-cyan-200 px-3 py-2.5 text-sm font-bold text-[#08112a]">Draw</button></div></ActionCard>
            <ActionCard title="Repay balance" subtitle="Approve USDC first. Repayment restores drawable capacity." icon={<ArrowUpRight className="size-4" />}><div className="mt-3 flex gap-2"><input value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)} inputMode="decimal" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#080c20] px-3 py-2.5 outline-none" /><button onClick={() => provider && account ? run('Approving repayment USDC...', () => approveUsdc(provider, account, repayAmount)) : setWalletOpen(true)} className="rounded-xl border border-fuchsia-200/25 bg-fuchsia-300/10 px-3 py-2.5 text-sm font-bold text-fuchsia-50">Approve</button><button onClick={() => provider && account && facility ? run('Submitting repayment...', () => repayCredit(provider, account, facility.id, repayAmount)) : setWalletOpen(true)} className="rounded-xl bg-fuchsia-200 px-3 py-2.5 text-sm font-bold text-[#1e0a2b]">Repay</button></div></ActionCard>
          </div>
          <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => provider && account && facility ? run('Freezing draws...', () => freezeCredit(provider, account, facility.id)) : setWalletOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200"><Snowflake className="size-3.5" /> Freeze draws</button><button onClick={() => provider && account && facility ? run('Closing the facility...', () => closeCredit(provider, account, facility.id)) : setWalletOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200"><LockKeyhole className="size-3.5" /> Close after repayment</button></div>
        </div>
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-[.2em] text-slate-400">Transaction rail</div>
          <TxRail tx={tx} />
          <button onClick={() => refresh()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-semibold text-slate-300"><RefreshCw className="size-3.5" /> Refresh wallet data</button>
          <div className="mt-5 border-t border-white/10 pt-5"><div className="text-xs uppercase tracking-[.2em] text-slate-400">Wallet USDC</div><div className="mt-2 font-display text-3xl">${formatUsdc(balance)}</div><div className="mt-1 text-xs text-slate-500">Onchain ERC-20 balance on Arc Testnet</div></div>
        </div>
      </div>
    </section>

    <section id="protocol" className="mx-auto max-w-7xl px-5 pb-16 pt-8 sm:px-8 lg:px-10">
      <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
          <div><div className="text-xs uppercase tracking-[.2em] text-cyan-200/70">Protocol anatomy</div><h2 className="mt-3 font-display text-3xl">Private credit, expressed as a clear USDC state machine.</h2><p className="mt-4 text-sm leading-7 text-slate-400">ArcCredit is a non-custodial testnet prototype for issuer-controlled, bilateral credit. Issuers decide who receives a facility; borrowers draw only within the funded amount and term.</p></div>
          <div className="grid gap-3 sm:grid-cols-4"><Flow icon={<Landmark className="size-4" />} title="Fund" detail="Issuer approves and locks facility USDC." /><Flow icon={<ArrowDownLeft className="size-4" />} title="Draw" detail="Borrower receives net USDC; fee routes to issuer." /><Flow icon={<ArrowUpRight className="size-4" />} title="Repay" detail="Borrower restores drawable capacity." /><Flow icon={<ShieldCheck className="size-4" />} title="Close" detail="Issuer closes after repayment and reclaims cash." /></div>
        </div>
        <div className="mt-7 rounded-2xl border border-amber-200/10 bg-amber-200/5 p-4 text-xs leading-6 text-amber-100/85">This testnet product is not audited and does not provide consumer lending, underwriting, investment, or credit advice.</div>
      </div>
    </section>

    <footer className="border-t border-white/5 px-5 py-8 text-center text-xs text-slate-500">ArcCredit - Arc Testnet credit facility prototype - Built for user-signed USDC operations</footer>
    <WalletDialog open={walletOpen} onOpenChange={setWalletOpen} wallets={wallets} onPick={pickWallet} busy={tx.kind === 'pending'} />
  </main>
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="border-l border-white/10 pl-3"><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500">{label}</div><div className="mt-1 text-sm font-medium text-slate-200">{value}</div></div> }
function MiniStat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <div className="rounded-2xl border border-white/[.08] bg-white/[.035] p-3"><div className="flex items-center gap-2 text-slate-400">{icon}<span className="text-[10px] font-semibold uppercase tracking-[.12em]">{label}</span></div><p className="mt-2 text-sm font-semibold text-white">{value}</p></div> }
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) { return <label className={cn('block', className)}><span className="mb-2 block text-xs font-semibold uppercase tracking-[.13em] text-slate-400">{label}</span>{children}</label> }
function Flow({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) { return <div className="rounded-2xl border border-white/[.09] bg-white/[.03] p-4"><div className="text-cyan-200">{icon}</div><p className="mt-3 font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p></div> }
function ActionCard({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: React.ReactNode; children: React.ReactNode }) { return <div className="rounded-2xl border border-white/[.08] bg-white/[.03] p-4"><div className="flex items-center justify-between"><div><div className="font-medium">{title}</div><div className="mt-1 text-xs leading-5 text-slate-400">{subtitle}</div></div><div className="text-cyan-200">{icon}</div></div>{children}</div> }
function TxRail({ tx }: { tx: TxState }) { const badge = tx.kind === 'pending' ? <Loader2 className="size-4 animate-spin text-cyan-200" /> : tx.kind === 'success' ? <ShieldCheck className="size-4 text-emerald-300" /> : tx.kind === 'error' ? <LockKeyhole className="size-4 text-rose-300" /> : <RefreshCw className="size-4 text-slate-400" />; return <div className={cn('mt-4 rounded-2xl border p-4', tx.kind === 'error' ? 'border-rose-300/15 bg-rose-300/5' : tx.kind === 'success' ? 'border-emerald-300/15 bg-emerald-300/5' : 'border-white/10 bg-white/[.035]')}><div className="flex items-start gap-3">{badge}<div><p className="text-sm font-medium text-slate-100">{tx.label}</p>{tx.detail && <p className="mt-1 break-words text-xs leading-5 text-slate-400">{tx.detail}</p>}{tx.hash && <a target="_blank" rel="noreferrer" href={explorer(tx.hash)} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-cyan-200 hover:text-cyan-100">View on ArcScan <ExternalLink className="size-3" /></a>}</div></div></div> }
