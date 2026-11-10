import { useMutation } from '@tanstack/react-query'
import { Check, Info, Link2, Loader2, Pencil } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/api/client'
import type { IntervalMi, Plan } from '@/api/types'
import { Segmented } from '@/components/ui/Segmented'
import { pounds } from '@/lib/format'
import { saveLastTrip } from '@/lib/persist'
import { relativeClock } from '@/lib/time'
import { selectedRoute, useUi } from '@/store/ui'
import { AlertsPanel } from './AlertsPanel'
import { CheckpointList } from './CheckpointList'
import { DepartureTip } from './DepartureTip'
import { RouteCard } from './RouteCard'
import { Verdict } from './Verdict'

function ShareButton({ plan }: { plan: Plan }) {
  const interval = useUi((s) => s.interval)
  const [copied, setCopied] = useState(false)
  const share = useMutation({
    mutationFn: () => api.share(plan.id, interval),
    onSuccess: async ({ slug }) => {
      const url = `${window.location.origin}/t/${slug}`
      try {
        if (navigator.share && matchMedia('(pointer: coarse)').matches) {
          await navigator.share({ title: 'Truck route plan', url })
        } else {
          await navigator.clipboard.writeText(url)
        }
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      } catch {
        window.prompt('Copy this link', url)
      }
    },
  })
  return (
    <button
      type="button"
      onClick={() => share.mutate()}
      disabled={share.isPending}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-3.5 font-semibold text-muted hover:border-line-strong hover:text-fg"
    >
      {share.isPending ? <Loader2 className="size-4 animate-spin" /> : copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
      {copied ? 'Link copied' : share.isError ? 'Try again' : 'Share'}
    </button>
  )
}

interface Props {
  plan: Plan
  onEdit: () => void
}

export function ResultsPanel({ plan, onEdit }: Props) {
  const route = useUi(selectedRoute)
  const selectRoute = useUi((s) => s.selectRoute)
  const interval = useUi((s) => s.interval)
  const setIntervalMi = useUi((s) => s.setInterval)
  const setPlan = useUi((s) => s.setPlan)
  const planOrigin = useUi((s) => s.planOrigin)
  const sharedAt = useUi((s) => s.sharedAt)
  const tz = plan.routes[0]?.checkpoints[0]?.tz ?? 'UTC'
  const fastest = Math.min(...plan.routes.map((r) => r.duration_s))

  const resample = useMutation({
    mutationFn: (i: IntervalMi) => api.resample(plan.id, i),
    onSuccess: (p) => {
      const keep = useUi.getState().selectedRouteId
      setPlan(p, planOrigin, sharedAt)
      if (keep) selectRoute(keep)
      void saveLastTrip(p)
    },
  })
  const live = planOrigin === 'live'

  return (
    <div className="flex flex-col gap-4">
      <header className="anim-fade-up flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[21px] font-bold leading-tight">
            <span className="truncate">{plan.request.origin.label}</span>
            <span className="mx-1.5 text-faint" aria-label="to">→</span>
            <span className="truncate">{plan.request.destination.label}</span>
          </h2>
          <p className="mt-0.5 text-[15px] text-muted">
            Leaves {relativeClock(plan.request.departure_epoch, tz)} · {pounds(plan.request.load_lb)}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 font-semibold text-muted hover:border-line-strong hover:text-fg"
        >
          <Pencil className="size-4" aria-hidden="true" /> Edit
        </button>
      </header>

      {planOrigin === 'shared' && (
        <p className="flex items-start gap-2 rounded-xl bg-sunken px-3.5 py-2.5 text-sm text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Shared snapshot{sharedAt ? ` from ${new Date(sharedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}. Re-plan for the latest forecast.
        </p>
      )}
      {planOrigin === 'offline' && (
        <p className="flex items-start gap-2 rounded-xl bg-sunken px-3.5 py-2.5 text-sm text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          You’re offline. Showing your last trip, planned {new Date(plan.created_at * 1000).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}. Map tiles may be missing.
        </p>
      )}
      {plan.weather.stale_as_of && (
        <p className="rounded-xl bg-sunken px-3.5 py-2.5 text-sm text-muted">
          Live forecast is unavailable. Using data from {new Date(plan.weather.stale_as_of * 1000).toLocaleTimeString('en-US', { timeStyle: 'short' })}.
        </p>
      )}
      {plan.weather.provider === 'nws' && (
        <p className="rounded-xl bg-sunken px-3.5 py-2.5 text-sm text-muted">
          Using National Weather Service data. Rain and snow are 6-hour average rates.
        </p>
      )}

      <div className="anim-fade-up" style={{ animationDelay: '80ms' }}>
        <Verdict plan={plan} />
      </div>
      <DepartureTip plan={plan} tz={tz} />
      {live && <AlertsPanel planId={plan.id} />}

      <section aria-label="Route options" className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
            {plan.routes.length} route{plan.routes.length > 1 ? 's' : ''}
          </h3>
          {live && <ShareButton plan={plan} />}
        </div>
        {plan.notices.map((n) => (
          <p key={n} className="text-sm text-muted">
            {n}
          </p>
        ))}
        {plan.routes.map((r, i) => (
          <div key={r.id} className="anim-fade-up" style={{ animationDelay: `${160 + i * 70}ms` }}>
          <RouteCard
            route={r}
            selected={r.id === route?.id}
            recommended={r.id === plan.recommendation.route_id}
            fastestDuration={fastest}
            onSelect={() => selectRoute(r.id)}
          />
          </div>
        ))}
      </section>

      {route && (
        <section aria-label="Checkpoints" className="anim-fade-up flex flex-col gap-2" style={{ animationDelay: '380ms' }}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
              Route {route.id} · {route.checkpoints.length} checkpoints
            </h3>
            {live && (
              <Segmented
                size="sm"
                label="Checkpoint spacing"
                value={interval}
                className="w-48"
                onChange={(i) => {
                  setIntervalMi(i)
                  resample.mutate(i)
                }}
                options={[
                  { value: 10, label: '10', ariaLabel: 'Every 10 miles' },
                  { value: 25, label: '25', ariaLabel: 'Every 25 miles' },
                  { value: 50, label: '50 mi', ariaLabel: 'Every 50 miles' },
                ]}
              />
            )}
          </div>
          <div className={resample.isPending ? 'opacity-50 transition-opacity' : ''}>
            <CheckpointList route={route} />
          </div>
        </section>
      )}
    </div>
  )
}
