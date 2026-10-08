import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl'
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

import type { EventRow, GeoFeatureCollection } from '../lib/types'
import { useLanguage } from '../i18n/LanguageContext'
import { getFrontendConfig } from '../config'

// Keep the worker as a Vite asset instead of resolving it beside a prebundled module.
setWorkerUrl(mapLibreWorkerUrl)

const emptyGeoJson: GeoFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
}

function createMapStyle() {
  const config = getFrontendConfig().map
  const { satellite, reference } = config.tiles

  return {
    version: 8,
    name: 'Configured raster hybrid',
    sources: {
      satellite: {
        type: 'raster',
        tiles: [satellite.url],
        tileSize: satellite.tile_size,
        minzoom: satellite.min_zoom,
        maxzoom: satellite.max_zoom,
        attribution: satellite.attribution,
      },
      reference: {
        type: 'raster',
        tiles: [reference.url],
        tileSize: reference.tile_size,
        minzoom: reference.min_zoom,
        maxzoom: reference.max_zoom,
        attribution: reference.attribution,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#07111a' },
      },
      {
        id: 'satellite',
        type: 'raster',
        source: 'satellite',
        paint: {
          'raster-opacity': 1,
          'raster-saturation': -0.04,
          'raster-contrast': 0.06,
          'raster-brightness-min': 0,
          'raster-brightness-max': 1,
        },
      },
      {
        id: 'reference',
        type: 'raster',
        source: 'reference',
        paint: { 'raster-opacity': 1 },
      },
    ],
  } as any
}

