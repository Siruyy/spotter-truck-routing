import { render, screen } from '@testing-library/react'
import type { Checkpoint } from '@/api/types'
import { RiskChip } from '@/components/ui/RiskChip'
import { TripStrip } from './TripStrip'

const cp = (i: number, mile: number, level: Checkpoint['level']): Checkpoint => ({
  i,
  mile,
  lat: 0,
  lon: 0,
  eta: 0,
  tz: 'UTC',
  level,
  factor: 'wind',
  gust_advisory: false,
  weather: null,
})

describe('TripStrip', () => {
  it('merges same-level stretches and sizes them by owned miles', () => {
    render(
      <TripStrip
        label="strip"
        distance={100}
        checkpoints={[cp(0, 0, 0), cp(1, 25, 0), cp(2, 50, 3), cp(3, 75, 3), cp(4, 100, null)]}
      />,
    )
    const parts = screen.getByRole('img', { name: 'strip' }).children
    expect(parts).toHaveLength(3)
    expect((parts[0] as HTMLElement).style.width).toBe('37.5%')
    expect((parts[1] as HTMLElement).style.width).toBe('50%')
    expect((parts[2] as HTMLElement).style.width).toBe('12.5%')
  })
})

describe('RiskChip', () => {
  it('always pairs color with a text label', () => {
    render(<RiskChip level={4} />)
    expect(screen.getByText('No Travel')).toBeInTheDocument()
  })

  it('labels missing forecasts', () => {
    render(<RiskChip level={null} />)
    expect(screen.getByText('No forecast')).toBeInTheDocument()
  })
})
