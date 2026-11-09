export function miles(value: number): string {
  if (value === 0) return '0'
  if (value < 10) return value.toFixed(1)
  return Math.round(value).toLocaleString('en-US')
}

export function pounds(value: number): string {
  return `${Math.round(value).toLocaleString('en-US')} lb`
}

export function mph(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)} mph`
}

export function rate(value: number | null): string {
  if (value === null) return '—'
  if (value === 0) return '0 in/hr'
  return `${value < 0.1 ? value.toFixed(2) : value.toFixed(2)} in/hr`
}

export function temp(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}°F`
}

export function visibility(value: number | null): string {
  if (value === null) return '—'
  return value >= 10 ? '10+ mi' : `${value.toFixed(1)} mi`
}

const WMO: Record<number, string> = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Freezing fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Violent showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm, hail',
  99: 'Thunderstorm, hail',
}

export function sky(code: number | null): string {
  return code === null ? '' : (WMO[code] ?? '')
}
