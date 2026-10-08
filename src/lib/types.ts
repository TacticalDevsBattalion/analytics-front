import type { KpiConfiguration } from '../config/appConfiguration'

export type FilterState = {
  date_from: string
  date_to: string
  time_from?: string
  time_to?: string
  direction: string[]
  unit: string[]
  category: string[]
  asset: string[]
  group: string[]
  bbak: string[]
  rota: string[]
  battalion: string[]
  purpose: string[]
  class_name: string[]
  result: string[]
}

export type MetricBreakdownItem = {
  key: string
  label: string
  value: number | null
  unit?: string | null
  children?: MetricBreakdownItem[]
  numerator?: number | null
  denominator?: number | null
}

export type Metric = {
  key: string
  label: string
  value: number | null
  unit?: string
  delta?: number
  primary_label?: string | null
  secondary_label?: string | null
  secondary_value?: number | null
  breakdown_title?: string | null
  breakdown?: MetricBreakdownItem[]
  calculation_fingerprint?: string | null
  numerator?: number | null
  denominator?: number | null
}

export type ComparisonDimension = 'unit' | 'bbak' | 'rota' | 'battalion'
export type ComparisonGranularity = 'day' | 'week' | 'month' | 'quarter'
export type ComparisonMode = 'periods' | 'units' | 'units_over_time'

export type ComparisonFilterSettings = {
  enabled: boolean
  mode: ComparisonMode
  dimension: ComparisonDimension
  granularity: ComparisonGranularity
  reference: 'previous' | 'custom'
  reference_period: Pick<FilterState, 'date_from' | 'date_to' | 'time_from' | 'time_to'>
}

export type ComparisonPeriod = {
  id: string
  label: string
  date_from: string
  date_to: string
  time_from?: string | null
  time_to?: string | null
  is_partial: boolean
  is_current?: boolean
  is_future?: boolean
}

export type ComparisonRequest = {
  mode: ComparisonMode
  filters: FilterState
  comparison_filters?: FilterState
  units?: string[]
  dimension?: ComparisonDimension
  granularity?: ComparisonGranularity
}

export type ComparisonSelection = {
  id: string
  label: string
  filters: FilterState
  metrics: Metric[]
  period_id?: string | null
  group_id?: string | null
}

export type ComparisonResponse = {
  mode: ComparisonMode
  baseline_id: string
  dimension: ComparisonDimension
  selections: ComparisonSelection[]
  periods?: ComparisonPeriod[]
  granularity?: ComparisonGranularity | null
  kpi_fingerprint?: string | null
  configuration_revision?: number | null
  source?: SourceStatus['source'] | null
  kpi_configuration?: KpiConfiguration | null
}

export type KpiOptions = { purposes: string[]; results: string[] }
export type PurposeKpiCalculation = {
  purpose: string
  flights: number
  successful_flights: number
  success_rate: number
  usefulness_percent: number
  coefficient: number
  usefulness_points: number
  weighted_flights: number
  weighted_efficiency: number | null
  success_mode: 'source' | 'results'
  successful_results: string[]
}
export type KpiPreview = {
  source: string
  total_flights: number
  successful_flights: number
  usefulness_points: number
  weighted_flights: number
  weighted_efficiency: number | null
  purposes: PurposeKpiCalculation[]
}

export type TimelinePoint = {
  date: string
  total: number
  effective: number
  day?: number
  night?: number
  day_effective?: number
  night_effective?: number
  day_efficiency?: number
  night_efficiency?: number
}

export type EventRow = {
  id: string
  timestamp: string
  direction: string
  unit: string
  category: string
  asset: string
  group: string
  purpose: string
  class_name: string
  result: string
  grid_ref: string
  lat: number
  lon: number
}

export type IdTitleOption = {
  id: number
  title: string
}

export type FilterOptions = {
  direction: string[]
  unit: string[]
  category: string[]
  asset: string[]
  group: string[]
  bbak: IdTitleOption[]
  rota: string[]
  battalion: IdTitleOption[]
  purpose: string[]
  class_name: string[]
  result: string[]
}

export type GeoFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: {
      id: string
      result: string
      unit: string
      category: string
      asset?: string
      grid_ref: string
      timestamp?: string
      purpose?: string
      class_name?: string
    }
  }>
}

export type SourceStatus = {
  source: 'mock' | 'clickhouse' | 'external' | 'database'
  label: string
  connected: boolean
  upstream?: string | null
  message: string
}
