import { useMap } from '@vis.gl/react-maplibre'
import { Marker as MlMarker } from 'maplibre-gl'
import { useEffect, useMemo } from 'react'
import type { PlannedRoute } from '@/api/types'
import { buildTrack, mileAtTime, pointAtMile } from '@/lib/geo'
import { useUi } from '@/store/ui'

const TRUCK_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M2 6.5A1.5 1.5 0 0 1 3.5 5h10A1.5 1.5 0 0 1 15 6.5V8h3.38a1.5 1.5 0 0 1 1.2.6l2.12 2.83a1.5 1.5 0 0 1 .3.9V16a1.5 1.5 0 0 1-1.5 1.5h-.63a2.5 2.5 0 0 1-4.74 0H9.87a2.5 2.5 0 0 1-4.74 0H3.5A1.5 1.5 0 0 1 2 16zM15 10v3.5h5.2L18.32 10zM7.5 18.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2m9.62 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2"/></svg>`

/** Where the truck on the selected route will be at the slider time. Updated outside React. */
export function TruckMarker({ route }: { route: PlannedRoute | null }) {
  const { current: map } = useMap()
  const track = useMemo(() => (route ? buildTrack(route) : null), [route])

  useEffect(() => {
    if (!map || !track) return
    const el = document.createElement('div')
    el.className = 'truck-marker'
    el.innerHTML = TRUCK_SVG
    el.setAttribute('role', 'img')
    el.setAttribute('aria-label', 'Truck position at the selected forecast hour')
    const marker = new MlMarker({ element: el }).setLngLat(track.coords[0] ?? [0, 0])
    let attached = false

    const update = (hour: number, start: number) => {
      const mile = mileAtTime(track, start + hour * 3600)
      if (mile === null) {
        if (attached) {
          marker.remove()
          attached = false
        }
        return
      }
      marker.setLngLat(pointAtMile(track, mile))
      if (!attached) {
        marker.addTo(map.getMap())
        attached = true
      }
    }
    const s = useUi.getState()
    update(s.hour, s.heatStart)
    let raf = 0
    const unsub = useUi.subscribe((st, prev) => {
      if (st.hour === prev.hour && st.heatStart === prev.heatStart) return
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const now = useUi.getState()
        update(now.hour, now.heatStart)
      })
    })
    return () => {
      unsub()
      if (raf) cancelAnimationFrame(raf)
      marker.remove()
    }
  }, [map, track])

  return null
}
