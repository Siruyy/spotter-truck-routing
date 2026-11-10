import { ChevronLeft, ChevronsLeft, ChevronRight, ChevronsRight, Eye, EyeOff, Pause, Play, Radar } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import type { HeatLayer } from '@/api/types'
import { cn } from '@/lib/cn'
import { dayHour, sameDay, zoneAbbr } from '@/lib/time'
import { useUi } from '@/store/ui'
import { hourSummary } from './hourSummary'
import { Legend } from './Legend'

const LAYERS: { value: HeatLayer; label: string }[] = [
  { value: 'risk', label: 'Risk' },
  { value: 'wind', label: 'Wind' },
  { value: 'rain', label: 'Rain' },
  { value: 'snow', label: 'Snow' },
]
const PLAY_HOURS_PER_SEC = 4

function StepButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg"
    >
      {children}
    </button>
  )
}

export function TimeSlider({ tz, compact = false }: { tz: string; compact?: boolean }) {
  const hour = useUi((s) => s.hour)
  const setHour = useUi((s) => s.setHour)
  const playing = useUi((s) => s.playing)
  const setPlaying = useUi((s) => s.setPlaying)
  const start = useUi((s) => s.heatStart)
  const layer = useUi((s) => s.heatLayer)
  const setLayer = useUi((s) => s.setHeatLayer)
  const visible = useUi((s) => s.heatVisible)
  const setVisible = useUi((s) => s.setHeatVisible)
  const status = useUi((s) => s.heatStatus)
  const heatData = useUi((s) => s.heatData)
  const radar = useUi((s) => s.radar)
  const setRadar = useUi((s) => s.setRadar)
  const lastTick = useRef<number | null>(null)

  // Play: advance smoothly with rAF; stop at the end.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = (t: number) => {
      const prev = lastTick.current ?? t
      lastTick.current = t
      const next = useUi.getState().hour + ((t - prev) / 1000) * PLAY_HOURS_PER_SEC
      if (next >= 48) {
        setHour(48)
        setPlaying(false)
        return
      }
      setHour(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      lastTick.current = null
    }
  }, [playing, setHour, setPlaying])

  const snapped = Math.round(hour)
  const at = start + snapped * 3600
  const dayTicks = useMemo(() => {
    const ticks: { h: number; label: string }[] = []
    for (let h = 1; h <= 48; h++) {
      if (!sameDay(start + (h - 1) * 3600, start + h * 3600, tz)) {
        ticks.push({ h, label: new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format((start + h * 3600) * 1000) })
      }
    }
    return ticks
  }, [start, tz])

  const stepTo = (h: number) => {
    setPlaying(false)
    setHour(Math.round(h))
  }

  const statusText =
    status === 'zoom-in'
      ? 'Zoom in or plan a trip to see the forecast heatmap'
      : status === 'unavailable'
        ? 'Forecast heatmap is unavailable right now'
        : status === 'loading'
          ? 'Loading forecast…'
          : heatData
            ? hourSummary(heatData, hour, layer)
            : null

  return (
    <section
      aria-label="Forecast timeline"
      className={cn(
        'anim-fade-up pointer-events-auto rounded-2xl border border-line bg-panel/95 shadow-[0_10px_40px_rgb(0_0_0/0.35)] backdrop-blur',
        compact ? 'p-2' : 'p-2.5',
      )}
    >
      <div className={cn('flex items-center px-1', compact ? 'gap-1' : 'flex-wrap gap-2')}>
        <div role="radiogroup" aria-label="Heatmap layer" className="flex gap-1 rounded-xl bg-sunken p-1">
          {LAYERS.map((l) => (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={visible && layer === l.value}
              onClick={() => setLayer(l.value)}
              className={cn(
                'min-h-9 rounded-lg text-sm font-semibold',
                compact ? 'px-2.5' : 'px-3',
                visible && layer === l.value ? 'bg-raised text-fg shadow-[0_0_0_1px_var(--tr-line-strong)]' : 'text-muted hover:text-fg',
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-pressed={!visible}
          className="grid size-11 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg"
          aria-label={visible ? 'Hide heatmap' : 'Show heatmap'}
          title={visible ? 'Hide heatmap' : 'Show heatmap'}
        >
          {visible ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
        </button>
        <button
          type="button"
          onClick={() => setRadar(!radar)}
          aria-pressed={radar}
          className={cn(
            'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold',
            radar ? 'bg-raised text-fg shadow-[0_0_0_1px_var(--tr-line-strong)]' : 'text-muted hover:text-fg',
          )}
          title="Observed NEXRAD radar right now (not a forecast)"
        >
          <Radar className="size-4" aria-hidden="true" />
          {compact ? <span className="sr-only">Radar now</span> : 'Radar now'}
        </button>
        {!compact && (
          <div className="ml-auto">
            <Legend layer={layer} />
          </div>
        )}
      </div>

      <div className="mt-1 flex items-center gap-1">
        {!compact && (
          <StepButton label="Back 6 hours" onClick={() => stepTo(hour - 6)}>
            <ChevronsLeft className="size-5" />
          </StepButton>
        )}
        {!compact && (
          <StepButton label="Back 1 hour" onClick={() => stepTo(hour - 1)}>
            <ChevronLeft className="size-5" />
          </StepButton>
        )}
        <button
          type="button"
          onClick={() => {
            if (!playing && hour >= 48) setHour(0)
            setPlaying(!playing)
          }}
          aria-label={playing ? 'Pause' : 'Play forecast'}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-fg text-canvas hover:opacity-90"
        >
          {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 translate-x-px fill-current" />}
        </button>
        {!compact && (
          <StepButton label="Forward 1 hour" onClick={() => stepTo(hour + 1)}>
            <ChevronRight className="size-5" />
          </StepButton>
        )}
        {!compact && (
          <StepButton label="Forward 6 hours" onClick={() => stepTo(hour + 6)}>
            <ChevronsRight className="size-5" />
          </StepButton>
        )}

        <div className={cn('shrink-0 leading-tight', compact ? 'ml-1 w-[5.5rem]' : 'ml-2 w-28')} aria-live="off">
          <div className={cn('font-display font-bold', compact ? 'text-[17px]' : 'text-[19px]')}>{snapped === 0 ? 'Now' : dayHour(at, tz)}</div>
          <div className="text-[13px] text-muted">
            {snapped === 0 ? dayHour(at, tz) : `+${snapped} h`} · {zoneAbbr(at, tz)}
          </div>
        </div>

        <div className="relative min-w-0 flex-1 px-1">
          <input
            type="range"
            className="hour-range"
            min={0}
            max={48}
            step={0.01}
            value={hour}
            aria-label="Forecast hour"
            aria-valuetext={`${dayHour(at, tz)}, ${snapped} hours from now`}
            onChange={(e) => {
              setPlaying(false)
              setHour(Number(e.target.value))
            }}
            onPointerUp={() => setHour(Math.round(useUi.getState().hour))}
            onKeyUp={() => setHour(Math.round(useUi.getState().hour))}
          />
          <div className="pointer-events-none absolute inset-x-1 bottom-0 h-3" aria-hidden="true">
            {dayTicks.map((t) => (
              <span
                key={t.h}
                className="absolute -translate-x-1/2 text-[11px] font-semibold uppercase leading-none text-faint"
                style={{ left: `calc(14px + (100% - 28px) * ${t.h / 48})` }}
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      {statusText && visible && <p className="px-2 pb-0.5 text-[13px] text-muted">{statusText}</p>}

    </section>
  )
}
