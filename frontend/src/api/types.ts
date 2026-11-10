/** Wire types for the TruckRoute API (mirrors backend/plans/service.py). */

export type RiskLevel = 0 | 1 | 2 | 3 | 4
export type Factor = 'wind' | 'rain' | 'snow'
export type IntervalMi = 10 | 25 | 50
export type HeatLayer = 'risk' | 'wind' | 'rain' | 'snow'

export interface Place {
  label: string
  detail: string
  lat: number
  lon: number
  kind?: string
}

export interface HourWeather {
  wind_mph: number | null
  gust_mph: number | null
  rain_in_hr: number | null
  snow_in_hr: number | null
  temp_f: number | null
  visibility_mi: number | null
  weather_code: number | null
  /** Direction the wind blows FROM, degrees (meteorological). */
  wind_dir_deg?: number | null
}

export interface Checkpoint {
  i: number
  mile: number
  lat: number
  lon: number
  eta: number // epoch seconds
  tz: string
  level: RiskLevel | null
  factor: Factor | null
  gust_advisory: boolean
  weather: HourWeather | null
}

export interface RouteScore {
  no_travel_mi: number
  severe_mi: number
  high_mi: number
  moderate_mi: number
  low_mi: number
  unknown_mi: number
  avg_risk: number
  duration_s: number
}

export interface PlannedRoute {
  id: string
  name: string
  distance_mi: number
  duration_s: number
  traffic_delay_s: number
  departure: number
  arrival: number
  arrival_tz: string
  geometry: [number, number][] // [lon, lat]
  score: RouteScore
  checkpoints: Checkpoint[]
}

export interface PlanRequestEcho {
  origin: Place
  destination: Place
  departure_epoch: number
  load_lb: number
  interval_mi: IntervalMi
}

export interface Plan {
  id: string
  created_at: number
  request: PlanRequestEcho
  routes: PlannedRoute[]
  recommendation: { route_id: string; reason: string; runner_up_id: string | null }
  departure_suggestion: {
    offset_h: number
    departure: number
    route_id: string
    summary: string
    score: RouteScore
  } | null
  weather: { provider: string; stale_as_of: number | null }
  notices: string[]
}

export interface PlanInput {
  origin: Place
  destination: Place
  departure_at: string // ISO with offset
  load_lb: number
  interval_mi: IntervalMi
}

export interface Heatmap {
  start: number
  hours: number
  spacing: number
  bbox: [number, number, number, number]
  points: [number, number][] // [lat, lon]
  /** points[fine_from:] are the checkpoints' exact cells along the routes. */
  fine_from?: number
  layers: Record<HeatLayer, number[]> & { wind_dir?: number[] } // hour-major: h * points + p; -1 = missing
  load_applied: boolean
  provider: string
  stale_as_of: number | null
}

export interface RouteAlert {
  id: string
  event: string
  severity: 'Extreme' | 'Severe' | 'Moderate'
  headline: string
  description: string
  instruction: string
  onset: string | null
  ends: string | null
  area: string
  hits: Record<string, number[]>
}

export interface AlertsResponse {
  alerts: RouteAlert[]
  partial: boolean
}

export interface SharedPlan {
  slug: string
  shared_at: string
  plan: Plan
}

export interface ApiErrorBody {
  error: { code: string; message: string }
}

export interface PointHour extends HourWeather {
  t: number
  level: RiskLevel | null
  factor: Factor | null
}

export interface PointConditions {
  tz: string
  provider: string
  stale_as_of: number | null
  load_applied: boolean
  hours: PointHour[]
}
