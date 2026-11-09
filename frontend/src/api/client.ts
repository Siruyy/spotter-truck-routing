import type {
  AlertsResponse,
  ApiErrorBody,
  Heatmap,
  IntervalMi,
  Place,
  Plan,
  PlanInput,
  SharedPlan,
} from './types'

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError('network', 'Can’t reach the server. Check your connection.', 0)
  }
  const body = (await res.json().catch(() => null)) as T | ApiErrorBody | null
  if (!res.ok) {
    const e = (body as ApiErrorBody | null)?.error
    throw new ApiError(e?.code ?? 'http_error', e?.message ?? `Request failed (${res.status})`, res.status)
  }
  return body as T
}

export const api = {
  suggest: (q: string, near: { lat: number; lon: number } | null, signal?: AbortSignal) => {
    const params = new URLSearchParams({ q })
    if (near) {
      params.set('lat', near.lat.toFixed(2))
      params.set('lon', near.lon.toFixed(2))
    }
    return request<{ results: Place[] }>(`/geocode/suggest?${params}`, { signal })
  },
  reverse: (lat: number, lon: number) =>
    request<{ result: Place | null }>(`/geocode/reverse?lat=${lat}&lon=${lon}`),
  createPlan: (input: PlanInput) =>
    request<Plan>('/plans', { method: 'POST', body: JSON.stringify(input) }),
  resample: (id: string, interval: IntervalMi) =>
    request<Plan>(`/plans/${encodeURIComponent(id)}?interval_mi=${interval}`),
  heatmap: (id: string, signal?: AbortSignal) =>
    request<Heatmap>(`/plans/${encodeURIComponent(id)}/heatmap`, { signal }),
  viewportHeatmap: (bbox: [number, number, number, number], loadLb: number | null, signal?: AbortSignal) => {
    const params = new URLSearchParams({ bbox: bbox.map((v) => v.toFixed(2)).join(',') })
    if (loadLb !== null) params.set('load_lb', String(loadLb))
    return request<Heatmap>(`/heatmap?${params}`, { signal })
  },
  alerts: (id: string) => request<AlertsResponse>(`/plans/${encodeURIComponent(id)}/alerts`),
  share: (id: string, interval: IntervalMi) =>
    request<{ slug: string }>(`/plans/${encodeURIComponent(id)}/share`, {
      method: 'POST',
      body: JSON.stringify({ interval_mi: interval }),
    }),
  shared: (slug: string) => request<SharedPlan>(`/shared/${encodeURIComponent(slug)}`),
}
