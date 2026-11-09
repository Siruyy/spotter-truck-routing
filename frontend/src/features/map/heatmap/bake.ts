/**
 * Turn a sparse lattice of hourly values into colored RGBA rasters.
 *
 * Grid points sit on a regular lat/lon lattice (with holes outside the route
 * corridor), so each pixel is a bilinear blend of up to four lattice corners,
 * renormalised over the corners that exist. Missing corners fade the alpha,
 * which gives the corridor a soft edge. Rows are laid out linearly in Web
 * Mercator Y so the image lines up when drawn as a deck.gl BitmapLayer.
 */
import type { HeatLayer } from '@/api/types'
import { riskRgb } from '@/lib/risk'

export interface BakeInput {
  layer: HeatLayer
  hours: number
  spacing: number
  bbox: [number, number, number, number]
  points: [number, number][]
  values: number[] // hour-major, -1 = missing
  width: number
  height: number
}

export type Rgba = [number, number, number, number]

const RAMPS: Record<Exclude<HeatLayer, 'risk'>, { max: number; stops: [number, Rgba][] }> = {
  wind: {
    max: 60,
    stops: [
      [0, [94, 196, 222, 0]],
      [10, [94, 196, 222, 0]],
      [18, [94, 196, 222, 90]],
      [25, [233, 196, 106, 150]],
      [35, [244, 137, 44, 190]],
      [45, [224, 65, 47, 215]],
      [55, [168, 85, 199, 235]],
    ],
  },
  rain: {
    max: 1.2,
    stops: [
      [0, [91, 155, 213, 0]],
      [0.02, [91, 155, 213, 70]],
      [0.1, [80, 170, 230, 150]],
      [0.25, [233, 196, 106, 190]],
      [0.5, [224, 65, 47, 215]],
      [1.0, [168, 85, 199, 235]],
    ],
  },
  snow: {
    max: 3.5,
    stops: [
      [0, [220, 230, 255, 0]],
      [0.05, [220, 230, 255, 80]],
      [0.5, [180, 205, 255, 170]],
      [1.0, [233, 196, 106, 200]],
      [2.0, [224, 65, 47, 220]],
      [3.0, [168, 85, 199, 240]],
    ],
  },
}

export function colorFor(layer: HeatLayer, v: number): Rgba {
  if (layer === 'risk') {
    const [r, g, b] = riskRgb(v)
    // Low risk is a faint wash so the basemap reads through; hazards are bold.
    const t = Math.min(4, Math.max(0, v))
    const a = t < 1 ? 28 + t * 92 : 120 + (t - 1) * 30
    return [r, g, b, a]
  }
  const { stops } = RAMPS[layer]
  const first = stops[0] as [number, Rgba]
  if (v <= first[0]) return first[1]
  for (let i = 1; i < stops.length; i++) {
    const [x1, c1] = stops[i] as [number, Rgba]
    const [x0, c0] = stops[i - 1] as [number, Rgba]
    if (v <= x1) {
      const t = (v - x0) / (x1 - x0)
      return [
        c0[0] + (c1[0] - c0[0]) * t,
        c0[1] + (c1[1] - c0[1]) * t,
        c0[2] + (c1[2] - c0[2]) * t,
        c0[3] + (c1[3] - c0[3]) * t,
      ]
    }
  }
  return (stops[stops.length - 1] as [number, Rgba])[1]
}

export function mercY(lat: number): number {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180)
  return 0.5 * Math.log((1 + s) / (1 - s))
}

function latFromMercY(y: number): number {
  return (Math.atan(Math.sinh(y)) * 180) / Math.PI
}

/** Index lattice cells: key i*100000+j (integer multiples of spacing) -> point index. */
function lattice(points: [number, number][], spacing: number): Map<number, number> {
  const map = new Map<number, number>()
  points.forEach(([lat, lon], idx) => {
    map.set(Math.round(lat / spacing) * 100_000 + Math.round(lon / spacing), idx)
  })
  return map
}

const KERNEL_REACH = 2 // lattice cells searched in each direction
const SIGMA_CELLS = 0.85 // Gaussian width, in lattice cells

