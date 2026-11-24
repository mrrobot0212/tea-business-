import { format, parseISO } from 'date-fns'

/**
 * Format a number as BDT currency with ৳ symbol.
 */
export function formatCurrency(amount: number): string {
  return `৳${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/**
 * Format a weight in KG. Shows grams if under 1 KG.
 */
export function formatWeight(kg: number): string {
  if (kg < 1) return `${(kg * 1000).toFixed(0)}g`
  return `${kg.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} KG`
}

/**
 * Format an ISO date string to a human-readable date.
 */
export function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy')
  } catch {
    return dateStr
  }
}

/**
 * Format an ISO datetime string to a human-readable date and time.
 */
export function formatDateTime(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy, hh:mm a')
  } catch {
    return dateStr
  }
}

/**
 * Generate a sequential invoice number.
 * Example: INV-2026-0001
 */
export function generateInvoiceNumber(prefix: string, count: number): string {
  const year = new Date().getFullYear()
  return `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`
}

/**
 * Get up to 2 uppercase initials from a full name.
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
