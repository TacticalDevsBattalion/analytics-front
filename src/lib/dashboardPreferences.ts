import type { AppConfiguration } from '../config/appConfiguration'

export const DASHBOARD_METRIC_KEYS = [
  'flights', 'effective', 'detected', 'affected', 'destroyed', 'efficiency',
  'avg_flights_per_position', 'weighted_efficiency',
] as const
export const DASHBOARD_WIDGET_KEYS = [
  'timeline', 'map', 'events', 'departments', 'purposes', 'lost_devices',
  'timeline_line', 'timeline_bar', 'timeline_area', 'category_chart', 'purpose_chart',
] as const
export const DASHBOARD_BACKGROUNDS = ['default', 'navy', 'graphite', 'forest'] as const
export type DashboardWidget = typeof DASHBOARD_WIDGET_KEYS[number]
export type DashboardBackground = typeof DASHBOARD_BACKGROUNDS[number]
export type DashboardDensity = 'compact' | 'comfortable'
export type DashboardChartStyles = {
  timeline: 'combined' | 'bars' | 'line' | 'area'
  category: 'bars' | 'donut'
  purpose: 'bars' | 'donut'
}
export type PersonalDashboardPreferences = {
  version: 1
  metric_keys: string[] | null
  blocks: DashboardWidget[] | null
  background: DashboardBackground
  density: DashboardDensity | null
  chart_styles: DashboardChartStyles
}
export type PersonalDashboardSnapshot = {
  revision: number
  preferences: PersonalDashboardPreferences | null
}
export type ResolvedDashboardPreferences = {
  metric_keys: string[]
  blocks: DashboardWidget[]
  background: DashboardBackground
  density: DashboardDensity
  chart_styles: DashboardChartStyles
}

export function defaultPersonalDashboardPreferences(): PersonalDashboardPreferences {
  return {
    version: 1, metric_keys: null, blocks: null, background: 'default', density: null,
    chart_styles: { timeline: 'combined', category: 'bars', purpose: 'bars' },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function validKeys(value: unknown, allowed: readonly string[]): boolean {
  return value === null || (Array.isArray(value) && value.every(key => typeof key === 'string' && allowed.includes(key)) && new Set(value).size === value.length)
}

export function validateDashboardPreferences(value: unknown): string | null {
  if (value === null) return null
  if (!isRecord(value) || value.version !== 1) return 'Невідома версія персональних налаштувань.'
  if (Object.keys(value).some(key => !['version', 'metric_keys', 'blocks', 'background', 'density', 'chart_styles'].includes(key))) return 'Персональні налаштування містять невідомі поля.'
  if (!validKeys(value.metric_keys, DASHBOARD_METRIC_KEYS)) return 'Оберіть доступні картки без повторів.'
  if (!validKeys(value.blocks, DASHBOARD_WIDGET_KEYS)) return 'Оберіть доступні блоки без повторів.'
  if (!DASHBOARD_BACKGROUNDS.includes(value.background as DashboardBackground)) return 'Оберіть доступний фон.'
  if (value.density !== null && value.density !== 'compact' && value.density !== 'comfortable') return 'Оберіть щільність інтерфейсу.'
  const styles = value.chart_styles
  if (!isRecord(styles) || Object.keys(styles).some(key => !['timeline', 'category', 'purpose'].includes(key)) ||
      !['combined', 'bars', 'line', 'area'].includes(String(styles.timeline)) ||
      !['bars', 'donut'].includes(String(styles.category)) || !['bars', 'donut'].includes(String(styles.purpose))) return 'Оберіть доступні типи графіків.'
  return null
}

export function resolveDashboardPreferences(preferences: PersonalDashboardPreferences | null, config: AppConfiguration): ResolvedDashboardPreferences {
  const prefs = preferences && validateDashboardPreferences(preferences) === null ? preferences : defaultPersonalDashboardPreferences()
  return {
    metric_keys: [...(prefs.metric_keys ?? config.dashboard.metric_keys)].filter(key => DASHBOARD_METRIC_KEYS.includes(key as typeof DASHBOARD_METRIC_KEYS[number])),
    blocks: [...(prefs.blocks ?? config.dashboard.blocks)].filter(key => DASHBOARD_WIDGET_KEYS.includes(key as DashboardWidget)) as DashboardWidget[],
    background: prefs.background,
    density: prefs.density ?? config.appearance.density,
    chart_styles: { ...prefs.chart_styles },
  }
}

export function moveDashboardItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (!Number.isInteger(index) || index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items]
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
