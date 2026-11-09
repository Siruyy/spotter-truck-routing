import { keepPreviousData as keepPrevious, useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from './client'
import type { Heatmap, Place } from './types'

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function useSuggest(query: string, near: { lat: number; lon: number } | null) {
  const q = useDebounced(query.trim(), 250)
  return useQuery<Place[]>({
    queryKey: ['suggest', q, near?.lat.toFixed(1), near?.lon.toFixed(1)],
    queryFn: ({ signal }) => api.suggest(q, near, signal).then((r) => r.results),
    enabled: q.length >= 2,
    staleTime: 10 * 60_000,
    placeholderData: keepPrevious,
  })
}

export function useCreatePlan() {
  return useMutation({ mutationFn: api.createPlan })
}

export function usePlanHeatmap(planId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['heatmap', planId],
    queryFn: ({ signal }) => api.heatmap(planId as string, signal),
    enabled: enabled && !!planId,
    staleTime: 30 * 60_000,
    retry: 1,
  })
}

export function useViewportHeatmap(
  bbox: [number, number, number, number] | null,
  loadLb: number | null,
  enabled: boolean,
) {
  return useQuery<Heatmap>({
    queryKey: ['heatmap-viewport', bbox?.join(','), loadLb],
    queryFn: ({ signal }) => api.viewportHeatmap(bbox as [number, number, number, number], loadLb, signal),
    enabled: enabled && !!bbox,
    staleTime: 30 * 60_000,
    retry: 0,
    placeholderData: keepPrevious,
  })
}

export function useAlerts(planId: string | null) {
  return useQuery({
    queryKey: ['alerts', planId],
    queryFn: () => api.alerts(planId as string),
    enabled: !!planId,
    staleTime: 3 * 60_000,
    retry: 1,
  })
}
