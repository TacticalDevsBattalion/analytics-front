import type { AnalyticsCatalog, QueryFilter, WidgetDefinition } from './biTypes'
import type { FilterState } from './types'

const legacyFields: Record<string, keyof FilterState> = { department: 'bbak', department_id: 'bbak', bbak: 'bbak', bbak_id: 'bbak', group: 'rota', rota_id: 'rota', rota_title: 'rota', team: 'group', team_id: 'group', crew: 'group', category: 'category', device_type: 'category', device: 'asset', purpose: 'purpose', result: 'result', target_class: 'class_name', direction: 'direction', unit: 'unit' }
export function datumFilters(widget: WidgetDefinition, row: Record<string, unknown>, catalog: AnalyticsCatalog): QueryFilter[] {
  const allowed = new Set(catalog.filters.map(item => item.field || item.key))
  return widget.query.dimensions.flatMap(({ field }) => {
    const value = row[field]
    return allowed.has(field) && value !== undefined && value !== null && typeof value !== 'object' ? [{ field, operator: 'eq', value }] : []
  })
}
export function mergeCrossFilters(current: QueryFilter[], incoming: QueryFilter[]): QueryFilter[] {
  const fields = new Set(incoming.map(filter => filter.field))
  return [...current.filter(filter => !fields.has(filter.field)), ...incoming]
}
export function drillFilterState(current: FilterState, filters: QueryFilter[]): FilterState {
  const next = structuredClone(current)
  for (const filter of filters) {
    if (filter.field === 'date' && filter.operator === 'eq' && typeof filter.value === 'string') { next.date_from = filter.value.slice(0, 10); next.date_to = filter.value.slice(0, 10); continue }
    const field = legacyFields[filter.field]
    if (!field || !['eq', 'in'].includes(filter.operator)) continue
    const values = Array.isArray(filter.value) ? filter.value : [filter.value]
    if (values.every(value => typeof value === 'string' || typeof value === 'number')) (next[field] as string[]) = values.map(String)
  }
  return next
}
export function visibleWidget(widget: WidgetDefinition, filters: QueryFilter[]): boolean {
  if (widget.visibility?.show_when_all_departments && filters.some(filter => ['category', 'device_type'].includes(filter.field) && filter.value != null && (!Array.isArray(filter.value) || filter.value.length))) return false
  return (widget.visibility?.conditions ?? []).every(condition => {
    const selected = filters.filter(filter => filter.field === condition.field).flatMap(filter => Array.isArray(filter.value) ? filter.value : [filter.value])
    const values = Array.isArray(condition.value) ? condition.value : [condition.value]
    if (condition.operator === 'is_null') return selected.length === 0
    if (condition.operator === 'is_not_null') return selected.length > 0
    if (['eq', 'in'].includes(condition.operator)) return selected.some(value => values.includes(value))
    if (['neq', 'not_in'].includes(condition.operator)) return selected.length > 0 && selected.every(value => !values.includes(value))
    return true
  })
}
