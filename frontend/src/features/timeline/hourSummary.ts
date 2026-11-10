import type { Heatmap, HeatLayer } from '@/api/types'
import { levelMeta } from '@/lib/risk'

/** One line describing the forecast field at an hour, so a calm (all-Low) map reads as calm, not empty. */
export function hourSummary(heat: Heatmap, hour: number, layer: HeatLayer): string {
  const n = heat.points.length
  const h = Math.min(heat.hours - 1, Math.max(0, Math.round(hour)))
  const slice = (key: HeatLayer) => heat.layers[key].slice(h * n, h * n + n).filter((v) => v >= 0)
  const risk = slice('risk')
  if (!risk.length) return 'No forecast for this hour'
  const worst = Math.max(...risk)
  const share = risk.filter((v) => v === worst).length / risk.length
  const maxWind = Math.max(...slice('wind'))
  const maxRain = Math.max(...slice('rain'))
  const maxSnow = Math.max(...slice('snow'))
  if (layer === 'wind') return `This hour: wind up to ${Math.round(maxWind)} mph across the area`
  if (layer === 'rain') return maxRain > 0.004 ? `This hour: rain up to ${maxRain.toFixed(2)} in/hr` : 'This hour: no rain in the area'
  if (layer === 'snow') return maxSnow > 0.004 ? `This hour: snow up to ${maxSnow.toFixed(2)} in/hr` : 'This hour: no snow in the area'
  if (worst === 0) return `This hour: all Low across the area (wind up to ${Math.round(maxWind)} mph)`
  const pct = Math.max(1, Math.round(share * 100))
  return `This hour: worst is ${levelMeta(worst as 0 | 1 | 2 | 3 | 4).label} (${pct}% of the area)`
}