export function MapPanel({
  geojson,
  selectedId,
  onSelect,
  rows = [],
}: {
  geojson?: GeoFeatureCollection
  selectedId?: string | null
  onSelect?: (rowId: string | null) => void
  rows?: EventRow[]
}) {
  const { tr } = useLanguage()
  const mapConfig = getFrontendConfig().map

  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const popupRef = useRef<Popup | null>(null)

  const dataRef = useRef<GeoFeatureCollection>(
    geojson || emptyGeoJson,
  )

  const rowsRef = useRef<EventRow[]>(rows)

  const [fatal, setFatal] = useState<string | null>(null)
  const [tilesWarning, setTilesWarning] = useState(false)

  const fitToData = (
    map: MapLibreMap,
    data: GeoFeatureCollection,
  ) => {
    if (!data.features.length) return false

    const bounds = new LngLatBounds()

    for (const feature of data.features) {
      const coordinates = feature.geometry.coordinates

      if (
        Array.isArray(coordinates) &&
        coordinates.length >= 2 &&
        typeof coordinates[0] === 'number' &&
        typeof coordinates[1] === 'number'
      ) {
        bounds.extend(coordinates as [number, number])
      }
    }

    if (bounds.isEmpty()) return false

    map.fitBounds(bounds, {
      padding: mapConfig.fit.data_padding,
      maxZoom: mapConfig.fit.data_max_zoom,
      duration: mapConfig.fit.duration_ms,
    })

    return true
  }

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(() => {
    dataRef.current = geojson || emptyGeoJson

    const map = mapRef.current

    if (!map || !map.isStyleLoaded()) return

    const source = map.getSource(
      'events',
    ) as GeoJSONSource | undefined

    source?.setData(dataRef.current as any)

    if (!fitToData(map, dataRef.current)) {
      map.fitBounds(mapConfig.bounds, {
        padding: mapConfig.fit.fallback_padding,
        duration: 0,
        maxZoom: mapConfig.fit.fallback_max_zoom,
      })
    }
  }, [geojson])

  useEffect(() => {
    if (!ref.current || mapRef.current) return

    try {
      setFatal(null)
      setTilesWarning(false)

      const map = new MapLibreMap({
        container: ref.current,
        style: createMapStyle(),
        center: mapConfig.initial_view.center,
        zoom: mapConfig.initial_view.zoom,
        attributionControl: false,
        renderWorldCopies: false,
        minZoom: mapConfig.initial_view.min_zoom,
        maxZoom: mapConfig.initial_view.max_zoom,
      })

      mapRef.current = map

      map.addControl(
        new NavigationControl({
          visualizePitch: true,
        }),
        'top-left',
      )

      map.addControl(
        new AttributionControl({
          compact: true,
        }),
        'bottom-right',
      )

      map.once('load', () => {
        if (!fitToData(map, dataRef.current)) {
          map.fitBounds(mapConfig.bounds, {
            padding: mapConfig.fit.fallback_padding,
            duration: 0,
            maxZoom: mapConfig.fit.fallback_max_zoom,
          })
        }

        map.addSource('events', {
          type: 'geojson',
          data: dataRef.current as any,
          cluster: true,
          clusterMaxZoom: mapConfig.cluster.max_zoom,
          clusterRadius: mapConfig.cluster.radius,
        })

        map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'events',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'step',
              ['get', 'point_count'],
              '#2563eb',
              10,
              '#1d4ed8',
              25,
              '#1e40af',
            ],
            'circle-opacity': 0.9,
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              17,
              10,
              22,
              25,
              29,
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#bfdbfe',
          },
        })

        map.addLayer({
          id: 'points',
          type: 'circle',
          source: 'events',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': [
              'match',
              ['get', 'result'],
              mapConfig.result_values.positive,
              mapConfig.result_colors.positive,
              mapConfig.result_values.negative,
              mapConfig.result_colors.negative,
              mapConfig.result_colors.default,
            ],
            'circle-radius': [
              'case',
              ['==', ['get', 'id'], selectedId || ''],
              9,
              6,
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#f8fafc',
          },
        })

        map.on('click', 'clusters', async (event) => {
          const feature = map.queryRenderedFeatures(
            event.point,
            {
              layers: ['clusters'],
            },
          )[0]

          if (!feature) return

          const clusterId = Number(
            feature.properties?.cluster_id,
          )

          const source = map.getSource(
            'events',
          ) as GeoJSONSource

          const zoom =
            await source.getClusterExpansionZoom(clusterId)

          const coords = (
            feature.geometry as any
          ).coordinates as [number, number]

          map.easeTo({
            center: coords,
            zoom,
          })
        })

        map.on('click', 'points', (event) => {
          const feature = event.features?.[0]

          if (!feature) return

          const props = feature.properties as any

          const coords = (
            feature.geometry as any
          ).coordinates as [number, number]

          const gridRef = props.grid_ref || '—'

          const row = rowsRef.current.find(
            (x) => x.id === String(props.id),
          )

          popupRef.current?.remove()

          popupRef.current = new Popup({
            closeButton: true,
            offset: 12,
          })
            .setLngLat(coords)
            .setHTML(
              `<div class="map-popup">
                <strong>${gridRef}</strong>
                <span>${row?.unit || props.unit || ''}</span>
                <span>${row?.purpose || props.purpose || ''}</span>
                <small>${
                  row?.timestamp?.replace('T', ' ') ||
                  props.timestamp ||
                  ''
                }</small>
              </div>`,
            )
            .addTo(map)

          onSelect?.(String(props.id))
        })

        map.on('mouseenter', 'points', () => {
          map.getCanvas().style.cursor = 'pointer'
        })

        map.on('mouseleave', 'points', () => {
          map.getCanvas().style.cursor = ''
        })

        map.on('mouseenter', 'clusters', () => {
          map.getCanvas().style.cursor = 'pointer'
        })

        map.on('mouseleave', 'clusters', () => {
          map.getCanvas().style.cursor = ''
        })
      })

      map.on('error', (event: any) => {
        const message = String(
          event?.error?.message || '',
        )

        console.warn(
          `[MapPanel ${mapConfig.panel_version}]`,
          message,
        )

        if (/tile|source|network|fetch/i.test(message)) {
          setTilesWarning(true)
        }
      })

      return () => {
        popupRef.current?.remove()

        map.remove()
        mapRef.current = null
      }
    } catch (error) {
      setFatal(
        error instanceof Error
          ? error.message
          : tr(
              'Не вдалося ініціалізувати карту',
              'Failed to initialize map',
            ),
      )
    }

    // Initialize only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !map.getLayer('points')) return

    map.setPaintProperty(
      'points',
      'circle-radius',
      [
        'case',
        ['==', ['get', 'id'], selectedId || ''],
        9,
        6,
      ] as any,
    )
  }, [selectedId])

  return (
    <div className="map-wrap">
      {fatal && (
        <div className="map-fallback">
          <strong>
            {tr(
              'Карта не ініціалізована.',
              'Map is not initialized.',
            )}
          </strong>

          <span>{fatal}</span>
        </div>
      )}

      {tilesWarning && !fatal && (
        <div className="map-tile-warning">
          {tr(
            'Частина картографічної підкладки тимчасово недоступна.',
            'Some map tiles are temporarily unavailable.',
          )}
        </div>
      )}

      <div
        ref={ref}
        className="map"
      />
    </div>
  )
}
