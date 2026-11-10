const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const

/** "NW" for a meteorological direction (where the wind comes FROM). */
export function compass(deg: number): string {
  return POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16] as string
}

/** Unit vector the air moves TOWARD, in map terms (east, north). */
export function windVector(fromDeg: number): [number, number] {
  const toward = ((fromDeg + 180) * Math.PI) / 180
  return [Math.sin(toward), Math.cos(toward)]
}
