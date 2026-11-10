import { create } from 'zustand'
import type { Heatmap, HeatLayer, IntervalMi, Plan } from '@/api/types'

export type Theme = 'dark' | 'light'
export type SheetSnap = 'peek' | 'half' | 'full'

interface FocusCheckpoint {
  routeId: string
  index: number
  /** Where the focus came from, so the other side can scroll / fly. */
  source: 'map' | 'list'
}

interface UiState {
  plan: Plan | null
  planOrigin: 'live' | 'shared' | 'offline'
  sharedAt: string | null
  selectedRouteId: string | null
  focus: FocusCheckpoint | null
  interval: IntervalMi
  /** Slider position in hours from heatmap start, fractional (0..48). */
  hour: number
  playing: boolean
  heatLayer: HeatLayer
  heatVisible: boolean
  radar: boolean
  theme: Theme
  sheet: SheetSnap
  /** Epoch of slider hour 0 (top of the current hour, from the heatmap payload). */
  heatStart: number
  heatStatus: 'idle' | 'loading' | 'ready' | 'unavailable' | 'zoom-in'
  /** The heatmap currently drawn, for the timeline's per-hour summary. */
  heatData: Heatmap | null
  setPlan: (plan: Plan | null, origin?: UiState['planOrigin'], sharedAt?: string | null) => void
  selectRoute: (id: string) => void
  setFocus: (f: FocusCheckpoint | null) => void
  setInterval: (i: IntervalMi) => void
  setHour: (h: number) => void
  setPlaying: (p: boolean) => void
  setHeatLayer: (l: HeatLayer) => void
  setHeatVisible: (v: boolean) => void
  setRadar: (v: boolean) => void
  setTheme: (t: Theme) => void
  setSheet: (s: SheetSnap) => void
  setHeat: (start: number | null, status: UiState['heatStatus'], data?: Heatmap | null) => void
}

function currentHour(): number {
  return Math.floor(Date.now() / 3_600_000) * 3600
}

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('tr.theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* storage unavailable */
  }
  return 'dark'
}

export const useUi = create<UiState>((set) => ({
  plan: null,
  planOrigin: 'live',
  sharedAt: null,
  selectedRouteId: null,
  focus: null,
  interval: 25,
  hour: 0,
  playing: false,
  heatLayer: 'risk',
  heatVisible: true,
  radar: false,
  theme: initialTheme(),
  sheet: 'half',
  heatStart: currentHour(),
  heatStatus: 'idle',
  heatData: null,
  setPlan: (plan, origin = 'live', sharedAt = null) =>
    set({
      plan,
      planOrigin: origin,
      sharedAt,
      selectedRouteId: plan?.recommendation.route_id ?? null,
      focus: null,
      interval: plan?.request.interval_mi ?? 25,
    }),
  selectRoute: (id) => set({ selectedRouteId: id, focus: null }),
  setFocus: (focus) => set({ focus }),
  setInterval: (interval) => set({ interval }),
  setHour: (hour) => set({ hour: Math.min(48, Math.max(0, hour)) }),
  setPlaying: (playing) => set({ playing }),
  setHeatLayer: (heatLayer) => set({ heatLayer, heatVisible: true }),
  setHeatVisible: (heatVisible) => set({ heatVisible }),
  setRadar: (radar) => set({ radar }),
  setTheme: (theme) => {
    try {
      localStorage.setItem('tr.theme', theme)
    } catch {
      /* storage unavailable */
    }
    set({ theme })
  },
  setSheet: (sheet) => set({ sheet }),
  setHeat: (start, heatStatus, data = null) => set({ heatStart: start ?? currentHour(), heatStatus, heatData: data }),
}))

export function selectedRoute(state: Pick<UiState, 'plan' | 'selectedRouteId'>) {
  return state.plan?.routes.find((r) => r.id === state.selectedRouteId) ?? null
}
