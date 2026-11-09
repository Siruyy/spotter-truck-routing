import { CloudRain, Eye, Snowflake, Thermometer, Wind } from 'lucide-react'
import type { Checkpoint } from '@/api/types'
import { RiskChip } from '@/components/ui/RiskChip'
import { mph, rate, sky, temp, visibility } from '@/lib/format'
import { FACTOR_LABEL } from '@/lib/risk'
import { clock, dayLabel } from '@/lib/time'

interface Props {
  checkpoint: Checkpoint
  routeId: string
  routeName: string
}

export function CheckpointDetails({ checkpoint: cp, routeId }: Props) {
  const w = cp.weather
  const rows = [
    { icon: Wind, label: 'Wind', value: `${mph(w?.wind_mph ?? null)}`, sub: w?.gust_mph != null ? `gusts ${mph(w.gust_mph)}` : '', key: 'wind' },
    { icon: CloudRain, label: 'Rain', value: rate(w?.rain_in_hr ?? null), sub: '', key: 'rain' },
    { icon: Snowflake, label: 'Snow', value: rate(w?.snow_in_hr ?? null), sub: '', key: 'snow' },
    { icon: Thermometer, label: 'Temp', value: temp(w?.temp_f ?? null), sub: '', key: 'temp' },
    { icon: Eye, label: 'Visibility', value: visibility(w?.visibility_mi ?? null), sub: '', key: 'vis' },
  ]
  return (
    <div className="min-w-[230px] text-[15px]">
      <div className="mb-1 flex items-baseline gap-2 pr-6">
        <span className="font-display text-lg font-bold">Mile {Math.round(cp.mile)}</span>
        <span className="text-sm text-muted">Route {routeId}</span>
      </div>
      <div className="mb-2.5 text-sm text-muted">
        {dayLabel(cp.eta, cp.tz)} · ETA <span className="font-semibold text-fg">{clock(cp.eta, cp.tz)}</span>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <RiskChip level={cp.level} />
        {cp.factor && cp.level !== null && cp.level > 0 && (
          <span className="text-sm text-muted">driven by {FACTOR_LABEL[cp.factor].toLowerCase()}</span>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        {rows.map((r) => (
          <div key={r.key} className="contents">
            <dt className="flex items-center gap-1.5 text-muted">
              <r.icon className="size-4" aria-hidden="true" />
              {r.label}
            </dt>
            <dd className={r.key === cp.factor && (cp.level ?? 0) > 0 ? 'font-semibold' : ''}>
              {r.value}
              {r.sub && <span className="text-muted"> · {r.sub}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {w?.weather_code != null && sky(w.weather_code) && <p className="mt-2 text-sm text-muted">{sky(w.weather_code)}</p>}
      {cp.gust_advisory && (
        <p className="mt-2 rounded-lg bg-high/15 px-2.5 py-1.5 text-sm font-medium">Gusts of 55+ mph expected. High-profile vehicles use caution.</p>
      )}
      {cp.level === null && <p className="mt-2 text-sm text-muted">The truck arrives after the end of the available forecast.</p>}
    </div>
  )
}
