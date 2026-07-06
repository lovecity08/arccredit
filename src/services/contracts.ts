import { getAddress, isAddress, parseUnits, type Address } from 'viem'
import { ARC_USDC_ADDRESS } from '../config/arc'
import { arcPublicClient, walletClient, type WalletProvider } from './wallet'

const rawCreditAddress = import.meta.env.VITE_ARC_CREDIT_ADDRESS
export const creditAddress = rawCreditAddress && isAddress(rawCreditAddress) ? getAddress(rawCreditAddress) : undefined
export const isCreditConfigured = Boolean(creditAddress)

export const erc20Abi = [
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const

export const creditAbi = [
  { type: 'function', name: 'openFacility', stateMutability: 'nonpayable', inputs: [
    { name: 'borrower', type: 'address' }, { name: 'creditLimit', type: 'uint256' }, { name: 'maturity', type: 'uint64' }, { name: 'drawFeeBps', type: 'uint16' },
  ], outputs: [{ name: 'facilityId', type: 'uint256' }] },
  { type: 'function', name: 'draw', stateMutability: 'nonpayable', inputs: [{ name: 'facilityId', type: 'uint256' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'repay', stateMutability: 'nonpayable', inputs: [{ name: 'facilityId', type: 'uint256' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'freezeDraws', stateMutability: 'nonpayable', inputs: [{ name: 'facilityId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'closeFacility', stateMutability: 'nonpayable', inputs: [{ name: 'facilityId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'facility', stateMutability: 'view', inputs: [{ name: 'facilityId', type: 'uint256' }], outputs: [
    { name: 'issuer', type: 'address' }, { name: 'borrower', type: 'address' }, { name: 'creditLimit', type: 'uint256' }, { name: 'available', type: 'uint256' }, { name: 'outstanding', type: 'uint256' }, { name: 'maturity', type: 'uint64' }, { name: 'drawFeeBps', type: 'uint16' }, { name: 'drawsFrozen', type: 'bool' }, { name: 'closed', type: 'bool' },
  ] },
  { type: 'function', name: 'issuedFacilities', stateMutability: 'view', inputs: [{ name: 'issuer', type: 'address' }], outputs: [{ name: 'facilityIds', type: 'uint256[]' }] },
  { type: 'function', name: 'borrowedFacilities', stateMutability: 'view', inputs: [{ name: 'borrower', type: 'address' }], outputs: [{ name: 'facilityIds', type: 'uint256[]' }] },
] as const

export type Facility = {
  id: bigint
  issuer: Address
  borrower: Address
  creditLimit: bigint
  available: bigint
  outstanding: bigint
  maturity: bigint
  drawFeeBps: number
  drawsFrozen: boolean
  closed: boolean
}

function requireCredit(): Address {
  if (!creditAddress) throw new Error('ArcCredit contract is not configured. Deploy ArcCreditLine, then set VITE_ARC_CREDIT_ADDRESS in .env.')
  return creditAddress
}

export async function readAllowance(owner: Address) {
  const credit = requireCredit()
  return arcPublicClient.readContract({ address: ARC_USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [owner, credit] })
}

export async function approveUsdc(provider: WalletProvider, account: Address, amount: string) {
  const credit = requireCredit()
  const hash = await walletClient(provider).writeContract({
    account, address: ARC_USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [credit, parseUnits(amount, 6)],
  })
  return arcPublicClient.waitForTransactionReceipt({ hash })
}

export async function openFacility(provider: WalletProvider, account: Address, borrower: Address, limit: string, maturitySeconds: number, feeBps: number) {
  const credit = requireCredit()
  const hash = await walletClient(provider).writeContract({
    account, address: credit, abi: creditAbi, functionName: 'openFacility',
    args: [borrower, parseUnits(limit, 6), BigInt(maturitySeconds), feeBps],
  })
  return arcPublicClient.waitForTransactionReceipt({ hash })
}

export async function getFacility(facilityId: bigint): Promise<Facility> {
  const credit = requireCredit()
  const data = await arcPublicClient.readContract({ address: credit, abi: creditAbi, functionName: 'facility', args: [facilityId] })
  return {
    id: facilityId,
    issuer: data[0], borrower: data[1], creditLimit: data[2], available: data[3], outstanding: data[4], maturity: data[5],
    drawFeeBps: Number(data[6]), drawsFrozen: data[7], closed: data[8],
  }
}

export async function listIssued(address: Address) {
  const credit = requireCredit()
  return arcPublicClient.readContract({ address: credit, abi: creditAbi, functionName: 'issuedFacilities', args: [address] })
}

export async function listBorrowed(address: Address) {
  const credit = requireCredit()
  return arcPublicClient.readContract({ address: credit, abi: creditAbi, functionName: 'borrowedFacilities', args: [address] })
}

export async function drawCredit(provider: WalletProvider, account: Address, id: bigint, amount: string) {
  const credit = requireCredit()
  const hash = await walletClient(provider).writeContract({ account, address: credit, abi: creditAbi, functionName: 'draw', args: [id, parseUnits(amount, 6)] })
  return arcPublicClient.waitForTransactionReceipt({ hash })
}

export async function repayCredit(provider: WalletProvider, account: Address, id: bigint, amount: string) {
  const credit = requireCredit()
  const hash = await walletClient(provider).writeContract({ account, address: credit, abi: creditAbi, functionName: 'repay', args: [id, parseUnits(amount, 6)] })
  return arcPublicClient.waitForTransactionReceipt({ hash })
}

export async function freezeCredit(provider: WalletProvider, account: Address, id: bigint) {
  const credit = requireCredit()
  const hash = await walletClient(provider).writeContract({ account, address: credit, abi: creditAbi, functionName: 'freezeDraws', args: [id] })
  return arcPublicClient.waitForTransactionReceipt({ hash })
}

export async function closeCredit(provider: WalletProvider, account: Address, id: bigint) {
  const credit = requireCredit()
  const hash = await walletClient(provider).writeContract({ account, address: credit, abi: creditAbi, functionName: 'closeFacility', args: [id] })
  return arcPublicClient.waitForTransactionReceipt({ hash })
}
