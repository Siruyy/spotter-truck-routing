import { Ban, ShieldCheck, TriangleAlert } from 'lucide-react'
import type { Plan } from '@/api/types'
import { RouteName } from '@/components/ui/RoadShield'
import { miles } from '@/lib/format'
import { duration } from '@/lib/time'

/** The two-second answer: which route, and why. */
export function Verdict({ plan }: { plan: Plan }) {
  const best = plan.routes.find((r) => r.id === plan.recommendation.route_id)
  if (!best) return null
  const fastest = Math.min(...plan.routes.map((r) => r.duration_s))
  const delta = best.duration_s - fastest
  const s = best.score
  const allBlocked = plan.routes.every((r) => r.score.no_travel_mi > 0)

  if (allBlocked) {
    return (
      <section aria-live="polite" className="rounded-2xl border border-stop/60 bg-stop/12 p-4">
        <div className="flex items-center gap-2.5 font-display text-[22px] font-bold uppercase leading-tight">
          <Ban className="size-6 shrink-0" style={{ color: 'var(--color-stop)' }} aria-hidden="true" />
          No safe route at this time
        </div>
        <p className="mt-1.5 text-[15px] text-muted">
          Every route crosses No Travel conditions for this load. Least exposed: Route {best.id} with{' '}
          {miles(s.no_travel_mi)} no-travel miles. Try a later departure.
        </p>
      </section>
    )
  }

  const risky = s.severe_mi > 0 || s.high_mi > 0
  const Icon = risky ? TriangleAlert : ShieldCheck
  return (
    <section aria-live="polite" className="rounded-2xl border-2 border-signal bg-signal/8 p-4">
      <div className="text-[13px] font-semibold uppercase tracking-wider text-muted">Recommended</div>
      <div className="mt-1 flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-signal font-display text-2xl font-bold text-signal-ink">
          {best.id}
        </span>
        <div className="min-w-0">
          <div className="font-display text-[26px] font-bold leading-none">Take Route {best.id}</div>
          <div className="mt-1.5">
            <RouteName name={best.name} />
          </div>
        </div>
      </div>
      <p className="mt-3 flex items-start gap-2 text-[16px] leading-snug">
        <Icon
          className="mt-0.5 size-5 shrink-0"
          style={{ color: risky ? 'var(--color-high)' : 'var(--color-low)' }}
          aria-hidden="true"
        />
        <span>
          <span className="font-semibold">{plan.recommendation.reason}.</span>{' '}
          <span className="text-muted">
            {miles(s.severe_mi)} severe · {miles(s.high_mi)} high-risk mi ·{' '}
            {delta > 60 ? `+${duration(delta)} vs fastest` : 'fastest option'}
          </span>
        </span>
      </p>
    </section>
  )
}
