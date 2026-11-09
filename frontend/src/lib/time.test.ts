import { resolveDeparture } from '@/features/plan-form/departure'
import { clock, duration, fromLocalInput, localHourEpoch, toLocalInput, tzAt } from './time'

describe('time helpers', () => {
  const now = Date.UTC(2026, 10, 10, 15, 30) / 1000 // 9:30 AM in Chicago (CST)

  it('looks up the timezone of a coordinate', () => {
    expect(tzAt(32.78, -96.8)).toBe('America/Chicago')
    expect(tzAt(39.74, -104.99)).toBe('America/Denver')
  })

  it('formats clock times in the given zone', () => {
    expect(clock(now, 'America/Chicago')).toBe('9:30 AM CST')
    expect(clock(now, 'America/Denver', false)).toBe('8:30 AM')
  })

  it('resolves "tomorrow 6 AM" in the origin timezone, not the browser’s', () => {
    const e = localHourEpoch(6, 'America/Chicago', true, now)
    expect(new Date(e * 1000).toISOString()).toBe('2026-11-11T12:00:00.000Z')
    expect(resolveDeparture({ kind: 'tomorrow6' }, 'America/Denver', now)).toBe(Date.UTC(2026, 10, 11, 13) / 1000)
    expect(resolveDeparture({ kind: 'plus2' }, 'UTC', now)).toBe(now + 7200)
  })

  it('round-trips datetime-local values through a zone', () => {
    const v = toLocalInput(now, 'America/Chicago')
    expect(v).toBe('2026-11-10T09:30')
    expect(fromLocalInput(v, 'America/Chicago')).toBe(now)
    expect(fromLocalInput('', 'UTC')).toBeNull()
  })

  it('formats durations', () => {
    expect(duration(43_161)).toBe('11 h 59 m')
    expect(duration(1500)).toBe('25 m')
  })
})
