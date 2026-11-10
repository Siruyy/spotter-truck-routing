import { createElement } from 'react'
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import { useConditions } from '@/api/hooks'
import type { Place, PointHour } from '@/api/types'
import { RiskChip } from '@/components/ui/RiskChip'
import { mph, rate, sky, temp } from '@/lib/format'
import { levelMeta } from '@/lib/risk'
import { cn } from '@/lib/cn'
import { clock } from '@/lib/time'

function skyIcon(code: number | null): LucideIcon {
  if (code === null) return Cloud
  if (code === 0 || code === 1) return Sun
  if (code === 2) return CloudSun
  if (code === 45 || code === 48) return CloudFog
  if (code >= 51 && code <= 57) return CloudDrizzle
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnow
  if (code >= 95) return CloudLightning
  return Cloud
}

function SkyIcon({ code, className }: { code: number | null; className?: string }) {
  return createElement(skyIcon(code), { className, 'aria-hidden': true })
}

function hourLabel(t: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric' }).format(t * 1000).replace(' ', '')
}

/** Worst level in the window, and when it starts, as plain words for screen readers and the summary line. */
function outlook(hours: PointHour[], tz: string): string {
  const scored = hours.filter((h) => h.level !== null)
  if (!scored.length) return 'No forecast available'
  const worst = scored.reduce((a, b) => ((b.level ?? 0) > (a.level ?? 0) ? b : a))
  if ((worst.level ?? 0) === 0) return 'Low risk for the next 12 hours'
  return `${levelMeta(worst.level).label} from ${hourLabel(worst.t, tz)} (${worst.factor ?? 'wind'})`
}

function PlaceConditions({ place, load, marker }: { place: Place; load: number; marker: 'origin' | 'destination' }) {
  const { data, isLoading, isError, isFetching } = useConditions(place, load)
  const now = data?.hours[0]
  return (
    <div className="anim-fade-up rounded-xl border border-line bg-raised/60 p-3">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            'shrink-0',
            marker === 'origin'
              ? 'size-2.5 rounded-full border-[2.5px] border-fg'
              : 'h-3 w-2.5 bg-fg [clip-path:polygon(0_0,100%_0,100%_62%,50%_100%,0_62%)]',
          )}
        />
        <span className="min-w-0 flex-1 truncate font-semibold">{place.label}</span>
        {now && (
          <span className="flex items-center gap-1.5 text-[15px]">
            <SkyIcon code={now.weather_code} className="size-[18px] text-muted" />
            <span className="font-display text-lg font-semibold">{temp(now.temp_f)}</span>
          </span>
        )}
      </div>

      {isLoading && <div className="mt-3 h-14 animate-pulse rounded-lg bg-sunken" aria-label="Loading conditions" />}
      {isError && <p className="mt-2 text-sm text-muted">Conditions are unavailable right now.</p>}

      {data && now && (
        <div className={cn('transition-opacity', isFetching && 'opacity-60')}>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span>{sky(now.weather_code) || 'Now'}</span>
            <span aria-hidden="true">·</span>
            <span>Wind {mph(now.wind_mph)}</span>
            {(now.rain_in_hr ?? 0) > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>Rain {rate(now.rain_in_hr)}</span>
              </>
            )}
            {(now.snow_in_hr ?? 0) > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>Snow {rate(now.snow_in_hr)}</span>
              </>
            )}
            <RiskChip level={now.level} size="sm" className="ml-auto" />
          </div>

          <div className="mt-3" role="img" aria-label={`Next 12 hours at ${place.label}: ${outlook(data.hours, data.tz)}`}>
            <div className="flex h-7 items-end gap-[3px]">
              {data.hours.slice(0, 13).map((h, i) => {
                const meta = levelMeta(h.level)
                const height = 35 + Math.min(65, ((h.wind_mph ?? 0) / 55) * 65)
                return (
                  <span
                    key={h.t}
                    title={`${clock(h.t, data.tz)} · ${meta.label} · wind ${mph(h.wind_mph)}`}
                    className="anim-grow flex-1 rounded-[3px]"
                    style={{ height: `${height}%`, background: meta.color, animationDelay: `${i * 25}ms` }}
                  />
                )
              })}
            </div>
            <div className="mt-1 flex justify-between text-[11px] font-medium text-faint">
              {data.hours
                .slice(0, 13)
                .filter((_, i) => i % 3 === 0)
                .map((h) => (
                  <span key={h.t}>{h === data.hours[0] ? 'Now' : hourLabel(h.t, data.tz)}</span>
                ))}
            </div>
            <p className="mt-1 text-xs text-muted">
              Next 12 h: <span className="font-semibold text-fg">{outlook(data.hours, data.tz)}</span>
              {data.load_applied ? ' · scored for your load' : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/** Live conditions at the trip ends, so the driver sees the weather before planning. */
export function ConditionsPreview({
  origin,
  destination,
  load,
}: {
  origin: Place | null
  destination: Place | null
  load: number
}) {
  return (
    <section aria-label="Current conditions" className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">Weather now · next 12 h</h2>
      {!origin && !destination && (
        <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-sm text-muted">
          Pick a start and destination to see conditions there.
        </p>
      )}
      {origin && <PlaceConditions place={origin} load={load} marker="origin" />}
      {destination && <PlaceConditions place={destination} load={load} marker="destination" />}
    </section>
  )
}
