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
  const [cache] = useState(() => new WeakMap<Heatmap, Map<HeatLayer, HeatFrames>>())
  const reqId = useRef(0)
  // Bumped when a bake finishes so render re-reads the cache.
  const [, setVersion] = useState(0)

  useEffect(() => {
    const worker = new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!heatmap || heatmap.points.length === 0) return
    const perHeat = cache.get(heatmap) ?? new Map<HeatLayer, HeatFrames>()
    cache.set(heatmap, perHeat)
    if (perHeat.has(layer)) return
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
      if (reqId.current === id) setVersion((v) => v + 1)
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
  }, [heatmap, layer, cache])

  if (!heatmap) return null
  return cache.get(heatmap)?.get(layer) ?? null
}
