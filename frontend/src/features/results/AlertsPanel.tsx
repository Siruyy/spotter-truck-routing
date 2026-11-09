import { ChevronDown, Loader2, Megaphone } from 'lucide-react'
import { useState } from 'react'
import { useAlerts } from '@/api/hooks'
import type { RouteAlert } from '@/api/types'
import { cn } from '@/lib/cn'

const SEVERITY_COLOR: Record<RouteAlert['severity'], string> = {
  Extreme: 'var(--color-stop)',
  Severe: 'var(--color-sev)',
  Moderate: 'var(--color-high)',
}

function until(ends: string | null): string {
  if (!ends) return ''
  const d = new Date(ends)
  return `until ${d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`
}

/** Official NWS alerts touching any checkpoint. Informational: they never change the computed risk. */
export function AlertsPanel({ planId }: { planId: string }) {
  const { data, isLoading, isError } = useAlerts(planId)
  const [open, setOpen] = useState<string | null>(null)
  if (isLoading)
    return (
      <p className="flex items-center gap-2 px-1 text-sm text-muted" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Checking official NWS alerts along your routes…
      </p>
    )
  if (isError || !data || data.alerts.length === 0) return null
  return (
    <section className="rounded-2xl border border-line bg-panel" aria-label="Official weather alerts">
      <div className="flex items-center gap-2 px-4 pt-3.5 text-[13px] font-semibold uppercase tracking-wider text-muted">
        <Megaphone className="size-4" aria-hidden="true" />
        NWS alerts on your routes ({data.alerts.length})
      </div>
      <ul className="p-2">
        {data.alerts.map((a) => {
          const isOpen = open === a.id
          const routes = Object.keys(a.hits).sort().join(', ')
          return (
            <li key={a.id}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : a.id)}
                className="flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-raised"
              >
                <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[a.severity] }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{a.event}</span>
                  <span className="block text-sm text-muted">
                    {a.severity} · Route{Object.keys(a.hits).length > 1 ? 's' : ''} {routes} {a.ends ? `· ${until(a.ends)}` : ''}
                  </span>
                </span>
                <ChevronDown className={cn('mt-1 size-4 text-faint transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
              </button>
              {isOpen && (
                <div className="mx-2 mb-2 rounded-xl bg-sunken p-3 text-sm leading-relaxed">
                  <p className="font-medium">{a.headline}</p>
                  <p className="mt-1 text-muted">{a.area}</p>
                  {a.instruction && <p className="mt-2 whitespace-pre-line">{a.instruction}</p>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="px-4 pb-3 text-xs text-faint">
        Shown for awareness. Route risk is scored only from the forecast rules.{data.partial ? ' Some areas could not be checked.' : ''}
      </p>
    </section>
  )
}
