import { Navigation2 } from 'lucide-react'
import { compass } from '@/lib/wind'

/** Arrow pointing where the wind blows TO, with "from NW" text (never direction by arrow alone). */
export function WindDirection({ deg, className }: { deg: number | null | undefined; className?: string }) {
  if (deg === null || deg === undefined || deg < 0) return null
  return (
    <span className={className ?? 'inline-flex items-center gap-1'}>
      <Navigation2
        className="size-3.5 fill-current"
        style={{ transform: `rotate(${(deg + 180) % 360}deg)` }}
        aria-hidden="true"
      />
      <span>from {compass(deg)}</span>
    </span>
  )
}
