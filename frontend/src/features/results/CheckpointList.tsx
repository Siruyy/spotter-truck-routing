import { ChevronDown, CloudRain, Snowflake, Wind } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Checkpoint, PlannedRoute } from '@/api/types'
import { RiskChip } from '@/components/ui/RiskChip'
import { cn } from '@/lib/cn'
import { mph, rate } from '@/lib/format'
import { clock, sameDay, dayLabel } from '@/lib/time'
import { useUi } from '@/store/ui'
import { CheckpointDetails } from './CheckpointDetails'

const FACTOR_ICON = { wind: Wind, rain: CloudRain, snow: Snowflake } as const

function driver(cp: Checkpoint): string {
  const w = cp.weather
  if (!w || cp.level === null) return 'No forecast'
  if (cp.factor === 'snow' && (w.snow_in_hr ?? 0) > 0) return `Snow ${rate(w.snow_in_hr)}`
  if (cp.factor === 'rain' && (w.rain_in_hr ?? 0) > 0) return `Rain ${rate(w.rain_in_hr)}`
  return `Wind ${mph(w.wind_mph)}`
}

export function CheckpointList({ route }: { route: PlannedRoute }) {
  const focus = useUi((s) => s.focus)
  const setFocus = useUi((s) => s.setFocus)
  const refs = useRef(new Map<number, HTMLLIElement>())

  useEffect(() => {
    if (focus?.source === 'map' && focus.routeId === route.id) {
      refs.current.get(focus.index)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [focus, route.id])

  return (
    <ol className="flex flex-col" aria-label={`Weather checkpoints on route ${route.id}`}>
      {route.checkpoints.map((cp, k) => {
        const open = focus?.routeId === route.id && focus.index === cp.i
        const prev = route.checkpoints[k - 1]
        const newDay = !prev || !sameDay(prev.eta, cp.eta, cp.tz)
        const Icon = cp.factor ? FACTOR_ICON[cp.factor] : Wind
        return (
          <li
            key={cp.i}
            ref={(el) => {
              if (el) refs.current.set(cp.i, el)
              else refs.current.delete(cp.i)
            }}
          >
            {newDay && (
              <div className="px-1 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-wider text-faint">
                {dayLabel(cp.eta, cp.tz)}
              </div>
            )}
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setFocus(open ? null : { routeId: route.id, index: cp.i, source: 'list' })}
              className={cn(
                'grid w-full grid-cols-[3.25rem_1fr_auto_1.25rem] items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-150',
                open ? 'bg-raised' : 'hover:bg-raised/60',
              )}
            >
              <span className="font-display text-[15px] font-semibold text-muted">
                {k === 0 ? 'Start' : k === route.checkpoints.length - 1 ? 'End' : `${Math.round(cp.mile)} mi`}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{clock(cp.eta, cp.tz)}</span>
                <span className="flex items-center gap-1 truncate text-sm text-muted">
                  <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                  {driver(cp)}
                  {cp.gust_advisory && <span className="ml-1 text-high">· gusts 55+</span>}
                </span>
              </span>
              <RiskChip level={cp.level} size="sm" />
              <ChevronDown className={cn('size-4 text-faint transition-transform', open && 'rotate-180')} aria-hidden="true" />
            </button>
            {open && (
              <div className="anim-fade-up mx-2 mb-2 mt-1 rounded-xl border border-line bg-panel p-3.5">
                <CheckpointDetails checkpoint={cp} routeId={route.id} routeName={route.name} />
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
