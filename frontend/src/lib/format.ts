export const SATS_PER_BTC = 100_000_000

/** 2_100_000 -> "0.021". Keeps at least three decimals so amounts line up. */
export function btc(sats: number): string {
  const fixed = (Math.abs(sats) / SATS_PER_BTC).toFixed(8)
  const [whole, frac] = fixed.split('.')
  const trimmed = frac.replace(/0+$/, '').padEnd(3, '0')
  return `${sats < 0 ? '-' : ''}${whole}.${trimmed}`
}

export function sats(value: number): string {
  return `${Math.round(value).toLocaleString('en-GB')} sats`
}

/** Parses a BTC amount typed by a person. Returns null when it is not a number. */
export function parseBtcToSats(input: string): number | null {
  const v = input.trim().replace(/,/g, '')
  if (!/^\d*\.?\d*$/.test(v) || v === '' || v === '.') return null
  const [whole, frac = ''] = v.split('.')
  if (frac.length > 8) return null
  return Number(whole || '0') * SATS_PER_BTC + Number(frac.padEnd(8, '0'))
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

export function date(iso: string): string {
  return dateFmt.format(new Date(iso))
}

export function dateTime(iso: string): string {
  const d = new Date(iso)
  return `${dateFmt.format(d)}, ${timeFmt.format(d)}`
}

export function relative(iso: string, now = Date.now()): string {
  const diff = Math.round((now - new Date(iso).getTime()) / 1000)
  if (diff < 45) return 'just now'
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`
  const days = Math.round(diff / 86400)
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`
  return date(iso)
}

/** bcrt1qk2nscarx...a4z7ksawg9x8 style shortening for tight spaces. */
export function shortHash(value: string, head = 10, tail = 8): string {
  if (value.length <= head + tail + 1) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function ruleSentence(m: number, n: number): string {
  return `${m} of ${n} signers must approve`
}
