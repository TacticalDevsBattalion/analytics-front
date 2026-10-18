import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from 'maplibre-gl'
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

import type { EventRow, GeoFeatureCollection, MapLines } from '../lib/types'
import { api } from '../lib/api'
import { TARGET_COLORS, targetPopupHtml } from '../lib/mapTargets'
import { useLanguage } from '../i18n/LanguageContext'
import { getFrontendConfig } from '../config'

// Keep the worker as a Vite asset instead of resolving it beside a prebundled module.
setWorkerUrl(mapLibreWorkerUrl)

const emptyGeoJson: GeoFeatureCollection = { type: 'FeatureCollection', features: [] }
const emptyLines: MapLines = { type: 'FeatureCollection', features: [] }
type Layer = 'flet' | 'front_line' | 'affected' | 'destroyed'
const LINE_LAYERS: Record<'flet' | 'front_line', string[]> = { flet: ['flet-casing', 'flet-line'], front_line: ['front-fill', 'front-outline'] }

function createMapStyle() {
  const { satellite, reference } = getFrontendConfig().map.tiles
  return {
    version: 8,
    name: 'Configured raster hybrid',
    sources: {
      satellite: { type: 'raster', tiles: [satellite.url], tileSize: satellite.tile_size, minzoom: satellite.min_zoom, maxzoom: satellite.max_zoom, attribution: satellite.attribution },
      reference: { type: 'raster', tiles: [reference.url], tileSize: reference.tile_size, minzoom: reference.min_zoom, maxzoom: reference.max_zoom, attribution: reference.attribution },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#07111a' } },
      { id: 'satellite', type: 'raster', source: 'satellite', paint: { 'raster-opacity': 1, 'raster-saturation': -0.04, 'raster-contrast': 0.06, 'raster-brightness-min': 0, 'raster-brightness-max': 1 } },
      { id: 'reference', type: 'raster', source: 'reference', paint: { 'raster-opacity': 1 } },
    ],
  } as any
}

