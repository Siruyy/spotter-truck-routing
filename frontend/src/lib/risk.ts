import type { Factor, RiskLevel } from '@/api/types'

/**
 * Risk palette: an ordered ramp that avoids a red/green pair, so it stays
 * distinguishable under deuteranopia and protanopia. Color is never the only
 * signal: every level also has a glyph, a text label and a map dash pattern.
 */
export interface LevelMeta {
  level: RiskLevel
  label: string
  short: string
  color: string
  ink: string // text color on top of `color`
  dash: number[] | null // map line dash (in line widths); null = solid
  glyph: 'ok' | 'caution' | 'warn' | 'danger' | 'stop'
}

export const LEVELS: readonly LevelMeta[] = [
  { level: 0, label: 'Low', short: 'LOW', color: '#5b9bd5', ink: '#06121f', dash: null, glyph: 'ok' },
  { level: 1, label: 'Moderate', short: 'MOD', color: '#e9c46a', ink: '#1d1503', dash: [4, 1.5], glyph: 'caution' },
  { level: 2, label: 'High', short: 'HIGH', color: '#f4892c', ink: '#1f0e01', dash: [2, 1.2], glyph: 'warn' },
  { level: 3, label: 'Severe', short: 'SEV', color: '#e0412f', ink: '#ffffff', dash: [1, 1], glyph: 'danger' },
  { level: 4, label: 'No Travel', short: 'STOP', color: '#a855c7', ink: '#ffffff', dash: [0.4, 1.2], glyph: 'stop' },
] as const

export const UNKNOWN_META = {
  label: 'No forecast',
  short: 'N/A',
  color: '#6b7178',
  ink: '#ffffff',
} as const

export function levelMeta(level: RiskLevel | null): LevelMeta | typeof UNKNOWN_META {
  return level === null ? UNKNOWN_META : (LEVELS[level] as LevelMeta)
}

export const FACTOR_LABEL: Record<Factor, string> = {
  wind: 'Wind',
  rain: 'Rain',
  snow: 'Snow',
}

/** Continuous risk score (0..4) -> RGB, blending neighbouring level colors. */
export function riskRgb(value: number): [number, number, number] {
  const v = Math.min(4, Math.max(0, value))
  const lo = Math.floor(v)
  const hi = Math.min(4, lo + 1)
  const t = v - lo
  const a = hexToRgb((LEVELS[lo] as LevelMeta).color)
  const b = hexToRgb((LEVELS[hi] as LevelMeta).color)
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
