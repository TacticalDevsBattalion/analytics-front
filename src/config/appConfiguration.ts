import { getFrontendConfig } from './index'
import type { ComparisonDimension, ComparisonGranularity, ComparisonMode } from '../lib/types'
import type { CustomFilterDefinition } from '../lib/customFilters'

export type { CustomFilterDefinition } from '../lib/customFilters'

export type ConfiguredFilterKey = 'organization' | 'category' | 'purpose' | 'direction' | 'unit' | 'asset' | 'group' | 'class_name' | 'result' | 'time'
export type ConfiguredFilter = { key: ConfiguredFilterKey; label: string; placement: 'main' | 'extra' | 'hidden' }
export type DashboardBlock = 'timeline' | 'map' | 'events' | 'departments' | 'purposes' | 'lost_devices'
export type PurposeKpiRule = {
  purpose: string
  success_mode: 'source' | 'results'
  successful_results: string[]
  usefulness_percent: number
  coefficient: number
}
export type KpiConfiguration = { purpose_rules: PurposeKpiRule[] }
export type CardDetailsConfiguration = { interaction: 'auto' | 'click' | 'disabled'; hover_delay_ms: number; width: 'standard' | 'wide' }
export function defaultCardDetailsConfiguration(): CardDetailsConfiguration { return { interaction: 'auto', hover_delay_ms: 0, width: 'standard' } }
export type AppConfiguration = {
  filters: { layout: 'compact' | 'steps'; organization_dimension: ComparisonDimension; fields: ConfiguredFilter[]; custom?: CustomFilterDefinition[] }
  dashboard: { metric_keys: string[]; blocks: DashboardBlock[] }
  tables: { page_size: number; columns: string[] }
  appearance: { title: string; subtitle: string; density: 'compact' | 'comfortable'; default_page: string; menu: string[]; card_details: CardDetailsConfiguration }
  defaults: { date_range_days: number; comparison_mode: ComparisonMode; comparison_granularity: ComparisonGranularity }
  dictionaries: { labels: Record<string, Record<string, string>> }
  kpi: KpiConfiguration
}
export type PublicAppConfiguration = { revision: number; config: AppConfiguration; administration_enabled: boolean }
export type ConfigurationHistory = { revision: number; created_at: string; action: string }
export type AdministrationConfiguration = {
  revision: number; config: AppConfiguration; draft: AppConfiguration | null; draft_base_revision: number | null; history: ConfigurationHistory[]
  draft_version: number
}

export function defaultAppConfiguration(): AppConfiguration {
  const frontend = getFrontendConfig()
  return {
    filters: { layout: 'compact', organization_dimension: 'bbak', fields: [
      { key: 'organization', label: 'Підрозділ', placement: 'main' },
      { key: 'category', label: 'Кафедра', placement: 'main' },
      { key: 'purpose', label: 'Мета вильоту', placement: 'main' },
      { key: 'direction', label: 'Напрямок', placement: 'extra' },
      { key: 'unit', label: 'Зона відповідальності', placement: 'extra' },
      { key: 'asset', label: 'Конкретний засіб', placement: 'extra' },
      { key: 'group', label: 'Екіпаж', placement: 'extra' },
      { key: 'class_name', label: 'Клас цілі', placement: 'extra' },
      { key: 'result', label: 'Результат', placement: 'extra' },
      { key: 'time', label: 'Час і звітна доба', placement: 'extra' },
    ], custom: [] },
    dashboard: { metric_keys: [...frontend.ui.kpi_metric_keys], blocks: ['map', 'timeline', 'departments', 'lost_devices'] },
    tables: { page_size: frontend.ui.tables.main_page_size, columns: ['timestamp', 'grid_ref', 'direction', 'unit', 'category', 'asset', 'group', 'purpose', 'class_name', 'result'] },
    appearance: { title: frontend.app.branding.sidebar_title, subtitle: 'Огляд. Аналіз. Результат.', density: 'compact', default_page: frontend.app.routing.default_page, menu: ['dashboard', 'statistics', 'comparison', 'map', 'table', 'saved', 'dictionaries', 'settings'], card_details: defaultCardDetailsConfiguration() },
    defaults: { date_range_days: frontend.app.defaults.date_range_days, comparison_mode: 'units_over_time', comparison_granularity: 'week' },
    dictionaries: { labels: {} },
    kpi: { purpose_rules: [] },
  }
}

let currentConfiguration: AppConfiguration | null = null
export function getAppConfiguration(): AppConfiguration { return currentConfiguration ?? defaultAppConfiguration() }
export function setCurrentAppConfiguration(config: AppConfiguration) { currentConfiguration = config }
export function configuredFilterLabel(config: AppConfiguration, key: string, fallback: string): string {
  return config.filters.fields.find(field => field.key === key)?.label || fallback
}
export function configurationLabel(config: AppConfiguration, field: string, value: string, fallback?: string): string {
  return config.dictionaries.labels[field]?.[value] || fallback || value
}
