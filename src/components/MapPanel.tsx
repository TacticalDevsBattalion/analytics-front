import 'maplibre-gl/dist/maplibre-gl.css'
import { usePreferenceSync } from '../config/PreferencesContext'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Layers, X } from 'lucide-react'
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
import { InfoHint } from './help/InfoHint'
import { explainWidget } from '../lib/widgetExplanations'
import { TARGET_COLORS, sortTargets, targetListHtml, targetPopupHtml } from '../lib/mapTargets'
import { useLanguage } from '../i18n/LanguageContext'
import { getFrontendConfig } from '../config'

// Keep the worker as a Vite asset instead of resolving it beside a prebundled module.
setWorkerUrl(mapLibreWorkerUrl)

const emptyGeoJson: GeoFeatureCollection = { type: 'FeatureCollection', features: [] }
const emptyLines: MapLines = { type: 'FeatureCollection', features: [] }
const mapHelp = explainWidget({ builtin: 'map' })
type Layer = 'occupied' | 'front_line' | 'affected' | 'destroyed'
const LINE_LAYERS: Record<'occupied' | 'front_line', string[]> = { occupied: ['occupied-fill'], front_line: ['front-casing', 'front-line'] }
const OCCUPIED_OPACITY: Record<Basemap, number> = { dark: 0.3, satellite: 0.22 }

export type Basemap = 'dark' | 'satellite'
const BASEMAP_KEY = 'analytics.map.basemap'
const BASEMAP_LAYERS: Record<Basemap, string[]> = { dark: ['dark', 'dark-labels'], satellite: ['satellite', 'reference'] }

// "{s}" in a tile URL spreads requests over the a–d subdomains.
const tileUrls = (url: string) => url.includes('{s}') ? ['a', 'b', 'c', 'd'].map(sub => url.replace('{s}', sub)) : [url]

function rasterSource(source: { url: string; tile_size: number; min_zoom: number; max_zoom: number; attribution: string }) {
  return { type: 'raster', tiles: tileUrls(source.url), tileSize: source.tile_size, minzoom: source.min_zoom, maxzoom: source.max_zoom, attribution: source.attribution }
}

export function availableBasemaps(): Basemap[] {
  return getFrontendConfig().map.tiles.dark ? ['dark', 'satellite'] : ['satellite']
}

function initialBasemap(): Basemap {
  const available = availableBasemaps()
  try {
    const saved = localStorage.getItem(BASEMAP_KEY) as Basemap | null
    if (saved && available.includes(saved)) return saved
  } catch { /* storage may be blocked */ }
  const configured = getFrontendConfig().map.default_basemap
  return configured && available.includes(configured) ? configured : available[0]
}

const LAYERS_OPEN_KEY = 'analytics.map.layers_open'

// The layer panel starts folded on small screens; the viewer's choice is remembered.
function initialLayersOpen(): boolean {
  try {
    const saved = localStorage.getItem(LAYERS_OPEN_KEY)
    if (saved === '1' || saved === '0') return saved === '1'
  } catch { /* storage may be blocked */ }
  return typeof window === 'undefined' || window.innerWidth > (getFrontendConfig().ui.filters.mobile_breakpoint_px ?? 720)
}

