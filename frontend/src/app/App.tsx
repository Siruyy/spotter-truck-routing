import { History, Moon, Sun } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '@/api/client'
import { PlanForm } from '@/features/plan-form/PlanForm'
import { MapView } from '@/features/map/MapView'
import { ResultsPanel } from '@/features/results/ResultsPanel'
import { TimeSlider } from '@/features/timeline/TimeSlider'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { loadLastTrip, type SavedTrip } from '@/lib/persist'
import { browserTz } from '@/lib/time'
import { useUi } from '@/store/ui'
import { BottomSheet, sheetHeightVh } from './BottomSheet'
import { HowItWorks } from './HowItWorks'

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--tr-signal)" />
        <path d="M7 22.5 13.5 9h5L25 22.5h-4.2l-1.2-2.8h-7.2l-1.2 2.8zm6.8-6h4.4L16 11.3z" fill="var(--tr-signal-ink)" />
      </svg>
      <div className="leading-none">
        <div className="font-display text-[20px] font-bold tracking-wide">TruckRoute</div>
        <div className="mt-0.5 text-[12px] font-medium uppercase tracking-[0.14em] text-muted">Weather-aware routing</div>
      </div>
    </div>
  )
}

function ThemeToggle() {
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  return (
    <button
      type="button"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="grid size-11 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg"
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
    >
      {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  )
}

function Disclaimer() {
  return (
    <p className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-faint">
      For pre-trip planning only. Don’t use a hand-held device while driving (FMCSA §392.80, §392.82). Forecasts can
      change; check official alerts before you go. Weather data by Open-Meteo (CC BY 4.0), alerts by NWS, routing by
      TomTom, map © OpenStreetMap contributors / OpenFreeMap.
    </p>
  )
}

export function App() {
  const theme = useUi((s) => s.theme)
  const plan = useUi((s) => s.plan)
  const setPlan = useUi((s) => s.setPlan)
  const sheet = useUi((s) => s.sheet)
  const setSheet = useUi((s) => s.setSheet)
  const isDesktop = useMediaQuery('(min-width: 900px)')
  const [editing, setEditing] = useState(false)
  const [lastTrip, setLastTrip] = useState<SavedTrip | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // New plan or switching to the form: start at the top of the panel.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [plan?.id, editing])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b0d0f' : '#fbfbfa')
  }, [theme])

  // Boot: shared link (/t/:slug), else offline restore of the last trip.
  useEffect(() => {
    const m = /^\/t\/([\w-]{4,16})\/?$/.exec(window.location.pathname)
    if (m?.[1]) {
      api
        .shared(m[1])
        .then((s) => setPlan(s.plan, 'shared', s.shared_at))
        .catch((e: unknown) => setBootError(e instanceof ApiError ? e.message : 'Could not open the shared trip.'))
      return
    }
    void loadLastTrip().then((t) => {
      setLastTrip(t)
      if (t && !navigator.onLine) setPlan(t.plan, 'offline')
    })
  }, [setPlan])

  const tz = useMemo(() => plan?.routes[0]?.checkpoints[0]?.tz ?? browserTz(), [plan])
  const showForm = !plan || editing

  const panelBody = (
    <>
      {bootError && (
        <p role="alert" className="mb-4 rounded-xl border border-sev/40 bg-sev/10 px-4 py-3 text-[15px]">
          {bootError}
        </p>
      )}
      {showForm ? (
        <>
          {!plan && (
            <div className="mb-5">
              <h1 className="font-display text-[28px] font-bold leading-[1.1]">Which route is safest right now?</h1>
              <p className="mt-2 text-[16px] text-muted">
                We compare three truck routes against the forecast for the hour you’ll actually reach each stretch of road.
              </p>
            </div>
          )}
          <PlanForm
            key={plan?.id ?? 'new'}
            initial={plan}
            onPlanned={() => {
              setEditing(false)
              if (!isDesktop) setSheet('half')
              if (window.location.pathname !== '/') window.history.replaceState(null, '', '/')
            }}
          />
          {plan && (
            <button type="button" onClick={() => setEditing(false)} className="mt-3 min-h-11 w-full rounded-xl font-semibold text-muted hover:text-fg">
              Back to results
            </button>
          )}
          {!plan && lastTrip && (
            <button
              type="button"
              onClick={() => setPlan(lastTrip.plan, navigator.onLine ? 'live' : 'offline')}
              className="mt-4 flex min-h-12 w-full items-center gap-3 rounded-xl border border-line px-4 text-left hover:border-line-strong"
            >
              <History className="size-5 shrink-0 text-muted" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  Last trip: {lastTrip.plan.request.origin.label} → {lastTrip.plan.request.destination.label}
                </span>
                <span className="block text-sm text-muted">
                  Planned {new Date(lastTrip.savedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </span>
            </button>
          )}
          {!plan && <HowItWorks />}
        </>
      ) : (
        <ResultsPanel plan={plan} onEdit={() => setEditing(true)} />
      )}
      <Disclaimer />
    </>
  )

  if (isDesktop) {
    return (
      <div className="flex h-dvh">
        <aside className="relative z-10 flex w-[440px] shrink-0 flex-col border-r border-line bg-panel">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
            <Brand />
            <ThemeToggle />
          </div>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 scroll-thin">
            {panelBody}
          </div>
        </aside>
        <main className="relative min-w-0 flex-1">
          <MapView padding={{ top: 60, bottom: 200, left: 60, right: 80 }} />
          <div className="pointer-events-none absolute inset-x-4 bottom-11 flex justify-center">
            <div className="w-full max-w-[920px]">
              <TimeSlider tz={tz} />
            </div>
          </div>
        </main>
      </div>
    )
  }

  const sheetVh = sheetHeightVh(sheet)
  return (
    <div className="relative h-dvh overflow-hidden">
      <MapView padding={{ top: 80, bottom: Math.round((window.innerHeight * sheetVh) / 100) + 170, left: 30, right: 50 }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3">
        <div className="pointer-events-auto rounded-2xl border border-line bg-panel/95 px-3 py-2 backdrop-blur">
          <Brand />
        </div>
        <div className="pointer-events-auto rounded-2xl border border-line bg-panel/95 backdrop-blur">
          <ThemeToggle />
        </div>
      </div>
      {sheet !== 'full' && (
        <div className="pointer-events-none absolute inset-x-2 z-10" style={{ bottom: `calc(${sheetVh}dvh + 8px)` }}>
          <TimeSlider tz={tz} />
        </div>
      )}
      <BottomSheet>{panelBody}</BottomSheet>
    </div>
  )
}
