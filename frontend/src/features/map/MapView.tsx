import {
  Layer,
  Map,
  type MapLayerMouseEvent,
  type MapRef,
  Marker,
  NavigationControl,
  Popup,
  Source,
} from '@vis.gl/react-maplibre'
import type { FeatureCollection, LineString, Point } from 'geojson'
import type { PaddingOptions } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './setupMaplibre'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePlanHeatmap, useViewportHeatmap } from '@/api/hooks'
import type { Checkpoint, PlannedRoute } from '@/api/types'
import { riskSegments } from '@/lib/geo'
import { LEVELS, UNKNOWN_META } from '@/lib/risk'
import { selectedRoute, useUi } from '@/store/ui'
import { CheckpointDetails } from '@/features/results/CheckpointDetails'
import { HeatmapOverlay } from './HeatmapOverlay'
import { useHeatmapFrames } from './heatmap/useHeatmapFrames'
import { MAP_STYLES, ROUTE_FALLBACK_COLOR, US_VIEW } from './mapStyle'
import { TruckMarker } from './TruckMarker'

type Bbox = [number, number, number, number]
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }
const MAX_VIEWPORT_SPAN = 40

function lineFc(routes: PlannedRoute[]): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: routes.map((r) => ({
      type: 'Feature',
      properties: { id: r.id },
      geometry: { type: 'LineString', coordinates: r.geometry },
    })),
  }
}

function riskFc(route: PlannedRoute | null): FeatureCollection<LineString> {
  if (!route) return EMPTY as FeatureCollection<LineString>
  return {
    type: 'FeatureCollection',
    features: riskSegments(route).map((s) => ({
      type: 'Feature',
      properties: { level: s.level },
      geometry: { type: 'LineString', coordinates: s.coords },
    })),
  }
}

function checkpointFc(route: PlannedRoute | null): FeatureCollection<Point> {
  if (!route) return EMPTY as FeatureCollection<Point>
  return {
    type: 'FeatureCollection',
    features: route.checkpoints.map((c) => ({
      type: 'Feature',
      properties: { i: c.i, level: c.level ?? -1, route: route.id },
      geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
    })),
  }
}

const levelColor: unknown[] = ['match', ['get', 'level']]
for (const l of LEVELS) levelColor.push(l.level, l.color)
levelColor.push(UNKNOWN_META.color)

function fitPlan(map: MapRef, routes: PlannedRoute[], padding: PaddingOptions) {
  let w = 180
  let s = 90
  let e = -180
  let n = -90
  for (const r of routes)
    for (const [lon, lat] of r.geometry) {
      w = Math.min(w, lon)
      e = Math.max(e, lon)
      s = Math.min(s, lat)
      n = Math.max(n, lat)
    }
  if (w < e) map.fitBounds([w, s, e, n], { padding, duration: 900, maxZoom: 9 })
}

