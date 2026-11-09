import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { fromLocalInput, localHourEpoch, relativeClock, toLocalInput, zoneAbbr } from '@/lib/time'

export type DepartureChoice =
  | { kind: 'now' }
  | { kind: 'plus2' }
  | { kind: 'tomorrow6' }
  | { kind: 'custom'; epoch: number }

export function resolveDeparture(choice: DepartureChoice, tz: string, nowS = Date.now() / 1000): number {
  switch (choice.kind) {
    case 'now':
      return nowS
    case 'plus2':
      return nowS + 2 * 3600
    case 'tomorrow6':
      return localHourEpoch(6, tz, true, nowS)
    case 'custom':
      return choice.epoch
  }
}

const MAX_AHEAD_S = 48 * 3600

interface Props {
  value: DepartureChoice
  onChange: (c: DepartureChoice) => void
  tz: string
}

export function DepartureField({ value, onChange, tz }: Props) {
  const [now, setNow] = useState(() => Date.now() / 1000)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 30_000)
    return () => clearInterval(t)
  }, [])

  const epoch = resolveDeparture(value, tz, now)
  const chips: { kind: DepartureChoice['kind']; label: string }[] = [
    { kind: 'now', label: 'Now' },
    { kind: 'plus2', label: '+2 h' },
    { kind: 'tomorrow6', label: 'Tomorrow 6 AM' },
    { kind: 'custom', label: 'Custom' },
  ]
  const outOfRange = epoch > now + MAX_AHEAD_S || epoch < now - 15 * 60

  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-semibold uppercase tracking-wider text-muted">Departure</legend>
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-sunken p-1" role="radiogroup" aria-label="Departure time">
        {chips.map((c) => {
          const active = value.kind === c.kind
          return (
            <button
              key={c.kind}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() =>
                onChange(c.kind === 'custom' ? { kind: 'custom', epoch: Math.ceil((now + 3600) / 900) * 900 } : ({ kind: c.kind } as DepartureChoice))
              }
              className={cn(
                'min-h-11 rounded-lg px-1 text-[14px] font-semibold leading-tight transition-colors',
                active ? 'bg-raised text-fg shadow-[0_0_0_1px_var(--tr-line-strong)]' : 'text-muted hover:text-fg',
              )}
            >
              {c.label}
            </button>
          )
        })}
      </div>
      {value.kind === 'custom' && (
        <input
          type="datetime-local"
          aria-label={`Custom departure (${zoneAbbr(epoch, tz)})`}
          className="mt-2 h-12 w-full rounded-xl border border-line bg-raised px-3 text-[16px] outline-none focus:border-signal"
          value={toLocalInput(value.epoch, tz)}
          min={toLocalInput(now, tz)}
          max={toLocalInput(now + MAX_AHEAD_S, tz)}
          onChange={(e) => {
            const v = fromLocalInput(e.target.value, tz)
            if (v !== null) onChange({ kind: 'custom', epoch: v })
          }}
        />
      )}
      <p className={cn('mt-1.5 text-sm', outOfRange ? 'text-sev' : 'text-muted')}>
        {outOfRange ? 'Pick a time within the next 48 hours.' : `Leaves ${relativeClock(epoch, tz, now)}`}
      </p>
    </fieldset>
  )
}
