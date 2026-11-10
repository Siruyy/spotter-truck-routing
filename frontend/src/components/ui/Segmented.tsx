import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface Option<T> {
  value: T
  label: ReactNode
  ariaLabel?: string
}

interface Props<T extends string | number> {
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  label: string
  className?: string
  size?: 'md' | 'sm'
}

export function Segmented<T extends string | number>({ value, options, onChange, label, className, size = 'md' }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex gap-1 rounded-xl bg-sunken p-1', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.ariaLabel}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg font-semibold transition-[color,background-color,box-shadow,transform] duration-150 active:scale-[0.97]',
              size === 'md' ? 'min-h-11 px-3 text-[15px]' : 'min-h-9 px-2.5 text-sm',
              active ? 'bg-raised text-fg shadow-[0_0_0_1px_var(--tr-line-strong)]' : 'text-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