export function MapView({ padding, showZoom = false }: { padding: PaddingOptions; showZoom?: boolean }) {
  const mapRef = useRef<MapRef>(null)
  const theme = useUi((s) => s.theme)
  const plan = useUi((s) => s.plan)
  const route = useUi(selectedRoute)
  const selectedId = useUi((s) => s.selectedRouteId)
  const focus = useUi((s) => s.focus)
  const heatVisible = useUi((s) => s.heatVisible)
  const heatLayer = useUi((s) => s.heatLayer)
  const radar = useUi((s) => s.radar)
  const selectRoute = useUi((s) => s.selectRoute)
  const setFocus = useUi((s) => s.setFocus)
  const setHeat = useUi((s) => s.setHeat)
  const [labelsBefore, setLabelsBefore] = useState<string | undefined>()
  const [viewBbox, setViewBbox] = useState<Bbox | null>(null)
  const [zoomedOut, setZoomedOut] = useState(false)

  const planHeat = usePlanHeatmap(plan?.id ?? null, heatVisible && plan !== null)
  const viewHeat = useViewportHeatmap(viewBbox, null, heatVisible && plan === null && !zoomedOut)
  const heat = plan ? planHeat : viewHeat
  const frames = useHeatmapFrames(heatVisible ? (heat.data ?? null) : null, heatLayer)

  useEffect(() => {
    if (!heatVisible) setHeat(null, 'idle')
    else if (!plan && zoomedOut) setHeat(null, 'zoom-in')
    else if (heat.isError) setHeat(null, 'unavailable')
    else if (heat.data && frames) setHeat(heat.data.start, 'ready')
    else setHeat(heat.data?.start ?? null, 'loading')
  }, [heatVisible, plan, zoomedOut, heat.isError, heat.data, frames, setHeat])

  const others = useMemo(() => plan?.routes.filter((r) => r.id !== selectedId) ?? [], [plan, selectedId])
  const othersFc = useMemo(() => lineFc(others), [others])
  const selectedFc = useMemo(() => lineFc(route ? [route] : []), [route])
  const segmentsFc = useMemo(() => riskFc(route), [route])
  const pointsFc = useMemo(() => checkpointFc(route), [route])

  // Fit to the routes whenever a new plan arrives.
  useEffect(() => {
    if (plan && mapRef.current) fitPlan(mapRef.current, plan.routes, padding)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id])

  // Fly to a checkpoint picked from the list.
  useEffect(() => {
    if (!focus || focus.source !== 'list' || !route || !mapRef.current) return
    const cp = route.checkpoints[focus.index]
    if (cp) mapRef.current.easeTo({ center: [cp.lon, cp.lat], zoom: Math.max(mapRef.current.getZoom(), 7), duration: 600, padding })
  }, [focus, route, padding])

  const findLabelLayer = useCallback(() => {
    const style = mapRef.current?.getStyle()
    setLabelsBefore(style?.layers.find((l) => l.type === 'symbol')?.id)
  }, [])

  const updateViewport = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const b = map.getBounds()
    const bbox: Bbox = [
      Math.max(-180, b.getWest()),
      Math.max(-85, b.getSouth()),
      Math.min(180, b.getEast()),
      Math.min(85, b.getNorth()),
    ]
    const tooBig = bbox[2] - bbox[0] > MAX_VIEWPORT_SPAN || bbox[3] - bbox[1] > MAX_VIEWPORT_SPAN
    setZoomedOut(tooBig)
    if (!tooBig) {
      // Snap so tiny pans reuse the cached query.
      const q = (v: number) => Math.round(v * 2) / 2
      setViewBbox([q(bbox[0]), q(bbox[1]), q(bbox[2]), q(bbox[3])])
    }
  }, [])

  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onMoveEnd = useCallback(() => {
    clearTimeout(debounce.current)
    debounce.current = setTimeout(updateViewport, 600)
  }, [updateViewport])

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const f = e.features?.[0]
      if (!f) {
        setFocus(null)
        return
      }
      if (f.layer.id === 'checkpoints') {
        setFocus({ routeId: String(f.properties.route), index: Number(f.properties.i), source: 'map' })
      } else if (f.layer.id === 'route-other-hit') {
        selectRoute(String(f.properties.id))
      }
    },
    [selectRoute, setFocus],
  )

  const focused: Checkpoint | null =
    focus && route && focus.routeId === route.id ? (route.checkpoints[focus.index] ?? null) : null

  const lineBefore = labelsBefore
  return (
    <Map
      ref={mapRef}
      initialViewState={US_VIEW}
      mapStyle={MAP_STYLES[theme]}
      onLoad={(e) => {
        findLabelLayer()
        updateViewport()
        // Start with attribution collapsed to its (i) button; credits are also in the panel footer.
        e.target.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
      }}
      onStyleData={findLabelLayer}
      onMoveEnd={onMoveEnd}
      onClick={onClick}
      interactiveLayerIds={['checkpoints', 'route-other-hit']}
      cursor="auto"
      attributionControl={{ compact: true, customAttribution: 'Weather © <a href="https://open-meteo.com/">Open-Meteo</a> (CC BY 4.0) · Alerts & radar: NWS / IEM · Routing © TomTom' }}
      maxPitch={0}
      dragRotate={false}
      style={{ position: 'absolute', inset: 0 }}
    >
      {showZoom && <NavigationControl position="top-right" showCompass={false} />}

      {radar && (
        <Source
          id="radar"
          type="raster"
          tiles={['/radar/{z}/{x}/{y}.png']}
          tileSize={256}
          maxzoom={10}
          attribution="NEXRAD © Iowa Environmental Mesonet"
        >
          <Layer id="radar" type="raster" beforeId="route-other-casing" paint={{ 'raster-opacity': 0.65 }} />
        </Source>
      )}

      <Source id="routes-other" type="geojson" data={othersFc}>
        <Layer
          id="route-other-casing"
          type="line"
          beforeId={lineBefore}
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{ 'line-color': theme === 'dark' ? '#000' : '#fff', 'line-width': 7, 'line-opacity': 0.6 }}
        />
        <Layer
          id="route-other"
          type="line"
          beforeId={lineBefore}
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{ 'line-color': ROUTE_FALLBACK_COLOR, 'line-width': 3.5, 'line-opacity': 0.9 }}
        />
        <Layer id="route-other-hit" type="line" beforeId={lineBefore} paint={{ 'line-width': 18, 'line-opacity': 0 }} />
      </Source>

      <Source id="route-selected" type="geojson" data={selectedFc}>
        <Layer
          id="route-selected-casing"
          type="line"
          beforeId={lineBefore}
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{ 'line-color': theme === 'dark' ? '#050607' : '#ffffff', 'line-width': 11 }}
        />
      </Source>

      <Source id="route-risk" type="geojson" data={segmentsFc}>
        {/* Translucent underlay keeps the line continuous behind dashed levels. */}
        <Layer
          id="route-risk-under"
          type="line"
          beforeId={lineBefore}
          layout={{ 'line-join': 'round', 'line-cap': 'butt' }}
          paint={{ 'line-color': levelColor as never, 'line-width': 6, 'line-opacity': 0.35 }}
        />
        {[...LEVELS.map((l) => ({ level: l.level as number, dash: l.dash, color: l.color })), { level: -1, dash: [1, 1.5], color: UNKNOWN_META.color }].map((l) => (
          <Layer
            key={l.level}
            id={`route-risk-${l.level}`}
            type="line"
            beforeId={lineBefore}
            filter={['==', ['get', 'level'], l.level]}
            layout={{ 'line-join': 'round', 'line-cap': 'butt' }}
            paint={{
              'line-color': l.color,
              'line-width': 6,
              ...(l.dash ? { 'line-dasharray': l.dash } : {}),
            }}
          />
        ))}
      </Source>

      <Source id="checkpoints" type="geojson" data={pointsFc}>
        <Layer
          id="checkpoints"
          type="circle"
          beforeId={lineBefore}
          paint={{
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3.5, 8, 6.5],
            'circle-color': levelColor as never,
            'circle-stroke-color': theme === 'dark' ? '#050607' : '#ffffff',
            'circle-stroke-width': 2,
          }}
        />
      </Source>

      <HeatmapOverlay frames={frames} visible={heatVisible} beforeId="route-other-casing" />

      {plan?.routes.map((r) => {
        const mid = r.geometry[Math.floor(r.geometry.length * (r.id === 'A' ? 0.42 : r.id === 'B' ? 0.55 : 0.68))]
        if (!mid) return null
        const isSel = r.id === selectedId
        return (
          <Marker key={r.id} longitude={mid[0]} latitude={mid[1]} anchor="center">
            <button
              type="button"
              className={`route-pin ${isSel ? 'route-pin--active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                selectRoute(r.id)
              }}
              aria-label={`Select route ${r.id}`}
              aria-pressed={isSel}
            >
              {r.id}
            </button>
          </Marker>
        )
      })}

      {plan && (
        <>
          <Marker longitude={plan.request.origin.lon} latitude={plan.request.origin.lat} anchor="center">
            <span className="endpoint endpoint--origin" aria-label="Origin" />
          </Marker>
          <Marker longitude={plan.request.destination.lon} latitude={plan.request.destination.lat} anchor="bottom">
            <span className="endpoint endpoint--dest" aria-label="Destination" />
          </Marker>
        </>
      )}

      <TruckMarker route={route} />

      {focused && route && (
        <Popup
          longitude={focused.lon}
          latitude={focused.lat}
          anchor="bottom"
          offset={14}
          closeButton
          closeOnClick={false}
          onClose={() => setFocus(null)}
          maxWidth="300px"
          className="cp-popup"
        >
          <CheckpointDetails checkpoint={focused} routeName={route.name} routeId={route.id} />
        </Popup>
      )}
    </Map>
  )
}
