import type { MetadataField, QueryFilter, WidgetDefinition } from './biTypes'
import type { FilterState } from './types'

const filterFields: Partial<Record<keyof FilterState, string>> = {
  bbak: 'department', battalion: 'department', rota: 'rota_title', group: 'team',
  category: 'category', asset: 'device', purpose: 'purpose', result: 'result',
  class_name: 'target_class', direction: 'direction', unit: 'unit',
}
export function dashboardGlobalFilters(filters: FilterState, available: Array<MetadataField | string>): QueryFilter[] {
  const fields = new Set(available.map(field => typeof field === 'string' ? field : field.field ?? field.key ?? ''))
  return Object.entries(filterFields).flatMap(([key, target]) => {
    const values = filters[key as keyof FilterState]
    if (key === 'rota' && Array.isArray(values)) {
      // The legacy API accepts company titles; scoped options expose stable IDs.
      // Match ClickHouse's existing numeric-ID/title distinction and AND semantics.
      const ids = values.filter(value => /^\d+$/.test(value.trim()))
      const titles = values.filter(value => !/^\d+$/.test(value.trim()))
      const idField = fields.has('group') ? 'group' : fields.has('rota_id') ? 'rota_id' : null
      return [
        ...(idField && ids.length ? [{ field: idField, operator: 'in', value: [...ids] }] : []),
        ...(fields.has('rota_title') && titles.length ? [{ field: 'rota_title', operator: 'in', value: [...titles] }] : []),
      ]
    }
    const field = fields.has(target) ? target : fields.has(key) ? key : null
    return field && Array.isArray(values) && values.length ? [{ field, operator: 'in', value: [...values] }] : []
  })
}
export function comparisonInheritedFilters(filters: FilterState, available: Array<MetadataField | string>, level: 'DEPARTMENT' | 'GROUP' | 'TEAM' | 'CATEGORY' | 'BBAK' | 'CREW'): QueryFilter[] {
  const replacedFields = {
    CATEGORY: new Set(['category', 'device_type']),
    BBAK: new Set(['department', 'department_id', 'bbak', 'bbak_id', 'battalion']),
    CREW: new Set(['team', 'team_id', 'crew']),
    DEPARTMENT: new Set(['department', 'department_id', 'bbak', 'bbak_id', 'battalion']),
    GROUP: new Set(['group', 'group_id', 'rota', 'rota_id', 'rota_title']),
    TEAM: new Set(['team', 'team_id', 'crew']),
  }[level]
  return dashboardGlobalFilters(filters, available).filter(filter => !replacedFields.has(filter.field))
}

export function buildWeightedFormula(metrics: Array<{ key: string }>, weights: Record<string, number>): Record<string, unknown> {
  const args = metrics.map(metric => ({ op: 'mul', args: [{ metric: metric.key }, weights[metric.key] ?? 1] }))
  return args.length === 0 ? { value: 0 } : args.length === 1 ? args[0] : { op: 'add', args }
}
export function nextWidgetLayout(widgets: WidgetDefinition[]) {
  return { x: 0, y: Math.max(0, ...widgets.map(widget => widget.layout.y + widget.layout.h)), w: 6, h: 5 }
}
export function parseFilterInput(raw: string, operator: string): unknown {
  const scalar = (value: string) => value.trim() === 'true' ? true : value.trim() === 'false' ? false : /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : value.trim()
  if (operator === 'is_null' || operator === 'is_not_null') return null
  if (['in', 'not_in', 'between'].includes(operator)) {
    if (raw.trim().startsWith('[')) { const value: unknown = JSON.parse(raw); if (!Array.isArray(value) || value.some(item => typeof item === 'object' && item !== null)) throw new Error('Вкажіть масив простих значень.'); return value }
    return raw.split(',').map(scalar)
  }
  return scalar(raw)
}
export function preparePersonalWidget(widget: WidgetDefinition): WidgetDefinition {
  const { owner_id: _owner, ...definition } = widget
  return {
    ...definition, data_scope: 'USER_SCOPE', fixed_filters: [], is_locked: false,
    query: { ...definition.query, data_scope: 'USER_SCOPE', fixed_scope: null },
    permissions: { required_permissions: [], roles: [], users: [] },
  }
}
