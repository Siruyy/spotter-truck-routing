import type { Checkpoint, PlannedRoute } from '@/api/types'
import { buildTrack, haversineMi, mileAtTime, pointAtMile, riskSegments } from './geo'

function cp(i: number, mile: number, eta: number, level: Checkpoint['level']): Checkpoint {
  return { i, mile, lat: 0, lon: mile / 69.09, eta, tz: 'UTC', level, factor: 'wind', gust_advisory: false, weather: null }
}

function route(): PlannedRoute {
  return {
    id: 'A',
    name: 'I-35',
    distance_mi: 100,
    duration_s: 7200,
    traffic_delay_s: 0,
    departure: 0,
    arrival: 7200,
    arrival_tz: 'UTC',
    geometry: [
      [0, 0],
      [100 / 69.09, 0],
    ],
    score: { no_travel_mi: 0, severe_mi: 0, high_mi: 0, moderate_mi: 0, low_mi: 100, unknown_mi: 0, avg_risk: 0, duration_s: 7200 },
    checkpoints: [cp(0, 0, 0, 0), cp(1, 50, 3600, 3), cp(2, 100, 7200, 3)],
  }
}

describe('geo', () => {
  it('measures great-circle miles', () => {
    expect(haversineMi([0, 0], [1, 0])).toBeCloseTo(69.09, 1)
  })

  it('interpolates the mile reached at a time and hides the truck outside the trip', () => {
    const track = buildTrack(route())
    expect(mileAtTime(track, 1800)).toBeCloseTo(25)
    expect(mileAtTime(track, 5400)).toBeCloseTo(75)
    expect(mileAtTime(track, -1)).toBeNull()
    expect(mileAtTime(track, 7201)).toBeNull()
  })

  it('finds the point at a mile along the drawn line', () => {
    const track = buildTrack(route())
    const [lon, lat] = pointAtMile(track, 50)
    expect(lat).toBeCloseTo(0)
    expect(lon).toBeCloseTo(50 / 69.09, 3)
    expect(pointAtMile(track, 1000)).toEqual([100 / 69.09, 0])
  })

  it('splits the line into contiguous risk segments using half-segment ownership', () => {
    const segs = riskSegments(route())
    expect(segs.map((s) => s.level)).toEqual([0, 3])
    // The Low segment ends halfway to the Severe checkpoint (mile 25).
    const lowEnd = segs[0]!.coords.at(-1)!
    expect(lowEnd[0]).toBeCloseTo(25 / 69.09, 2)
  })
})
