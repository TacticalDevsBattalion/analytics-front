import type { AnalyticsCatalog, DashboardLayoutMode, PersonalAppearance, QueryRequest, SemanticField, SemanticMetric, SemanticVisualization, VisualizationDefinition, WidgetDefinition } from './biTypes'

export const semanticLabel = (value: { label?: string; title?: string }) => value.label || value.title || 'Показник'
export const semanticField = (value: SemanticField) => value.field || value.key
export function personalDashboardCapabilities(mode: DashboardLayoutMode | undefined, permissions: string[]) {
  const has = (permission: string) => permissions.includes('*') || permissions.includes(permission)
  const customizable = mode === 'CUSTOMIZABLE' || mode === 'FREE'
  const layout = mode !== undefined && mode !== 'LOCKED' && has('personal_dashboard.edit')
  const create = customizable && has('personal_dashboard.widget.create')
  const edit = customizable && has('personal_dashboard.widget.edit')
  const remove = customizable && has('personal_dashboard.widget.delete')
  return { layout, create, edit, remove, hide: customizable && layout, configure: layout || create || edit || remove, appearance: has('personal_dashboard.appearance.edit') }
}
export function catalogMetricGroups(metrics: SemanticMetric[], search = '') {
  const groups = new Map<string, SemanticMetric[]>()
  for (const metric of metrics) {
    if (search && !`${semanticLabel(metric)} ${metric.description ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) continue
    const category = metric.category || 'Інші показники'
    groups.set(category, [...(groups.get(category) ?? []), metric])
  }
  return [...groups].map(([title, metrics]) => ({ title, metrics }))
}
export function compatibleVisualizations(catalog: AnalyticsCatalog, widget: WidgetDefinition) {
  const values = catalog.supported_visualizations ?? catalog.visualizations ?? []
  const count = widget.query.metrics.length
  const dimensions = widget.query.dimensions.length
  return values.map(value => {
    const visual: SemanticVisualization = typeof value === 'string' ? { key: value } : value
    const key = visual.key || visual.type || ''
    const limits: Record<string, [number, number, number, number]> = {
      number: [1, 30, 0, 0], kpi: [1, 30, 0, 0], progress: [1, 1, 0, 0], gauge: [1, 1, 0, 0],
      pie: [1, 30, 1, 1], donut: [1, 30, 1, 1], scatter: [2, 3, 0, 2], heatmap: [1, 1, 2, 2],
      total_with_highlight: [2, 30, 0, 2], TOTAL_WITH_HIGHLIGHT: [2, 30, 0, 2], text: [0, 30, 0, 10], markdown: [0, 30, 0, 10],
    }
    const fallback = limits[key] ?? [1, 30, 1, 2]
    const allowed = count >= (visual.min_metrics ?? fallback[0]) && count <= (visual.max_metrics ?? fallback[1]) && dimensions >= (visual.min_dimensions ?? fallback[2]) && dimensions <= (visual.max_dimensions ?? fallback[3])
    return { ...visual, key, allowed, explanation: allowed ? '' : 'Потрібна інша кількість показників або розрізів.' }
  })
}
export function personalWidgetPayload(widget: WidgetDefinition): WidgetDefinition {
  const value = structuredClone(widget)
  delete value.owner_id
  value.widget_kind = 'USER_WIDGET'
  value.data_scope = 'USER_SCOPE'
  value.fixed_filters = []
  value.query.data_scope = 'USER_SCOPE'
  value.query.fixed_scope = null
  value.permissions = { required_permissions: [], roles: [], users: [] }
  value.mandatory = false
  value.is_locked = false
  value.movable = true
  value.resizable = true
  value.removable = true
  return value
}
export function personalAppearancePayload(appearance: PersonalAppearance): PersonalAppearance {
  const { background_url: _url, ...settings } = appearance
  return settings
}
const classicKpis = new Set(['flights', 'effective', 'detected', 'affected', 'destroyed', 'efficiency', 'avg_flights_per_position', 'weighted_efficiency'])
export function updateSemanticQuery(widget: WidgetDefinition, update: Partial<QueryRequest>, catalog: AnalyticsCatalog): WidgetDefinition {
  const query = { ...widget.query, ...update, source: undefined }
  const special = new Set(catalog.metrics.filter(metric => metric.kind === 'builtin').map(metric => metric.key))
  const rich = query.metrics.some(metric => special.has(metric.key))
  const classic = query.metrics.every(metric => classicKpis.has(metric.key))
  if (rich && (!classic || query.dimensions.length)) throw new Error('Розширені картки середнього та зваженої ефективності поєднуються лише з основними KPI без розрізів.')
  const builtin = rich ? 'summary' : update.metrics ? widget.builtin === 'summary' && classic ? 'summary' : null : update.dimensions ? null : widget.builtin
  return { ...widget, builtin, query }
}
export function updateSemanticVisualization(widget: WidgetDefinition, update: Partial<VisualizationDefinition>, catalog: AnalyticsCatalog): WidgetDefinition {
  const special = widget.query.metrics.some(reference => catalog.metrics.some(metric => metric.key === reference.key && metric.kind === 'builtin'))
  if (special && update.type && !['number', 'kpi'].includes(update.type)) throw new Error('Цей розширений системний показник підтримує картку KPI або число.')
  const compatible = widget.builtin === 'summary' && ['number', 'kpi'].includes(update.type ?? '') || widget.builtin === 'timeline' && ['combo', 'timeline', 'line', 'bar', 'area'].includes(update.type ?? '') || ['category', 'purpose'].includes(widget.builtin ?? '') && ['bar', 'horizontal_bar', 'donut'].includes(update.type ?? '')
  const builtin = update.type ? special ? 'summary' : compatible ? widget.builtin : null : widget.builtin
  return { ...widget, builtin, visualization: { ...widget.visualization, ...update } }
}
export function formulaMetricKeys(formula: unknown): string[] {
  if (!formula || typeof formula !== 'object') return []
  if (Array.isArray(formula)) return [...new Set(formula.flatMap(formulaMetricKeys))]
  const node = formula as Record<string, unknown>
  return [...new Set([...(typeof node.metric === 'string' ? [node.metric] : []), ...Object.entries(node).filter(([key]) => key !== 'metric').flatMap(([, value]) => formulaMetricKeys(value))])]
}
