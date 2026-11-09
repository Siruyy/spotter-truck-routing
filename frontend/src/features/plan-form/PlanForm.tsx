import { ArrowDownUp, Loader2, Route } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { ApiError } from '@/api/client'
import { useCreatePlan } from '@/api/hooks'
import type { IntervalMi, Place, Plan } from '@/api/types'
import { Segmented } from '@/components/ui/Segmented'
import { rememberLoad, saveLastTrip, savedLoad } from '@/lib/persist'
import { browserTz, tzAt } from '@/lib/time'
import { useUi } from '@/store/ui'
import { type DepartureChoice, resolveDeparture } from './departure'
import { DepartureField } from './DepartureField'
import { LoadField } from './LoadField'
import { PlaceInput } from './PlaceInput'

const STAGES = [
  'Finding truck routes…',
  'Checking the forecast at each checkpoint…',
  'Scoring routes…',
] as const

/** Honest-ish progress copy: the request is one call, so stages advance on a timer. */
function usePendingStage(pending: boolean): string {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!pending) return
    const timers = [setTimeout(() => setI(1), 2500), setTimeout(() => setI(2), 4500)]
    return () => {
      timers.forEach(clearTimeout)
      setI(0)
    }
  }, [pending])
  return STAGES[i] ?? STAGES[0]
}

interface Props {
  initial?: Plan | null
  onPlanned: () => void
}

export function PlanForm({ initial, onPlanned }: Props) {
  const setPlan = useUi((s) => s.setPlan)
  const [origin, setOrigin] = useState<Place | null>(initial?.request.origin ?? null)
  const [destination, setDestination] = useState<Place | null>(initial?.request.destination ?? null)
  const [departure, setDeparture] = useState<DepartureChoice>({ kind: 'now' })
  const [load, setLoad] = useState<number>(initial?.request.load_lb ?? savedLoad())
  const [interval, setIntervalMi] = useState<IntervalMi>(initial?.request.interval_mi ?? 25)
  const mutation = useCreatePlan()
  const stage = usePendingStage(mutation.isPending)

  const tz = useMemo(() => (origin ? tzAt(origin.lat, origin.lon) : browserTz()), [origin])
  const ready = origin !== null && destination !== null
  const samePlace =
    ready && Math.abs(origin.lat - destination.lat) < 0.01 && Math.abs(origin.lon - destination.lon) < 0.01

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!origin || !destination || samePlace) return
    rememberLoad(load)
    const epoch = Math.max(resolveDeparture(departure, tz), Date.now() / 1000)
    mutation.mutate(
      {
        origin,
        destination,
        departure_at: new Date(epoch * 1000).toISOString(),
        load_lb: load,
        interval_mi: interval,
      },
      {
        onSuccess: (plan) => {
          setPlan(plan)
          void saveLastTrip(plan)
          onPlanned()
        },
      },
    )
  }

  const error = mutation.error instanceof ApiError ? mutation.error.message : mutation.error ? 'Something went wrong.' : null

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" aria-label="Plan a trip">
      <div className="relative flex flex-col gap-3">
        <PlaceInput
          label="From"
          placeholder="City, address or truck stop"
          value={origin}
          onChange={setOrigin}
          near={destination}
          allowLocate
          marker="origin"
        />
        <PlaceInput
          label="To"
          placeholder="Where are you headed?"
          value={destination}
          onChange={setDestination}
          near={origin}
          marker="destination"
        />
        {(origin || destination) && (
          <button
            type="button"
            onClick={() => {
              setOrigin(destination)
              setDestination(origin)
            }}
            className="absolute right-14 top-[calc(50%-4px)] z-10 grid size-9 place-items-center rounded-full border border-line-strong bg-panel text-muted hover:text-fg"
            aria-label="Swap origin and destination"
            title="Swap"
          >
            <ArrowDownUp className="size-4" />
          </button>
        )}
      </div>

      <DepartureField value={departure} onChange={setDeparture} tz={tz} />
      <LoadField value={load} onChange={setLoad} />

      <div>
        <span id="interval-label" className="mb-1.5 block text-[13px] font-semibold uppercase tracking-wider text-muted">
          Weather check every
        </span>
        <Segmented
          label="Checkpoint spacing"
          value={interval}
          onChange={setIntervalMi}
          options={[
            { value: 10, label: '10 mi' },
            { value: 25, label: '25 mi' },
            { value: 50, label: '50 mi' },
          ]}
        />
      </div>

      {samePlace && <p className="text-sm text-sev">Origin and destination are the same place.</p>}
      {error && (
        <p role="alert" className="rounded-xl border border-sev/40 bg-sev/10 px-4 py-3 text-[15px]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!ready || samePlace || mutation.isPending}
        className="flex min-h-14 items-center justify-center gap-2.5 rounded-xl bg-signal font-display text-[19px] font-bold uppercase tracking-wide text-signal-ink transition-[filter] hover:brightness-105 disabled:cursor-not-allowed disabled:bg-raised disabled:text-faint disabled:shadow-[inset_0_0_0_1px_var(--tr-line)]"
      >
        {mutation.isPending ? (
          <>
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <span aria-live="polite">{stage}</span>
          </>
        ) : (
          <>
            <Route className="size-5" aria-hidden="true" /> Plan routes
          </>
        )}
      </button>
    </form>
  )
}
