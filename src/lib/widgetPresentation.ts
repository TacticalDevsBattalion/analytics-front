import type { QueryResult, WidgetDefinition } from './biTypes'

export function hidesZeroWidgetValues(widget: Pick<WidgetDefinition, 'visualization'>): boolean {
  // On by default: zero rows are dropped entirely (label included). Only an explicit `false` shows them.
  return widget.visualization.options?.hide_zero_values !== false
}

/** Filter presentation rows only; dimensions, server totals and the input remain intact. */
export function filterZeroWidgetRows(result: QueryResult, metrics: Array<{ key: string }>): QueryResult {
  if (!metrics.length) return result
  const keep = (row: Record<string, unknown>) => !metrics.every(metric => row[metric.key] === 0)
  return {
    ...result,
    rows: result.rows.filter(keep),
    ...(result.separate_rows ? { separate_rows: result.separate_rows.filter(keep) } : {}),
  }
}

/** Hide an entire column/series only when every reported value is a known numeric zero. */
export function nonZeroWidgetMetrics<T extends { key: string }>(result: QueryResult, metrics: T[]): T[] {
  const rows = [...result.rows, ...(result.separate_rows ?? [])]
  return rows.length ? metrics.filter(metric => !rows.every(row => row[metric.key] === 0)) : metrics
}

const dimensionTitles: Record<string, [string, string]> = {
  date: ['Дата', 'Date'], category: ['Кафедра', 'Category'], device_type: ['Кафедра', 'Category'], department_category: ['Кафедра', 'Category'],
  department: ['ББАК', 'Department'], department_id: ['ББАК', 'Department'], bbak_id: ['ББАК', 'Department'],
  group: ['Рота', 'Group'], group_id: ['Рота', 'Group'], rota_id: ['Рота', 'Group'], rota_title: ['Рота', 'Group'],
  team: ['Екіпаж', 'Crew'], team_id: ['Екіпаж', 'Crew'], crew: ['Екіпаж', 'Crew'],
  direction: ['АК', 'AK'], zone: ['Зона відповідальності', 'Zone'], units: ['Зона відповідальності', 'Zone'],
  purpose: ['Призначення', 'Purpose'], main_purpose: ['Призначення', 'Purpose'], flight_purpose: ['Призначення', 'Purpose'],
  target_type: ['Тип цілі', 'Target type'], target_class: ['Тип цілі', 'Target type'], class_name: ['Тип цілі', 'Target type'],
  target_id: ['Ціль', 'Target'], result: ['Результат', 'Result'], norm_result: ['Результат', 'Result'],
  bc_name: ['Боєприпас', 'Ammunition'], ammunition: ['Боєприпас', 'Ammunition'], device_name: ['Засіб', 'Device'], asset: ['Засіб', 'Device'],
}
export function dimensionTitle(result: QueryResult, key: string, locale: string): string {
  return result.dimension_labels?.[key] ?? dimensionTitles[key]?.[locale.startsWith('uk') ? 0 : 1] ?? (locale.startsWith('uk') ? 'Розріз' : 'Dimension')
}
export function hasNumericWidgetRows(rows: Record<string, unknown>[], metrics: Array<{ key: string }>): boolean {
  return rows.some(row => metrics.some(metric => typeof row[metric.key] === 'number' && Number.isFinite(row[metric.key])))
}
/** Both values come from the server. Clipping only keeps an overlay inside its total. */
export function totalHighlightValues(row: Record<string, unknown>, totalKey = 'target_results', highlightKey = 'target_destroyed'): { total: number; highlight: number; start: number } | null {
  const total = row[totalKey], highlight = row[highlightKey]
  if (typeof total !== 'number' || !Number.isFinite(total) || total < 0) return null
  const clipped = typeof highlight === 'number' && Number.isFinite(highlight) ? Math.min(total, Math.max(0, highlight)) : 0
  return { total, highlight: clipped, start: total - clipped }
}