/**
 * Bake one frame per hour. Each pixel is a Gaussian-weighted average of nearby
 * lattice values, so the field is smooth and the corridor edge fades out
 * instead of stair-stepping. Weights are shared across hours, so per-hour work
 * is a weighted sum. Returns premultiplied-ready straight RGBA bytes.
 */
export function bakeFrames(input: BakeInput): Uint8ClampedArray[] {
  const { width, height, bbox, spacing, points, values, hours, layer } = input
  const [west, south, east, north] = bbox
  const n = points.length
  const cells = lattice(points, spacing)
  const yTop = mercY(north)
  const yBottom = mercY(south)
  const k = KERNEL_REACH * 2 + 1
  const slots = k * k
  const pixelCount = width * height
  const idxs = new Int32Array(pixelCount * slots).fill(-1)
  const weights = new Float32Array(pixelCount * slots)
  const coverage = new Float32Array(pixelCount)
  const twoSigma2 = 2 * SIGMA_CELLS * SIGMA_CELLS

  for (let py = 0; py < height; py++) {
    const lat = latFromMercY(yTop + ((yBottom - yTop) * (py + 0.5)) / height)
    const fi = lat / spacing
    const ci = Math.round(fi)
    // Longitude cells shrink with latitude; measure distance in ground units.
    const lonScale = Math.cos((lat * Math.PI) / 180)
    for (let px = 0; px < width; px++) {
      const lon = west + ((east - west) * (px + 0.5)) / width
      const fj = lon / spacing
      const cj = Math.round(fj)
      const p = py * width + px
      let slot = 0
      let cover = 0
      for (let di = -KERNEL_REACH; di <= KERNEL_REACH; di++) {
        for (let dj = -KERNEL_REACH; dj <= KERNEL_REACH; dj++) {
          const idx = cells.get((ci + di) * 100_000 + (cj + dj))
          if (idx !== undefined) {
            const dy = ci + di - fi
            const dx = (cj + dj - fj) * lonScale
            const w = Math.exp(-(dx * dx + dy * dy) / twoSigma2)
            idxs[p * slots + slot] = idx
            weights[p * slots + slot] = w
            cover += w
          }
          slot++
        }
      }
      coverage[p] = cover
    }
  }

  const frames: Uint8ClampedArray[] = []
  for (let h = 0; h < hours; h++) {
    const out = new Uint8ClampedArray(pixelCount * 4)
    const offset = h * n
    for (let p = 0; p < pixelCount; p++) {
      if ((coverage[p] as number) < 0.05) continue
      let sum = 0
      let wsum = 0
      const base = p * slots
      for (let s = 0; s < slots; s++) {
        const idx = idxs[base + s] as number
        if (idx < 0) continue
        const v = values[offset + idx] as number
        if (v < 0) continue
        const w = weights[base + s] as number
        sum += v * w
        wsum += w
      }
      if (wsum < 0.05) continue
      const [r, g, b, a] = colorFor(layer, sum / wsum)
      // Fade out where the corridor thins (coverage ~1 inside, -> 0 at the edge).
      const edge = Math.min(1, Math.max(0, (wsum - 0.05) / 0.6))
      const o = p * 4
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = a * edge
    }
    frames.push(out)
  }
  return frames
}

/** Raster extent: the lattice points plus room for the kernel to fade out. */
export function rasterBounds(h: { points: [number, number][]; spacing: number }): [number, number, number, number] {
  let s = 90
  let n = -90
  let w = 180
  let e = -180
  for (const [lat, lon] of h.points) {
    s = Math.min(s, lat)
    n = Math.max(n, lat)
    w = Math.min(w, lon)
    e = Math.max(e, lon)
  }
  const pad = h.spacing * (KERNEL_REACH + 0.5)
  return [w - pad, Math.max(-84, s - pad), e + pad, Math.min(84, n + pad)]
}

/** Raster size that keeps roughly square pixels in Mercator, capped for speed. */
export function rasterSize(bbox: [number, number, number, number], maxSide = 256): [number, number] {
  const [west, south, east, north] = bbox
  const w = ((east - west) * Math.PI) / 180
  const h = mercY(north) - mercY(south)
  if (w >= h) return [maxSide, Math.max(16, Math.round((maxSide * h) / w))]
  return [Math.max(16, Math.round((maxSide * w) / h)), maxSide]
}
