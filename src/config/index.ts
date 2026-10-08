export type AppLanguage = 'uk' | 'en'

export type FrontendAppConfig = {
  branding: {
    app_name: string
    short_name: string
    sidebar_title: string
    sidebar_version: string
  }
  routing: {
    default_page: string
  }
  defaults: {
    date_range_days: number
    calendar_anchor_hour: number
    density: 'comfortable' | 'compact'
    animations: boolean
  }
  query: {
    stale_time_ms: number
    refetch_on_window_focus: boolean
    source_status_refetch_ms: number
    retry_count: number
  }
  language: {
    default: AppLanguage
    storage_key: string
    locales: Record<AppLanguage, string>
  }
  storage: {
    density_key: string
    animations_key: string
    saved_views_key: string
  }
  special_filters: {
    lost_devices_result: string
  }
}

export type FrontendApiConfig = {
  base_url: string
  endpoints: {
    source_status: string
    filter_options: string
    overview: string
    comparison: string
    timeline: string
    events: string
    map: string
  }
}

export type FrontendUiConfig = {
  kpi_metric_keys: string[]
  lost_department_order: string[]
  tables: {
    default_page_size: number
    main_page_size: number
  }
  filters: {
    quick_periods: Array<{ key: string; days: number; offset: number }>
    reporting_cutoffs: string[]
    default_reporting_cutoff: string
    mobile_breakpoint_px: number
    full_day_start: string
    full_day_end: string
  }
  timeline: {
    day_start: string
    night_start: string
  }
  source_labels: Record<string, string>
}

export type FrontendMapConfig = {
  panel_version: string
  bounds: [[number, number], [number, number]]
  initial_view: {
    center: [number, number]
    zoom: number
    min_zoom: number
    max_zoom: number
  }
  fit: {
    data_padding: number
    data_max_zoom: number
    duration_ms: number
    fallback_padding: number
    fallback_max_zoom: number
  }
  cluster: {
    max_zoom: number
    radius: number
  }
  tiles: {
    satellite: MapTileSourceConfig
    reference: MapTileSourceConfig
  }
  result_values: {
    positive: string
    negative: string
  }
  result_colors: {
    positive: string
    negative: string
    default: string
  }
}

type MapTileSourceConfig = {
  url: string
  tile_size: number
  min_zoom: number
  max_zoom: number
  attribution: string
}

export type FrontendPwaConfig = {
  enabled: boolean
  service_worker: {
    path: string
    scope: string
  }
  cache: {
    name: string
    app_shell: string[]
    bypass_prefixes: string[]
    asset_prefixes: string[]
    manifest_path: string
  }
  manifest: {
    name: string
    short_name: string
    description: string
    lang: string
    start_url: string
    scope: string
    display: string
    background_color: string
    theme_color: string
    orientation: string
    icons: Array<{
      src: string
      sizes: string
      type: string
      purpose?: string
    }>
  }
}

export type FrontendConfig = {
  app: FrontendAppConfig
  api: FrontendApiConfig
  ui: FrontendUiConfig
  map: FrontendMapConfig
  pwa: FrontendPwaConfig
}

const CONFIG_BASE = '/config/frontend'
let loadedConfig: FrontendConfig | null = null

async function loadJson<T>(name: string): Promise<T> {
  const response = await fetch(`${CONFIG_BASE}/${name}.json`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Failed to load frontend config ${name}.json: ${response.status}`)
  }

  return response.json() as Promise<T>
}

function validateConfig(config: FrontendConfig) {
  if (!config.api.endpoints.events || !config.api.endpoints.overview) {
    throw new Error('Frontend API config is incomplete')
  }

  if (!config.ui.filters.reporting_cutoffs.length) {
    throw new Error('At least one reporting cutoff is required')
  }

  if (!config.ui.filters.reporting_cutoffs.includes(config.ui.filters.default_reporting_cutoff)) {
    throw new Error('default_reporting_cutoff must be present in reporting_cutoffs')
  }
}

export async function loadFrontendConfig(): Promise<FrontendConfig> {
  if (loadedConfig) return loadedConfig

  const [app, api, ui, map, pwa] = await Promise.all([
    loadJson<FrontendAppConfig>('app'),
    loadJson<FrontendApiConfig>('api'),
    loadJson<FrontendUiConfig>('ui'),
    loadJson<FrontendMapConfig>('map'),
    loadJson<FrontendPwaConfig>('pwa'),
  ])

  const config = { app, api, ui, map, pwa }
  validateConfig(config)
  loadedConfig = config
  return config
}

export function getFrontendConfig(): FrontendConfig {
  if (!loadedConfig) {
    throw new Error('Frontend configuration has not been loaded yet')
  }

  return loadedConfig
}

export function withApiBase(path: string): string {
  const { base_url } = getFrontendConfig().api
  if (!base_url) return path
  return `${base_url.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}
