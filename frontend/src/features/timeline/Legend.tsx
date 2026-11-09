import type { HeatLayer } from '@/api/types'
import { colorFor } from '@/features/map/heatmap/bake'
import { LEVELS } from '@/lib/risk'

const SCALES: Record<Exclude<HeatLayer, 'risk'>, { stops: number[]; unit: string; labels: [number, string][] }> = {
  wind: { stops: [10, 20, 25, 30, 35, 40, 45, 50, 55, 60], unit: 'mph', labels: [[25, '25'], [35, '35'], [45, '45'], [55, '55 mph']] },
  rain: { stops: [0.02, 0.05, 0.1, 0.18, 0.25, 0.4, 0.5, 0.75, 1.0], unit: 'in/hr', labels: [[0.1, '0.1'], [0.25, '0.25'], [0.5, '0.5'], [1.0, '1 in/hr']] },
  snow: { stops: [0.05, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0], unit: 'in/hr', labels: [[0.5, '0.5'], [1, '1'], [2, '2'], [3, '3 in/hr']] },
}

export function Legend({ layer }: { layer: HeatLayer }) {
  if (layer === 'risk') {
    return (
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" aria-label="Risk legend">
        {LEVELS.map((l) => (
          <li key={l.level} className="flex items-center gap-1.5">
            <span className="size-3 rounded-[3px]" style={{ background: l.color }} aria-hidden="true" />
            <span className="text-muted">{l.label}</span>
          </li>
        ))}
      </ul>
    )
  }
  const scale = SCALES[layer]
  const min = scale.stops[0] as number
  const max = scale.stops[scale.stops.length - 1] as number
  const gradient = scale.stops
    .map((v) => {
      const [r, g, b] = colorFor(layer, v)
      return `rgb(${r} ${g} ${b}) ${((v - min) / (max - min)) * 100}%`
    })
    .join(', ')
  return (
    <div className="w-56" aria-label={`${layer} legend in ${scale.unit}`}>
      <div className="h-2.5 rounded-full" style={{ background: `linear-gradient(90deg, ${gradient})` }} />
      <div className="relative mt-1 h-3.5 text-[11px] text-muted">
        {scale.labels.map(([v, label]) => (
          <span key={label} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${((v - min) / (max - min)) * 100}%` }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
