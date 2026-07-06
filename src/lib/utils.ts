import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function shortAddress(address?: string) {
  return address ? `${address.slice(0, 6)}鈥?{address.slice(-4)}` : 'Not connected'
}

export function formatUsdc(value: bigint | number, digits = 2) {
  const raw = typeof value === 'bigint' ? Number(value) / 1_000_000 : value
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(raw)
}
