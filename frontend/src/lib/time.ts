import tzLookup from '@photostructure/tz-lookup'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'

export const HOUR_S = 3600

export function browserTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/** IANA timezone for a coordinate (offline lookup), falling back to the browser's. */
export function tzAt(lat: number, lon: number): string {
  try {
    return tzLookup(lat, lon)
  } catch {
    return browserTz()
  }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function fmt(tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = tz + JSON.stringify(opts)
  let f = fmtCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts })
    fmtCache.set(key, f)
  }
  return f
}

/** "3:40 PM CST" */
export function clock(epochS: number, tz: string, withZone = true): string {
  return fmt(tz, {
    hour: 'numeric',
    minute: '2-digit',
    ...(withZone ? { timeZoneName: 'short' } : {}),
  }).format(epochS * 1000)
}

/** "Tue 3 PM" */
export function dayHour(epochS: number, tz: string): string {
  return fmt(tz, { weekday: 'short', hour: 'numeric' }).format(epochS * 1000)
}

/** "Tue, Nov 10" */
export function dayLabel(epochS: number, tz: string): string {
  return fmt(tz, { weekday: 'short', month: 'short', day: 'numeric' }).format(epochS * 1000)
}

export function zoneAbbr(epochS: number, tz: string): string {
  const parts = fmt(tz, { timeZoneName: 'short' }).formatToParts(epochS * 1000)
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz
}

/** Same calendar day in `tz`? */
export function sameDay(a: number, b: number, tz: string): boolean {
  const f = fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit' })
  return f.format(a * 1000) === f.format(b * 1000)
}

/** "Today 3:40 PM CST", "Tomorrow 6:00 AM MST", or "Wed 6:00 AM MST". */
export function relativeClock(epochS: number, tz: string, nowS = Date.now() / 1000): string {
  const time = clock(epochS, tz)
  if (sameDay(epochS, nowS, tz)) return `Today ${time}`
  if (sameDay(epochS, nowS + 86_400, tz)) return `Tomorrow ${time}`
  return `${fmt(tz, { weekday: 'short' }).format(epochS * 1000)} ${time}`
}

/** Epoch of the next occurrence of hh:00 local time in `tz` (tomorrow if `tomorrow`). */
export function localHourEpoch(hour: number, tz: string, tomorrow: boolean, nowS = Date.now() / 1000): number {
  const zoned = toZonedTime(nowS * 1000, tz)
  zoned.setDate(zoned.getDate() + (tomorrow ? 1 : 0))
  zoned.setHours(hour, 0, 0, 0)
  return fromZonedTime(zoned, tz).getTime() / 1000
}

/** <input type="datetime-local"> value for an epoch, in `tz`. */
export function toLocalInput(epochS: number, tz: string): string {
  const d = toZonedTime(epochS * 1000, tz)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Parse a datetime-local value as wall time in `tz`. */
export function fromLocalInput(value: string, tz: string): number | null {
  if (!value) return null
  const ms = fromZonedTime(value, tz).getTime()
  return Number.isFinite(ms) ? ms / 1000 : null
}

export function duration(seconds: number): string {
  const m = Math.round(seconds / 60)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h ? `${h} h ${String(mm).padStart(2, '0')} m` : `${mm} m`
}
