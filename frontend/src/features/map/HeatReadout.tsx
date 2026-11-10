import type { Heatmap } from '@/api/types'
import { RiskChip } from '@/components/ui/RiskChip'
import { mph, rate } from '@/lib/format'
import { haversineMi } from '@/lib/geo'
import { dayHour } from '@/lib/time'
import { useUi } from '@/store/ui'

export interface ReadoutPos {
  x: number
  y: number
  lon: number
  lat: number
}

/** Nearest grid point to the cursor, if it is within ~0.75 grid cells. */
function nearestPoint(heat: Heatmap, lon: number, lat: number): number {
  let best = -1
  let bestD = Number.POSITIVE_INFINITY
  heat.points.forEach(([plat, plon], i) => {
    const d = (plat - lat) ** 2 + ((plon - lon) * Math.cos((lat * Math.PI) / 180)) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return Math.sqrt(bestD) <= heat.spacing * 0.75 ? best : -1
}

/**
 * Exact forecast values under the cursor for the slider hour, so the heatmap
 * can be read, not just looked at. Shows every condition, highlighting the
 * active layer.
 */
export function HeatReadout({ heat, pos, tz }: { heat: Heatmap | null; pos: ReadoutPos | null; tz: string }) {
  const hourF = useUi((s) => s.hour)
  const layer = useUi((s) => s.heatLayer)
  if (!heat || !pos) return null
  const p = nearestPoint(heat, pos.lon, pos.lat)
  if (p < 0) return null
  const n = heat.points.length
  const h = Math.min(heat.hours - 1, Math.round(hourF))
  const at = (key: keyof Heatmap['layers']) => {
    const v = heat.layers[key][h * n + p] as number
    return v < 0 ? null : v
  }
  const risk = at('risk')
  const wind = at('wind')
  const rain = at('rain')
  const snow = at('snow')
  const [plat, plon] = heat.points[p] as [number, number]
  const gridMi = Math.round(haversineMi([plon, plat], [plon + heat.spacing, plat]))
  const row = (key: string, label: string, value: string) => (
    <div className={`flex justify-between gap-4 ${layer === key ? 'font-semibold text-fg' : 'text-muted'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
  const flipX = pos.x > window.innerWidth - 260
  return (
    <div
      className="pointer-events-none absolute z-20 w-52 rounded-xl border border-line-strong bg-panel/95 p-3 text-[13px] shadow-[0_10px_30px_rgb(0_0_0/0.4)] backdrop-blur"
      style={{ left: pos.x + (flipX ? -224 : 16), top: pos.y + 16 }}
      role="status"
      aria-live="off"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-fg">{dayHour(heat.start + h * 3600, tz)}</span>
        <RiskChip level={risk as 0 | 1 | 2 | 3 | 4 | null} size="sm" />
      </div>
      {row('wind', 'Wind', mph(wind))}
      {row('rain', 'Rain', rate(rain))}
      {row('snow', 'Snow', rate(snow))}
      <div className="mt-2 border-t border-line pt-1.5 text-[11px] leading-snug text-faint">
        Area forecast, ~{gridMi} mi grid{heat.load_applied ? ', risk for your load' : ''}. Checkpoints use exact points.
      </div>
    </div>
  )
}
