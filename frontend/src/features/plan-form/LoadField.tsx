import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'

export const LOAD_MAX = 50_000
const STEP = 1_000
const PRESETS = [10_000, 20_000, 30_000, 40_000, 45_000]

interface Props {
  value: number
  onChange: (v: number) => void
}

export function LoadField({ value, onChange }: Props) {
  const clamp = (v: number) => Math.min(LOAD_MAX, Math.max(0, Math.round(v)))
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-semibold uppercase tracking-wider text-muted">Load weight</legend>
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          onClick={() => onChange(clamp(value - STEP))}
          className="grid size-14 place-items-center rounded-xl border border-line bg-raised text-muted hover:text-fg"
          aria-label="Decrease load by 1,000 lb"
        >
          <Minus className="size-5" />
        </button>
        <label className="flex min-w-0 flex-1 items-center rounded-xl border border-line bg-raised px-4 focus-within:border-signal">
          <span className="sr-only">Load weight in pounds</span>
          <input
            inputMode="numeric"
            className="h-14 w-full min-w-0 bg-transparent text-center font-display text-[24px] font-semibold tracking-wide outline-none"
            value={value.toLocaleString('en-US')}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, '')
              onChange(clamp(digits ? Number(digits) : 0))
            }}
          />
          <span className="text-muted">lb</span>
        </label>
        <button
          type="button"
          onClick={() => onChange(clamp(value + STEP))}
          className="grid size-14 place-items-center rounded-xl border border-line bg-raised text-muted hover:text-fg"
          aria-label="Increase load by 1,000 lb"
        >
          <Plus className="size-5" />
        </button>
      </div>
      <div className="mt-2 flex gap-1.5" aria-label="Common loads">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-pressed={value === p}
            className={cn(
              'min-h-10 flex-1 rounded-lg border text-[14px] font-semibold',
              value === p ? 'border-signal bg-signal/10 text-fg' : 'border-line text-muted hover:text-fg',
            )}
          >
            {p / 1000}k
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-sm text-muted">
        Over 30,000 lb raises wind risk at 45+ mph; over 40,000 lb at 35+ mph.
      </p>
    </fieldset>
  )
}
