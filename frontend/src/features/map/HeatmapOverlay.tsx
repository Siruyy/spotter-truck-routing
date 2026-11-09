import { BitmapLayer } from '@deck.gl/layers'
import { MapLibreOverlay } from '@deck.gl/maplibre'
import { useControl } from '@vis.gl/react-maplibre'
import { useEffect } from 'react'
import { useUi } from '@/store/ui'
import type { HeatFrames } from './heatmap/useHeatmapFrames'

interface Props {
  frames: HeatFrames | null
  visible: boolean
  beforeId: string
}

/**
 * Draws hour h and h+1 as two stacked BitmapLayers and crossfades by the
 * fractional slider value. Slider changes are applied straight to the deck
 * overlay from a store subscription, so scrubbing never re-renders React.
 */
export function HeatmapOverlay({ frames, visible, beforeId }: Props) {
  const overlay = useControl(() => new MapLibreOverlay({ interleaved: true, layers: [] }))

  useEffect(() => {
    const render = (hour: number) => {
      if (!frames || !visible || frames.frames.length === 0) {
        overlay.setProps({ layers: [] })
        return
      }
      const last = frames.frames.length - 1
      const h0 = Math.min(last, Math.max(0, Math.floor(hour)))
      const h1 = Math.min(last, h0 + 1)
      const frac = hour - h0
      const common = {
        bounds: frames.bounds,
        beforeId,
        textureParameters: { minFilter: 'linear', magFilter: 'linear' } as const,
        pickable: false,
      }
      overlay.setProps({
        layers: [
          new BitmapLayer({ ...common, id: 'heat-base', image: frames.frames[h0], opacity: 0.85 }),
          new BitmapLayer({
            ...common,
            id: 'heat-next',
            image: frames.frames[h1],
            opacity: h1 === h0 ? 0 : 0.85 * frac,
          }),
        ],
      })
    }
    render(useUi.getState().hour)
    let raf = 0
    let pending: number | null = null
    const unsub = useUi.subscribe((s, prev) => {
      if (s.hour === prev.hour) return
      pending = s.hour
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (pending !== null) render(pending)
      })
    })
    return () => {
      unsub()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [overlay, frames, visible, beforeId])

  return null
}
