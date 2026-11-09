import { Ban, CircleAlert, CircleCheck, CircleHelp, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { RiskLevel } from '@/api/types'
import { levelMeta } from '@/lib/risk'
import { cn } from '@/lib/cn'

const ICONS: Record<number, LucideIcon> = {
  0: CircleCheck,
  1: CircleAlert,
  2: TriangleAlert,
  3: OctagonAlert,
  4: Ban,
}

export function RiskIcon({ level, className }: { level: RiskLevel | null; className?: string }) {
  const Icon = level === null ? CircleHelp : (ICONS[level] ?? CircleHelp)
  return <Icon className={className} aria-hidden="true" strokeWidth={2.25} />
}

interface Props {
  level: RiskLevel | null
  size?: 'sm' | 'md'
  className?: string
}

/** Level pill: color + glyph + text, never color alone. */
export function RiskChip({ level, size = 'md', className }: Props) {
  const meta = levelMeta(level)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md font-display font-semibold uppercase tracking-wide',
        size === 'sm' ? 'h-6 px-1.5 text-[12px]' : 'h-7 px-2 text-[13px]',
        className,
      )}
      style={{ background: meta.color, color: meta.ink }}
    >
      <RiskIcon level={level} className={size === 'sm' ? 'size-3.5' : 'size-4'} />
      {meta.label}
    </span>
  )
}