function createMapStyle(basemap: Basemap) {
  const { satellite, reference, dark, dark_labels: darkLabels } = getFrontendConfig().map.tiles
  const visibility = (name: Basemap) => ({ visibility: basemap === name ? 'visible' : 'none' })
  return {
    version: 8,
    name: 'Configured raster basemaps',
    sources: {
      satellite: rasterSource(satellite),
      reference: rasterSource(reference),
      ...(dark ? { dark: rasterSource(dark) } : {}),
      ...(darkLabels ? { 'dark-labels': rasterSource(darkLabels) } : {}),
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': basemap === 'dark' ? '#0b0e12' : '#07111a' } },
      // Inverted brightness turns a light map dark while labels stay readable.
      ...(dark ? [{ id: 'dark', type: 'raster', source: 'dark', layout: visibility('dark'), paint: dark.invert ? { 'raster-brightness-min': 0.9, 'raster-brightness-max': 0.08, 'raster-saturation': -0.85, 'raster-hue-rotate': 180, 'raster-contrast': 0.05 } : {} }] : []),
      { id: 'satellite', type: 'raster', source: 'satellite', layout: visibility('satellite'), paint: { 'raster-opacity': 1, 'raster-saturation': -0.04, 'raster-contrast': 0.06, 'raster-brightness-min': 0, 'raster-brightness-max': 1 } },
      { id: 'reference', type: 'raster', source: 'reference', layout: visibility('satellite'), paint: { 'raster-opacity': 1 } },
      ...(darkLabels ? [{ id: 'dark-labels', type: 'raster', source: 'dark-labels', layout: visibility('dark') }] : []),
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
  /** Occupied territory and front line; loaded by the panel itself when not given. */
  lines?: MapLines
  /** False when the viewer may not see exact target coordinates. */
  coordinates?: boolean
}) {
  const { tr } = useLanguage()
  const mapConfig = getFrontendConfig().map
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const popupRef = useRef<Popup | null>(null)
  // A clicked card or cluster list stays open; hovering does not replace it.
  const pinnedRef = useRef(false)
  const [fatal, setFatal] = useState<string | null>(null)
  const [tilesWarning, setTilesWarning] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [visible, setVisible] = useState<Record<Layer, boolean>>({ occupied: true, front_line: true, affected: true, destroyed: true })
  const [basemap, setBasemap] = useState<Basemap>(initialBasemap)
  // The basemap follows the user to every device; the folded layer panel stays per device.
  usePreferenceSync<{ basemap?: Basemap }>('map', { basemap }, saved => { if (saved.basemap && availableBasemaps().includes(saved.basemap)) setBasemap(saved.basemap) })
  const basemapRef = useRef(basemap)
  const [layersOpen, setLayersOpen] = useState(initialLayersOpen)

  const fetched = useQuery({ queryKey: ['map-lines'], queryFn: api.mapLines, enabled: lines === undefined, staleTime: 5 * 60_000 })
  const lineData = lines ?? fetched.data ?? emptyLines
  const canSeeTargets = coordinates ?? fetched.data?.coordinates ?? true
  const targets = geojson ?? emptyGeoJson
  const shownTargets = useMemo<GeoFeatureCollection>(() => ({ ...targets, features: targets.features.filter(feature => visible[feature.properties.status === 'destroyed' ? 'destroyed' : 'affected']) }), [targets, visible])
  const counts = useMemo(() => ({
    affected: targets.features.filter(feature => feature.properties.status !== 'destroyed').length,
    destroyed: targets.features.filter(feature => feature.properties.status === 'destroyed').length,
    occupied: lineData.features.filter(feature => feature.properties.layer === 'occupied').length,
    front_line: lineData.features.filter(feature => feature.properties.layer === 'front_line').length,
  }), [targets, lineData])
  const frontDate = lineData.features.find(feature => feature.properties.layer === 'front_line')?.properties.valid_from

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
    for (const layer of ['occupied', 'front_line'] as const) for (const id of LINE_LAYERS[layer]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible[layer] ? 'visible' : 'none')
  }, [visible, loaded])

  useEffect(() => {
    basemapRef.current = basemap
    try { localStorage.setItem(BASEMAP_KEY, basemap) } catch { /* storage may be blocked */ }
    const map = mapRef.current
    if (!map || !loaded) return
    for (const [name, layers] of Object.entries(BASEMAP_LAYERS)) for (const id of layers) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', name === basemap ? 'visible' : 'none')
    map.setPaintProperty('background', 'background-color', basemap === 'dark' ? '#0b0e12' : '#07111a')
    map.setPaintProperty('occupied-fill', 'fill-opacity', OCCUPIED_OPACITY[basemap])
  }, [basemap, loaded])

  useEffect(() => {
    if (!ref.current || mapRef.current) return
    try {
      setFatal(null)
      setTilesWarning(false)
      const map = new MapLibreMap({
        container: ref.current, style: createMapStyle(basemapRef.current),
        center: mapConfig.initial_view.center, zoom: mapConfig.initial_view.zoom,
        attributionControl: false, renderWorldCopies: false,
        minZoom: mapConfig.initial_view.min_zoom, maxZoom: mapConfig.initial_view.max_zoom,
      })
      mapRef.current = map
      map.addControl(new NavigationControl({ visualizePitch: true }), 'top-left')
      map.addControl(new AttributionControl({ compact: true }), 'bottom-right')

      map.once('load', () => {
        map.addSource('lines', { type: 'geojson', data: emptyLines as any })
        // Occupied territory in red with the front line along its edge, as on DeepState.
        map.addLayer({ id: 'occupied-fill', type: 'fill', source: 'lines', filter: ['==', ['get', 'layer'], 'occupied'], paint: { 'fill-color': '#d7261e', 'fill-opacity': OCCUPIED_OPACITY[basemapRef.current] } })
        map.addLayer({ id: 'front-casing', type: 'line', source: 'lines', filter: ['==', ['get', 'layer'], 'front_line'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#0b0e12', 'line-width': 4, 'line-opacity': 0.6 } })
        map.addLayer({ id: 'front-line', type: 'line', source: 'lines', filter: ['==', ['get', 'layer'], 'front_line'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ff3b30', 'line-width': 2 } })

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

        const openPopup = (coordinates: [number, number], html: string, pin = true) => {
          const previous = popupRef.current
          popupRef.current = null
          previous?.remove()
          pinnedRef.current = pin
          const popup = new Popup({ closeButton: pin, closeOnClick: pin, offset: 12, maxWidth: '320px', className: 'map-target-popup' })
            .setLngLat(coordinates)
            .setHTML(html)
            .addTo(map)
          popup.on('close', () => { if (popupRef.current === popup) { popupRef.current = null; pinnedRef.current = false } })
          popupRef.current = popup
          return popup
        }

        // A cluster lists its targets instead of zooming; a row opens the target.
        map.on('click', 'clusters', async (event) => {
          const feature = map.queryRenderedFeatures(event.point, { layers: ['clusters'] })[0]
          if (!feature) return
          const source = map.getSource('events') as GeoJSONSource
          const clusterId = Number(feature.properties?.cluster_id)
          const total = Number(feature.properties?.point_count ?? 0)
          const center = (feature.geometry as any).coordinates as [number, number]
          const leaves = sortTargets(await source.getClusterLeaves(clusterId, 300, 0) as any[])
          const showList = () => {
            const popup = openPopup(center, targetListHtml(leaves, total))
            const element = popup.getElement()
            element.querySelector('[data-action="zoom"]')?.addEventListener('click', async () => {
              popup.remove()
              map.easeTo({ center, zoom: await source.getClusterExpansionZoom(clusterId) })
            })
            element.querySelectorAll<HTMLButtonElement>('[data-index]').forEach(button => button.addEventListener('click', () => {
              const target = leaves[Number(button.dataset.index)]
              if (!target) return
              // The card belongs to the target's own point: the cluster centre moves away when it splits on zoom.
              const detail = openPopup((target.geometry as any).coordinates as [number, number], targetPopupHtml(target.properties, { back: true }))
              detail.getElement().querySelector('[data-action="back"]')?.addEventListener('click', showList)
              onSelect?.(String(target.properties.id))
            }))
          }
          showList()
        })

        const pointHtml = (props: any) => {
          if (props.status) return targetPopupHtml(props)
          // Points without a target state (other data sources) keep the old card.
          const row = rowsRef.current.find(item => item.id === String(props.id))
          return `<div class="map-popup"><strong>${props.grid_ref || '—'}</strong><span>${row?.unit || props.unit || ''}</span><span>${row?.purpose || props.purpose || ''}</span><small>${row?.timestamp?.replace('T', ' ') || props.timestamp || ''}</small></div>`
        }

        // Hover shows the card; a click keeps it open.
        // Touch screens have no hover: a tap opens the card with a close button.
        let hovered = ''
        const noHover = window.matchMedia?.('(hover: none)').matches
        map.on('mousemove', 'points', (event) => {
          map.getCanvas().style.cursor = 'pointer'
          if (noHover) return
          const feature = event.features?.[0]
          const id = String(feature?.properties?.id ?? '')
          if (!feature || pinnedRef.current || id === hovered) return
          hovered = id
          openPopup((feature.geometry as any).coordinates, pointHtml(feature.properties), false)
        })
        map.on('mouseleave', 'points', () => {
          map.getCanvas().style.cursor = ''
          hovered = ''
          if (!pinnedRef.current) { const popup = popupRef.current; popupRef.current = null; popup?.remove() }
        })
        map.on('click', 'points', (event) => {
          const feature = event.features?.[0]
          if (!feature) return
          const props = feature.properties as any
          openPopup((feature.geometry as any).coordinates, pointHtml(props))
          onSelect?.(String(props.id))
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

  const toggleLayers = () => setLayersOpen(current => {
    try { localStorage.setItem(LAYERS_OPEN_KEY, current ? '0' : '1') } catch { /* storage may be blocked */ }
    return !current
  })
  const toggle = (layer: Layer) => setVisible(current => ({ ...current, [layer]: !current[layer] }))
  const legend: [Layer, string, number, string][] = [
    ['destroyed', 'Знищені цілі', counts.destroyed, TARGET_COLORS.destroyed],
    ['affected', 'Уражені цілі', counts.affected, TARGET_COLORS.affected],
    ['front_line', frontDate ? `Лінія фронту (${frontDate.slice(0, 10)})` : 'Лінія фронту', counts.front_line, '#ff3b30'],
    ['occupied', 'Окупована територія', counts.occupied, 'rgba(215,38,30,.6)'],
  ]

  return (
    <div className="map-wrap">
      {fatal && <div className="map-fallback"><strong>{tr('Карта не ініціалізована.', 'Map is not initialized.')}</strong><span>{fatal}</span></div>}
      {tilesWarning && !fatal && <div className="map-tile-warning">{tr('Частина картографічної підкладки тимчасово недоступна.', 'Some map tiles are temporarily unavailable.')}</div>}
      <div ref={ref} className="map" />
      {!fatal && !layersOpen && <button type="button" className="map-layers-toggle" onClick={toggleLayers} aria-expanded={false} title="Підкладка і шари"><Layers size={16} /><span>Шари</span></button>}
      {!fatal && layersOpen && <div className="map-layers" role="group" aria-label="Шари карти">
        <div className="map-layers__title"><span>Підкладка і шари{mapHelp && <InfoHint title="Карта">{mapHelp.lead && <p>{mapHelp.lead}</p>}<dl>{mapHelp.items.map(item => <div key={item.term}><dt>{item.term}</dt><dd>{item.text}</dd></div>)}</dl></InfoHint>}</span><button type="button" onClick={toggleLayers} aria-expanded={true} aria-label="Сховати панель шарів"><X size={14} /></button></div>
        {availableBasemaps().length > 1 && <div className="map-layers__basemap" role="radiogroup" aria-label="Підкладка">{availableBasemaps().map(name => <button type="button" role="radio" aria-checked={basemap === name} className={basemap === name ? 'active' : ''} key={name} onClick={() => setBasemap(name)}>{name === 'dark' ? 'Темна' : 'Супутник'}</button>)}</div>}
        {legend.filter(([layer, , count]) => count > 0 || layer === 'affected' || layer === 'destroyed').map(([layer, label, count, color]) => <label key={layer} className={`map-layers__item map-layers__item--${layer === 'front_line' ? 'line' : layer === 'occupied' ? 'area' : 'point'}`}>
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