function extend(bounds: LngLatBounds, coordinates: unknown) {
  if (Array.isArray(coordinates) && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') bounds.extend(coordinates as [number, number])
  else if (Array.isArray(coordinates)) for (const item of coordinates) extend(bounds, item)
}

export function MapPanel({
  geojson,
  selectedId,
  onSelect,
  rows = [],
  lines,
  coordinates,
}: {
  geojson?: GeoFeatureCollection
  selectedId?: string | null
  onSelect?: (rowId: string | null) => void
  rows?: EventRow[]
  /** FLET and front line; loaded by the panel itself when not given. */
  lines?: MapLines
  /** False when the viewer may not see exact target coordinates. */
  coordinates?: boolean
}) {
  const { tr } = useLanguage()
  const mapConfig = getFrontendConfig().map
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const popupRef = useRef<Popup | null>(null)
  const pinnedRef = useRef(false)
  const [fatal, setFatal] = useState<string | null>(null)
  const [tilesWarning, setTilesWarning] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [visible, setVisible] = useState<Record<Layer, boolean>>({ flet: true, front_line: true, affected: true, destroyed: true })

  const fetched = useQuery({ queryKey: ['map-lines'], queryFn: api.mapLines, enabled: lines === undefined, staleTime: 5 * 60_000 })
  const lineData = lines ?? fetched.data ?? emptyLines
  const canSeeTargets = coordinates ?? fetched.data?.coordinates ?? true
  const targets = geojson ?? emptyGeoJson
  const shownTargets = useMemo<GeoFeatureCollection>(() => ({ ...targets, features: targets.features.filter(feature => visible[feature.properties.status === 'destroyed' ? 'destroyed' : 'affected']) }), [targets, visible])
  const counts = useMemo(() => ({
    affected: targets.features.filter(feature => feature.properties.status !== 'destroyed').length,
    destroyed: targets.features.filter(feature => feature.properties.status === 'destroyed').length,
    flet: lineData.features.filter(feature => feature.properties.layer === 'flet').length,
    front_line: lineData.features.filter(feature => feature.properties.layer === 'front_line').length,
  }), [targets, lineData])
  const fletDate = lineData.features.find(feature => feature.properties.layer === 'flet')?.properties.valid_from

  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const fittedRef = useRef<string>('')

  // Fit once per data set: to the targets, else to the lines, else to the configured area.
  const fit = (map: MapLibreMap) => {
    const key = `${targets.features.length}:${targets.features[0]?.properties.id ?? ''}:${lineData.features.length}`
    if (fittedRef.current === key) return
    fittedRef.current = key
    const bounds = new LngLatBounds()
    for (const feature of targets.features) extend(bounds, feature.geometry.coordinates)
    if (bounds.isEmpty()) for (const feature of lineData.features) extend(bounds, feature.geometry.coordinates)
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: mapConfig.fit.data_padding, maxZoom: mapConfig.fit.data_max_zoom, duration: mapConfig.fit.duration_ms })
    else map.fitBounds(mapConfig.bounds, { padding: mapConfig.fit.fallback_padding, duration: 0, maxZoom: mapConfig.fit.fallback_max_zoom })
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    ;(map.getSource('events') as GeoJSONSource | undefined)?.setData(shownTargets as any)
    ;(map.getSource('lines') as GeoJSONSource | undefined)?.setData(lineData as any)
    fit(map)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownTargets, lineData, loaded])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    for (const layer of ['flet', 'front_line'] as const) for (const id of LINE_LAYERS[layer]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible[layer] ? 'visible' : 'none')
  }, [visible, loaded])

  useEffect(() => {
    if (!ref.current || mapRef.current) return
    try {
      setFatal(null)
      setTilesWarning(false)
      const map = new MapLibreMap({
        container: ref.current, style: createMapStyle(),
        center: mapConfig.initial_view.center, zoom: mapConfig.initial_view.zoom,
        attributionControl: false, renderWorldCopies: false,
        minZoom: mapConfig.initial_view.min_zoom, maxZoom: mapConfig.initial_view.max_zoom,
      })
      mapRef.current = map
      map.addControl(new NavigationControl({ visualizePitch: true }), 'top-left')
      map.addControl(new AttributionControl({ compact: true }), 'bottom-right')

      map.once('load', () => {
        map.addSource('lines', { type: 'geojson', data: emptyLines as any })
        map.addLayer({ id: 'front-fill', type: 'fill', source: 'lines', filter: ['all', ['==', ['get', 'layer'], 'front_line'], ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]], paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.08 } })
        map.addLayer({ id: 'front-outline', type: 'line', source: 'lines', filter: ['==', ['get', 'layer'], 'front_line'], paint: { 'line-color': '#f87171', 'line-width': 1.6, 'line-dasharray': [3, 2] } })
        map.addLayer({ id: 'flet-casing', type: 'line', source: 'lines', filter: ['==', ['get', 'layer'], 'flet'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#0b1220', 'line-width': 5.5, 'line-opacity': 0.75 } })
        map.addLayer({ id: 'flet-line', type: 'line', source: 'lines', filter: ['==', ['get', 'layer'], 'flet'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#38bdf8', 'line-width': 3 } })

        map.addSource('events', {
          type: 'geojson', data: emptyGeoJson as any,
          cluster: true, clusterMaxZoom: mapConfig.cluster.max_zoom, clusterRadius: mapConfig.cluster.radius,
          clusterProperties: { destroyed: ['+', ['case', ['==', ['get', 'status'], 'destroyed'], 1, 0]] },
        })
        map.addLayer({
          id: 'clusters', type: 'circle', source: 'events', filter: ['has', 'point_count'],
          paint: {
            // A cluster is red when it holds a destroyed target.
            'circle-color': ['case', ['>', ['get', 'destroyed'], 0], '#b91c1c', '#b45309'],
            'circle-opacity': 0.88,
            'circle-radius': ['step', ['get', 'point_count'], 14, 10, 19, 50, 25],
            'circle-stroke-width': 2, 'circle-stroke-color': '#fde68a',
          },
        })
        map.addLayer({
          id: 'points', type: 'circle', source: 'events', filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': ['case', ['==', ['get', 'status'], 'destroyed'], TARGET_COLORS.destroyed, ['==', ['get', 'status'], 'affected'], TARGET_COLORS.affected, mapConfig.result_colors.default],
            // Repeatedly struck targets are larger.
            'circle-radius': ['+', ['case', ['==', ['get', 'id'], selectedId || ''], 3, 0], ['interpolate', ['linear'], ['coalesce', ['get', 'strikes'], 1], 1, 5.5, 6, 9]],
            'circle-stroke-width': ['case', ['>', ['coalesce', ['get', 'strikes'], 1], 1], 2.5, 1.5],
            'circle-stroke-color': '#f8fafc',
          },
        })

        map.on('click', 'clusters', async (event) => {
          const feature = map.queryRenderedFeatures(event.point, { layers: ['clusters'] })[0]
          if (!feature) return
          const zoom = await (map.getSource('events') as GeoJSONSource).getClusterExpansionZoom(Number(feature.properties?.cluster_id))
          map.easeTo({ center: (feature.geometry as any).coordinates, zoom })
        })

        const show = (event: MapLayerMouseEvent, pin: boolean) => {
          const feature = event.features?.[0]
          if (!feature) return
          const props = feature.properties as any
          let html: string
          if (props.status) html = targetPopupHtml(props)
          else {
            // Points without a target state (other data sources) keep the old card.
            const row = rowsRef.current.find(item => item.id === String(props.id))
            html = `<div class="map-popup"><strong>${props.grid_ref || '—'}</strong><span>${row?.unit || props.unit || ''}</span><span>${row?.purpose || props.purpose || ''}</span><small>${row?.timestamp?.replace('T', ' ') || props.timestamp || ''}</small></div>`
          }
          popupRef.current?.remove()
          pinnedRef.current = pin
          popupRef.current = new Popup({ closeButton: pin, closeOnClick: pin, offset: 12, maxWidth: '340px', className: 'map-target-popup' })
            .setLngLat((feature.geometry as any).coordinates)
            .setHTML(html)
            .addTo(map)
          if (pin) onSelect?.(String(props.id))
        }
        let hovered = ''
        map.on('mousemove', 'points', (event) => {
          map.getCanvas().style.cursor = 'pointer'
          const id = String(event.features?.[0]?.properties?.id ?? '')
          if (!pinnedRef.current && id !== hovered) { hovered = id; show(event, false) }
        })
        map.on('mouseleave', 'points', () => { map.getCanvas().style.cursor = ''; hovered = ''; if (!pinnedRef.current) { popupRef.current?.remove(); popupRef.current = null } })
        map.on('click', 'points', (event) => show(event, true))
        map.on('click', (event) => {
          if (!map.queryRenderedFeatures(event.point, { layers: ['points'] }).length && pinnedRef.current) { popupRef.current?.remove(); pinnedRef.current = false }
        })
        map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = '' })
        setLoaded(true)
      })

      map.on('error', (event: any) => {
        const message = String(event?.error?.message || '')
        console.warn(`[MapPanel ${mapConfig.panel_version}]`, message)
        if (/tile|source|network|fetch/i.test(message)) setTilesWarning(true)
      })

      return () => {
        popupRef.current?.remove()
        map.remove()
        mapRef.current = null
      }
    } catch (error) {
      setFatal(error instanceof Error ? error.message : tr('Не вдалося ініціалізувати карту', 'Failed to initialize map'))
    }
    // Initialize only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('points')) return
    map.setPaintProperty('points', 'circle-radius', ['+', ['case', ['==', ['get', 'id'], selectedId || ''], 3, 0], ['interpolate', ['linear'], ['coalesce', ['get', 'strikes'], 1], 1, 5.5, 6, 9]] as any)
  }, [selectedId])

  const toggle = (layer: Layer) => setVisible(current => ({ ...current, [layer]: !current[layer] }))
  const legend: [Layer, string, number, string][] = [
    ['destroyed', 'Знищені цілі', counts.destroyed, TARGET_COLORS.destroyed],
    ['affected', 'Уражені цілі', counts.affected, TARGET_COLORS.affected],
    ['flet', fletDate ? `FLET (${fletDate.slice(0, 10)})` : 'FLET', counts.flet, '#38bdf8'],
    ['front_line', 'Лінія фронту', counts.front_line, '#f87171'],
  ]

  return (
    <div className="map-wrap">
      {fatal && <div className="map-fallback"><strong>{tr('Карта не ініціалізована.', 'Map is not initialized.')}</strong><span>{fatal}</span></div>}
      {tilesWarning && !fatal && <div className="map-tile-warning">{tr('Частина картографічної підкладки тимчасово недоступна.', 'Some map tiles are temporarily unavailable.')}</div>}
      <div ref={ref} className="map" />
      {!fatal && <div className="map-layers" role="group" aria-label="Шари карти">
        {legend.filter(([layer, , count]) => count > 0 || layer === 'affected' || layer === 'destroyed').map(([layer, label, count, color]) => <label key={layer} className={`map-layers__item map-layers__item--${layer === 'flet' || layer === 'front_line' ? 'line' : 'point'}`}>
          <input type="checkbox" checked={visible[layer]} onChange={() => toggle(layer)} />
          <i style={{ background: color }} />
          <span>{label}</span>
          {(layer === 'affected' || layer === 'destroyed') && <b>{count}</b>}
        </label>)}
        {!canSeeTargets && <small className="map-layers__note">Точки цілей приховані: потрібен дозвіл «map.coordinates».</small>}
      </div>}
    </div>
  )
}
