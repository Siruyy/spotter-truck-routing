import type { Heatmap } from '@/api/types'
import { windVector } from '@/lib/wind'

export interface FieldSample {
  /** Air motion toward (east, north), unit vector. */
  ux: number
  uy: number
  speed: number // mph
  rain: number // in/hr
  snow: number // in/hr
}

/**
 * Bilinear sampler over the heatmap's coarse lattice for one hour. Missing
 * corners are skipped and weights renormalised; returns null outside the data.
 */
export class WeatherField {
  private readonly cells = new Map<number, number>()
  private readonly n: number
  private readonly spacing: number
  private hour = 0
  private readonly heat: Heatmap

  constructor(heat: Heatmap) {
    this.heat = heat
    this.n = heat.points.length
    this.spacing = heat.spacing
    const coarse = heat.fine_from ?? this.n
    for (let i = 0; i < coarse; i++) {
      const [lat, lon] = heat.points[i] as [number, number]
      this.cells.set(Math.round(lat / this.spacing) * 100_000 + Math.round(lon / this.spacing), i)
    }
  }

  setHour(hour: number): void {
    this.hour = Math.min(this.heat.hours - 1, Math.max(0, Math.round(hour)))
  }

  sample(lon: number, lat: number): FieldSample | null {
    const fi = lat / this.spacing
    const fj = lon / this.spacing
    const i0 = Math.floor(fi)
    const j0 = Math.floor(fj)
    const ti = fi - i0
    const tj = fj - j0
    const L = this.heat.layers
    const base = this.hour * this.n
    let wsum = 0
    let ex = 0
    let ny = 0
    let speed = 0
    let rain = 0
    let snow = 0
    for (let c = 0; c < 4; c++) {
      const di = c >> 1
      const dj = c & 1
      const idx = this.cells.get((i0 + di) * 100_000 + (j0 + dj))
      if (idx === undefined) continue
      const s = L.wind[base + idx] as number
      if (s < 0) continue
      const w = (di ? ti : 1 - ti) * (dj ? tj : 1 - tj)
      const dir = L.wind_dir ? (L.wind_dir[base + idx] as number) : -1
      if (dir >= 0) {
        const [x, y] = windVector(dir)
        ex += x * w
        ny += y * w
      }
      speed += s * w
      rain += Math.max(0, L.rain[base + idx] as number) * w
      snow += Math.max(0, L.snow[base + idx] as number) * w
      wsum += w
    }
    if (wsum < 0.15) return null
    const len = Math.hypot(ex, ny) || 1
    return { ux: ex / len, uy: ny / len, speed: speed / wsum, rain: rain / wsum, snow: snow / wsum }
  }
}
