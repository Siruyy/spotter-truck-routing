import { Star } from 'lucide-react'
import type { PlannedRoute } from '@/api/types'
import { RouteName } from '@/components/ui/RoadShield'
import { cn } from '@/lib/cn'
import { miles } from '@/lib/format'
import { clock, duration } from '@/lib/time'
import { TripStrip } from './TripStrip'

interface Props {
  route: PlannedRoute
  selected: boolean
  recommended: boolean
  fastestDuration: number
  onSelect: () => void
}

export function RouteCard({ route, selected, recommended, fastestDuration, onSelect }: Props) {
  const s = route.score
  const delta = route.duration_s - fastestDuration
  const stats = [
    { label: 'No travel', value: s.no_travel_mi, color: 'var(--color-stop)', show: s.no_travel_mi > 0 },
    { label: 'Severe', value: s.severe_mi, color: 'var(--color-sev)', show: true },
    { label: 'High', value: s.high_mi, color: 'var(--color-high)', show: true },
  ].filter((x) => x.show)

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'group w-full rounded-2xl border p-4 text-left transition-colors',
        selected ? 'border-fg/70 bg-raised' : 'border-line bg-panel hover:border-line-strong',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-lg font-display text-lg font-bold',
            selected ? 'bg-fg text-canvas' : 'bg-sunken text-fg',
          )}
          aria-hidden="true"
        >
          {route.id}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[22px] font-bold leading-none">{duration(route.duration_s)}</span>
            {delta > 60 && <span className="text-sm text-muted">+{duration(delta)}</span>}
            {recommended && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-signal px-2 py-0.5 font-display text-[13px] font-bold uppercase tracking-wide text-signal-ink">
                <Star className="size-3.5 fill-current" aria-hidden="true" /> Best
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-muted">
            {miles(route.distance_mi)} mi · arrive {clock(route.arrival, route.arrival_tz)}
          </div>
          <div className="mt-2">
            <RouteName name={route.name} />
          </div>
        </div>
      </div>

      <div className="mt-3.5">
        <TripStrip
          checkpoints={route.checkpoints}
          distance={route.distance_mi}
          label={`Route ${route.id} risk by mile: ${s.severe_mi.toFixed(0)} severe, ${s.high_mi.toFixed(0)} high-risk miles`}
        />
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {stats.map((x) => (
          <div key={x.label} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px]" style={{ background: x.color }} aria-hidden="true" />
            <dt className="text-muted">{x.label}</dt>
            <dd className={cn('font-semibold', x.value === 0 && 'text-muted')}>{miles(x.value)} mi</dd>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <dt className="text-muted">Avg risk</dt>
          <dd className="font-semibold">{s.avg_risk.toFixed(2)}</dd>
        </div>
        {s.unknown_mi > 0 && (
          <div className="flex items-center gap-1.5">
            <dt className="text-muted">No forecast</dt>
            <dd className="font-semibold">{miles(s.unknown_mi)} mi</dd>
          </div>
        )}
      </dl>
    </button>
  )
}
