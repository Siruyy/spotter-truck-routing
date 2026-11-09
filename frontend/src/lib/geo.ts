import type { Checkpoint, PlannedRoute } from '@/api/types'

const R_MI = 3958.7613

export function haversineMi(a: [number, number], b: [number, number]): number {
  // [lon, lat]
  const toRad = Math.PI / 180
  const dLat = (b[1] - a[1]) * toRad
  const dLon = (b[0] - a[0]) * toRad
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * R_MI * Math.asin(Math.min(1, Math.sqrt(h)))
}

export interface RouteTrack {
  coords: [number, number][]
  cumulative: number[] // miles along the drawn geometry
  scale: number // route distance / drawn length
  checkpoints: Checkpoint[]
}

export function buildTrack(route: PlannedRoute): RouteTrack {
  const cumulative = [0]
  for (let i = 1; i < route.geometry.length; i++) {
    cumulative.push(
      (cumulative[i - 1] as number) +
        haversineMi(route.geometry[i - 1] as [number, number], route.geometry[i] as [number, number]),
    )
  }
  const drawn = cumulative[cumulative.length - 1] || 1
  return {
    coords: route.geometry,
    cumulative,
    scale: route.distance_mi / drawn,
    checkpoints: route.checkpoints,
  }
}

function lowerIndex(arr: number[], v: number): number {
  let lo = 0
  let hi = arr.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((arr[mid] as number) <= v) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Point at `mile` along the route geometry. */
export function pointAtMile(track: RouteTrack, mile: number): [number, number] {
  const d = Math.max(0, mile / track.scale)
  const i = lowerIndex(track.cumulative, d)
  if (i >= track.coords.length - 1) return track.coords[track.coords.length - 1] as [number, number]
  const a = track.coords[i] as [number, number]
  const b = track.coords[i + 1] as [number, number]
  const span = (track.cumulative[i + 1] as number) - (track.cumulative[i] as number)
  const t = span > 0 ? (d - (track.cumulative[i] as number)) / span : 0
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/** Mile reached at epoch `t`, interpolating between checkpoint ETAs. null when not driving. */
export function mileAtTime(track: RouteTrack, t: number): number | null {
  const cps = track.checkpoints
  const first = cps[0]
  const last = cps[cps.length - 1]
  if (!first || !last || t < first.eta || t > last.eta) return null
  const etas = cps.map((c) => c.eta)
  const i = lowerIndex(etas, t)
  const a = cps[i] as Checkpoint
  const b = cps[Math.min(i + 1, cps.length - 1)] as Checkpoint
  if (b.eta === a.eta) return a.mile
  return a.mile + ((b.mile - a.mile) * (t - a.eta)) / (b.eta - a.eta)
}

/** Segments of the drawn line, each tagged with the owning checkpoint's level. */
export function riskSegments(route: PlannedRoute): { level: number; coords: [number, number][] }[] {
  const track = buildTrack(route)
  const cps = route.checkpoints
  if (cps.length < 2) return [{ level: cps[0]?.level ?? -1, coords: route.geometry }]
  const out: { level: number; coords: [number, number][] }[] = []
  for (let k = 0; k < cps.length; k++) {
    const cp = cps[k] as Checkpoint
    const prev = cps[k - 1]
    const next = cps[k + 1]
    const from = prev ? (prev.mile + cp.mile) / 2 : 0
    const to = next ? (cp.mile + next.mile) / 2 : cp.mile
    const coords = sliceByMiles(track, from, to)
    const level = cp.level ?? -1
    const last = out[out.length - 1]
    if (last && last.level === level) last.coords.push(...coords.slice(1))
    else out.push({ level, coords })
  }
  return out
}

function sliceByMiles(track: RouteTrack, fromMi: number, toMi: number): [number, number][] {
  const a = fromMi / track.scale
  const b = toMi / track.scale
  const pts: [number, number][] = [pointAtMile(track, fromMi)]
  for (let i = 0; i < track.coords.length; i++) {
    const c = track.cumulative[i] as number
    if (c > a && c < b) pts.push(track.coords[i] as [number, number])
  }
  pts.push(pointAtMile(track, toMi))
  return pts
}
