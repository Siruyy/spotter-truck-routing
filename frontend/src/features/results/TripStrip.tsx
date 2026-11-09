import type { Checkpoint } from '@/api/types'
import { levelMeta } from '@/lib/risk'

/** Texture per level so the strip still reads without color (CVD / grayscale). */
const PATTERN: Record<number, string> = {
  [-1]: 'repeating-linear-gradient(45deg, rgb(255 255 255 / 0.18) 0 2px, transparent 2px 6px)',
  0: 'none',
  1: 'repeating-linear-gradient(90deg, rgb(0 0 0 / 0.12) 0 1px, transparent 1px 7px)',
  2: 'repeating-linear-gradient(-45deg, rgb(0 0 0 / 0.18) 0 2px, transparent 2px 6px)',
  3: 'repeating-linear-gradient(45deg, rgb(0 0 0 / 0.28) 0 2px, transparent 2px 4px)',
  4: 'repeating-linear-gradient(0deg, rgb(255 255 255 / 0.35) 0 2px, transparent 2px 4px)',
}

interface Props {
  checkpoints: Checkpoint[]
  distance: number
  height?: number
  label: string
}

/** Horizontal risk-by-mile bar; each checkpoint owns half of each adjacent segment. */
export function TripStrip({ checkpoints, distance, height = 12, label }: Props) {
  const parts: { from: number; to: number; level: number }[] = []
  checkpoints.forEach((cp, k) => {
    const prev = checkpoints[k - 1]
    const next = checkpoints[k + 1]
    const from = prev ? (prev.mile + cp.mile) / 2 : 0
    const to = next ? (cp.mile + next.mile) / 2 : cp.mile
    const level = cp.level ?? -1
    const last = parts[parts.length - 1]
    if (last && last.level === level) last.to = to
    else parts.push({ from, to, level })
  })
  const total = distance || 1
  return (
    <div
      role="img"
      aria-label={label}
      className="relative flex w-full overflow-hidden rounded-[4px] bg-sunken"
      style={{ height }}
    >
      {parts.map((p) => {
        const meta = levelMeta(p.level < 0 ? null : (p.level as 0 | 1 | 2 | 3 | 4))
        return (
          <span
            key={`${p.from}-${p.level}`}
            className="h-full"
            style={{
              width: `${((p.to - p.from) / total) * 100}%`,
              backgroundColor: meta.color,
              backgroundImage: PATTERN[p.level],
            }}
          />
        )
      })}
    </div>
  )
}
