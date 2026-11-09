import { useEffect, useRef, useState } from 'react'
import type { Heatmap, HeatLayer } from '@/api/types'
import { rasterBounds, rasterSize } from './bake'
import type { BakeRequest, BakeResponse } from './bake.worker'

export interface HeatFrames {
  layer: HeatLayer
  frames: ImageBitmap[]
  bounds: [number, number, number, number]
  start: number
}

/**
 * Bakes the current heatmap layer into 49 ImageBitmaps in a Web Worker.
 * Results are cached per (heatmap, layer) so switching layers back is instant.
 */
export function useHeatmapFrames(heatmap: Heatmap | null, layer: HeatLayer): HeatFrames | null {
  const workerRef = useRef<Worker | null>(null)
  const cache = useRef(new WeakMap<Heatmap, Map<HeatLayer, HeatFrames>>())
  const reqId = useRef(0)
  const [frames, setFrames] = useState<HeatFrames | null>(null)

  useEffect(() => {
    const worker = new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!heatmap || heatmap.points.length === 0) {
      setFrames(null)
      return
    }
    const perHeat = cache.current.get(heatmap) ?? new Map<HeatLayer, HeatFrames>()
    cache.current.set(heatmap, perHeat)
    const hit = perHeat.get(layer)
    if (hit) {
      setFrames(hit)
      return
    }
    const worker = workerRef.current
    if (!worker) return
    const id = ++reqId.current
    const bounds = rasterBounds(heatmap)
    const [width, height] = rasterSize(bounds)
    const onMessage = (event: MessageEvent<BakeResponse>) => {
      if (event.data.id !== id) return
      worker.removeEventListener('message', onMessage)
      const baked: HeatFrames = {
        layer,
        frames: event.data.frames,
        bounds,
        start: heatmap.start,
      }
      perHeat.set(layer, baked)
      if (reqId.current === id) setFrames(baked)
    }
    worker.addEventListener('message', onMessage)
    const request: BakeRequest = {
      id,
      layer,
      hours: heatmap.hours,
      spacing: heatmap.spacing,
      bbox: bounds,
      points: heatmap.points,
      values: heatmap.layers[layer],
      width,
      height,
    }
    worker.postMessage(request)
    return () => worker.removeEventListener('message', onMessage)
  }, [heatmap, layer])

  return frames
}
