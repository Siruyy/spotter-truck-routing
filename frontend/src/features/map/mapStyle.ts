import type { Theme } from '@/store/ui'

export const MAP_STYLES: Record<Theme, string> = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
}

/** Initial view: contiguous US. */
export const US_VIEW = { longitude: -97.5, latitude: 38.5, zoom: 3.6 }

export const ROUTE_FALLBACK_COLOR = '#7c838c'
