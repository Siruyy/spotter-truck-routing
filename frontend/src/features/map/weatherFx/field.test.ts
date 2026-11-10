import type { Heatmap } from '@/api/types'
import { compass, windVector } from '@/lib/wind'
import { WeatherField } from './field'

function heat(dir: number, speed: number, rain = 0): Heatmap {
  const points: [number, number][] = []
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) points.push([40 + i * 0.5, -100 + j * 0.5])
  const n = points.length
  return {
    start: 0,
    hours: 1,
    spacing: 0.5,
    bbox: [-100, 40, -99, 41],
    points,
    layers: {
      risk: Array(n).fill(0),
      wind: Array(n).fill(speed),
      rain: Array(n).fill(rain),
      snow: Array(n).fill(0),
      wind_dir: Array(n).fill(dir),
    },
    load_applied: false,
    provider: 'open-meteo',
    stale_as_of: null,
  }
}

describe('wind helpers', () => {
  it('names compass points for where the wind comes from', () => {
    expect(compass(0)).toBe('N')
    expect(compass(225)).toBe('SW')
    expect(compass(359)).toBe('N')
  })
  it('points the motion vector away from the source', () => {
    const [east, north] = windVector(270) // from the west -> blows east
    expect(east).toBeCloseTo(1)
    expect(north).toBeCloseTo(0)
  })
})

describe('WeatherField', () => {
  it('samples speed, direction and rain inside the grid and nothing outside', () => {
    const f = new WeatherField(heat(180, 20, 0.2)) // from the south -> moves north
    f.setHour(0)
    const s = f.sample(-99.7, 40.3)
    expect(s).not.toBeNull()
    expect(s!.speed).toBeCloseTo(20)
    expect(s!.uy).toBeCloseTo(1)
    expect(s!.rain).toBeCloseTo(0.2)
    expect(f.sample(-90, 30)).toBeNull()
  })
})
