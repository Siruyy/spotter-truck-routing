import { Clock3, Loader2 } from 'lucide-react'
import { ApiError } from '@/api/client'
import { useCreatePlan } from '@/api/hooks'
import type { Plan } from '@/api/types'
import { saveLastTrip } from '@/lib/persist'
import { relativeClock } from '@/lib/time'
import { useUi } from '@/store/ui'

/** "Leave at 2 PM -> 0 severe miles": re-plans with the suggested departure on tap. */
export function DepartureTip({ plan, tz }: { plan: Plan; tz: string }) {
  const s = plan.departure_suggestion
  const setPlan = useUi((st) => st.setPlan)
  const mutation = useCreatePlan()
  if (!s) return null
  const replan = () =>
    mutation.mutate(
      {
        origin: plan.request.origin,
        destination: plan.request.destination,
        departure_at: new Date(Math.max(s.departure * 1000, Date.now())).toISOString(),
        load_lb: plan.request.load_lb,
        interval_mi: plan.request.interval_mi,
      },
      {
        onSuccess: (p) => {
          setPlan(p)
          void saveLastTrip(p)
        },
      },
    )
  return (
    <section className="rounded-2xl border border-low/50 bg-low/10 p-4">
      <div className="flex items-start gap-3">
        <Clock3 className="mt-0.5 size-5 shrink-0" style={{ color: 'var(--color-low)' }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            Leaving {s.offset_h} h later is safer
          </div>
          <p className="mt-0.5 text-[15px] text-muted">
            Depart {relativeClock(s.departure, tz)} → Route {s.route_id} has {s.summary}. Traffic for the new time is
            rechecked when you re-plan.
          </p>
          <button
            type="button"
            onClick={replan}
            disabled={mutation.isPending}
            className="mt-2.5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong bg-raised px-4 font-semibold hover:border-fg/60 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Re-plan for {relativeClock(s.departure, tz).replace(/^(Today|Tomorrow) /, '')}
          </button>
          {mutation.error && (
            <p className="mt-2 text-sm text-sev">
              {mutation.error instanceof ApiError ? mutation.error.message : 'Could not re-plan.'}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
