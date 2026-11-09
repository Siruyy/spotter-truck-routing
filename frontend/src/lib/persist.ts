import { get, set } from 'idb-keyval'
import type { Plan, Place } from '@/api/types'

const LAST_TRIP = 'tr.lastTrip'
const LOAD_KEY = 'tr.load'

export interface SavedTrip {
  plan: Plan
  savedAt: number
}

export async function saveLastTrip(plan: Plan): Promise<void> {
  try {
    await set(LAST_TRIP, { plan, savedAt: Date.now() } satisfies SavedTrip)
  } catch {
    /* IndexedDB unavailable (private mode); offline restore just won't work */
  }
}

export async function loadLastTrip(): Promise<SavedTrip | null> {
  try {
    return ((await get(LAST_TRIP)) as SavedTrip | undefined) ?? null
  } catch {
    return null
  }
}

export function savedLoad(): number {
  try {
    const v = Number(localStorage.getItem(LOAD_KEY))
    return Number.isFinite(v) && v > 0 ? v : 40_000
  } catch {
    return 40_000
  }
}

export function rememberLoad(v: number): void {
  try {
    localStorage.setItem(LOAD_KEY, String(v))
  } catch {
    /* ignore */
  }
}

export interface DraftTrip {
  origin: Place | null
  destination: Place | null
}
