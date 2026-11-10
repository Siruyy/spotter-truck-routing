import type { Heatmap } from '@/api/types'
import { hourSummary } from './hourSummary'

const heat = (risk: number[], wind: number[]): Heatmap => ({
  start: 0,
  hours: 1,
  spacing: 0.5,
  bbox: [0, 0, 1, 1],
  points: risk.map((_, i) => [40, -100 + i * 0.5] as [number, number]),
  layers: { risk, wind, rain: risk.map(() => 0), snow: risk.map(() => 0) },
  load_applied: true,
  provider: 'open-meteo',
  stale_as_of: null,
})

describe('hourSummary', () => {
  it('says a calm hour is all Low instead of leaving the map unexplained', () => {
    expect(hourSummary(heat([0, 0, 0], [8, 12, 9]), 0, 'risk')).toBe('This hour: all Low across the area (wind up to 12 mph)')
  })
  it('names the worst level and its share', () => {
    expect(hourSummary(heat([0, 2, 3, 3], [8, 30, 40, 41]), 0, 'risk')).toBe('This hour: worst is Severe (50% of the area)')
    expect(hourSummary(heat([0, 2], [8, 30]), 0, 'wind')).toBe('This hour: wind up to 30 mph across the area')
    expect(hourSummary(heat([0], [8]), 0, 'rain')).toBe('This hour: no rain in the area')
  })
})
