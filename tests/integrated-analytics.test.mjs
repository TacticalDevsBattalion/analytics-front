import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

async function load(file) {
  const source = stripTypeScriptTypes(await readFile(new URL(`../src/lib/${file}.ts`, import.meta.url), 'utf8'), { mode: 'strip' })
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const { datumFilters, drillFilterState, mergeCrossFilters, visibleWidget } = await load('integratedAnalytics')
const { catalogMetricGroups, compatibleVisualizations, formulaMetricKeys, personalAppearancePayload, personalDashboardCapabilities, personalWidgetPayload, semanticLabel, updateSemanticQuery, updateSemanticVisualization } = await load('semanticCatalog')
const catalog = { metrics: [{ key: 'flights', label: 'Вильоти', category: 'Активність' }, { key: 'target_results', label: 'Результати', category: 'Цілі', description: 'Кількість цілей' }, { key: 'weighted_efficiency', label: 'Зважений KPI', kind: 'builtin' }], dimensions: [{ key: 'category', label: 'Кафедра' }], filters: [{ key: 'category', label: 'Кафедра' }, { key: 'date', label: 'Дата' }], visualizations: ['number', 'bar', 'total_with_highlight'] }
const widget = { id: 'w', title: 'Картка', widget_kind: 'SYSTEM_WIDGET', builtin: 'summary', data_scope: 'USER_SCOPE', layout: { x: 0, y: 0, w: 2, h: 2 }, query: { metrics: [{ key: 'flights' }], dimensions: [], filters: [] }, visualization: { type: 'number' } }

test('semantic catalog searches business labels and descriptions and never displays an unlabeled raw key', () => {
  assert.equal(semanticLabel({ key: 'db_internal_field' }), 'Показник')
  assert.deepEqual(catalogMetricGroups(catalog.metrics, 'цілей').flatMap(group => group.metrics.map(metric => metric.key)), ['target_results'])
  assert.equal(catalogMetricGroups(catalog.metrics)[0].title, 'Активність')
})
test('total with highlight allows seeded aggregate metrics without a dimension', () => {
  const choices = compatibleVisualizations(catalog, { ...widget, query: { metrics: [{ key: 'total' }, { key: 'destroyed' }], dimensions: [] } })
  assert.equal(choices.find(choice => choice.key === 'total_with_highlight').allowed, true)
  assert.equal(choices.find(choice => choice.key === 'bar').allowed, false)
})
test('filter and time settings preserve native timeline, map and rich summary renderers', () => {
  for (const builtin of ['timeline', 'map', 'records', 'category', 'purpose', 'summary']) {
    const updated = updateSemanticQuery({ ...widget, builtin }, { filters: [{ field: 'category', operator: 'eq', value: 'A' }], date_range: { from: '2026-10-01', to: '2026-10-02' } }, catalog)
    assert.equal(updated.builtin, builtin)
    assert.equal(widget.query.filters.length, 0)
  }
})
test('changing summary to generic target metrics uses the generic engine and rejects incompatible special KPI mixes', () => {
  assert.equal(updateSemanticQuery(widget, { metrics: [{ key: 'target_results' }] }, catalog).builtin, null)
  assert.equal(updateSemanticQuery(widget, { metrics: [{ key: 'weighted_efficiency' }] }, catalog).builtin, 'summary')
  assert.throws(() => updateSemanticQuery(widget, { metrics: [{ key: 'weighted_efficiency' }, { key: 'target_results' }] }, catalog), /основними KPI/)
  assert.throws(() => updateSemanticQuery(widget, { metrics: [{ key: 'weighted_efficiency' }], dimensions: [{ field: 'date' }] }, catalog), /без розрізів/)
})
test('native chart styling remains native while incompatible chart changes opt into generic rendering', () => {
  const timeline = { ...widget, builtin: 'timeline', visualization: { type: 'combo' } }
  assert.equal(updateSemanticVisualization(timeline, { type: 'line' }, catalog).builtin, 'timeline')
  assert.equal(updateSemanticVisualization(timeline, { legend: { show: false } }, catalog).builtin, 'timeline')
  assert.equal(updateSemanticVisualization(timeline, { type: 'pie' }, catalog).builtin, null)
  assert.throws(() => updateSemanticVisualization({ ...widget, query: { ...widget.query, metrics: [{ key: 'weighted_efficiency' }] } }, { type: 'line' }, catalog), /картку KPI/)
})
test('zero suppression and styling preserve the native average renderer without changing other widget options', () => {
  const averageCatalog = { ...catalog, metrics: [...catalog.metrics, { key: 'avg_flights_per_position', label: 'Середні вильоти', kind: 'builtin' }] }
  const average = { ...widget, builtin: 'average', query: { ...widget.query, metrics: [{ key: 'avg_flights_per_position' }, { key: 'flights' }] }, visualization: { type: 'table', options: { legacy_block: 'departments', view: 'original' } } }
  const before = structuredClone(average)
  const enabled = updateSemanticVisualization(average, { options: { ...average.visualization.options, hide_zero_values: true } }, averageCatalog)
  assert.equal(enabled.builtin, 'average')
  assert.equal(enabled.visualization.type, 'table')
  assert.deepEqual(enabled.visualization.options, { legacy_block: 'departments', view: 'original', hide_zero_values: true })
  assert.equal(updateSemanticVisualization(average, { tooltip: { show: false } }, averageCatalog).builtin, 'average')
  assert.equal(updateSemanticVisualization(average, { type: 'number' }, averageCatalog).builtin, 'summary')
  assert.deepEqual(average, before)
})
test('personal widgets strip identity, roles and elevated scope while preserving query and genuine zero values', () => {
  const input = { ...widget, owner_id: 'other', mandatory: true, is_locked: true, data_scope: 'GLOBAL', fixed_filters: [{ field: 'category', operator: 'eq', value: 'other' }], permissions: { users: ['other'] }, query: { ...widget.query, data_scope: 'GLOBAL', fixed_scope: { scope_type: 'ALL' }, filters: [{ field: 'count', operator: 'eq', value: 0 }] } }
  const safe = personalWidgetPayload(input)
  assert.equal(safe.owner_id, undefined)
  assert.equal(safe.data_scope, 'USER_SCOPE')
  assert.equal(safe.query.data_scope, 'USER_SCOPE')
  assert.equal(safe.query.fixed_scope, null)
  assert.equal(safe.widget_kind, 'USER_WIDGET')
  assert.equal(safe.mandatory, false)
  assert.equal(safe.query.filters[0].value, 0)
  assert.equal(input.data_scope, 'GLOBAL')
})
test('appearance submits a server asset ID independently of returned read-only image URLs', () => {
  assert.deepEqual(personalAppearancePayload({ background: 'image', background_asset_id: 'abc', background_url: '/api/v1/analytics/assets/abc', widget_opacity: 0.5 }), { background: 'image', background_asset_id: 'abc', widget_opacity: 0.5 })
})
test('cross filters come only from declared semantic dimensions and preserve zero while dropping metric and object payloads', () => {
  const filters = datumFilters({ ...widget, query: { ...widget.query, dimensions: [{ field: 'category' }, { field: 'date' }, { field: 'unsafe' }] } }, { category: 0, date: null, unsafe: 'hidden', flights: 99 }, catalog)
  assert.deepEqual(filters, [{ field: 'category', operator: 'eq', value: 0 }])
})
test('new cross-filter selection replaces only the selected dimension without mutating stored definitions', () => {
  const current = [{ field: 'category', operator: 'eq', value: 'A' }, { field: 'purpose', operator: 'eq', value: 'Observe' }]
  const incoming = [{ field: 'category', operator: 'eq', value: 'B' }]
  assert.deepEqual(mergeCrossFilters(current, incoming), [current[1], incoming[0]])
  assert.equal(current[0].value, 'A')
})
test('drill-through carries date, organisation IDs and semantic context without confusing department with BBAK', () => {
  const filters = { date_from: '2026-10-01', date_to: '2026-10-06', category: [], bbak: [], rota: [], group: [], purpose: ['Observe'] }
  const carried = drillFilterState(filters, [{ field: 'date', operator: 'eq', value: '2026-10-03' }, { field: 'department', operator: 'eq', value: 12 }, { field: 'category', operator: 'eq', value: 'FPV' }, { field: 'team', operator: 'eq', value: 'Crew A' }])
  assert.equal(carried.date_from, '2026-10-03')
  assert.equal(carried.date_to, '2026-10-03')
  assert.deepEqual(carried.bbak, ['12'])
  assert.deepEqual(carried.category, ['FPV'])
  assert.deepEqual(carried.group, ['Crew A'])
  assert.deepEqual(carried.purpose, ['Observe'])
  assert.deepEqual(filters.bbak, [])
})
test('all-departments visibility uses semantic category selection independently of organisational BBAK scope', () => {
  const definition = { ...widget, visibility: { show_when_all_departments: true, conditions: [] } }
  assert.equal(visibleWidget(definition, []), true)
  assert.equal(visibleWidget(definition, [{ field: 'department', operator: 'eq', value: '1' }]), true)
  assert.equal(visibleWidget(definition, [{ field: 'category', operator: 'in', value: ['FPV'] }]), false)
  assert.equal(visibleWidget({ ...widget, visibility: { conditions: [{ field: 'category', operator: 'eq', value: 'FPV' }] } }, [{ field: 'category', operator: 'in', value: ['FPV', 'Recon'] }]), true)
})
test('simulator extracts formula metric inputs without interpreting formula operations locally', () => {
  assert.deepEqual(formulaMetricKeys({ op: 'div', args: [{ metric: 'ammunition' }, { op: 'add', args: [{ metric: 'target_results' }, { metric: 'target_results' }, 1] }] }), ['ammunition', 'target_results'])
})

test('personal dashboard modes limit structure permissions while appearance remains independent', () => {
  for (const mode of [undefined, 'LOCKED']) assert.deepEqual(personalDashboardCapabilities(mode, ['*']), { layout: false, create: false, edit: false, remove: false, hide: false, configure: false, appearance: true })
  assert.deepEqual(personalDashboardCapabilities('LAYOUT_EDITABLE', ['*']), { layout: true, create: false, edit: false, remove: false, hide: false, configure: true, appearance: true })
  for (const mode of ['CUSTOMIZABLE', 'FREE']) assert.deepEqual(personalDashboardCapabilities(mode, ['*']), { layout: true, create: true, edit: true, remove: true, hide: true, configure: true, appearance: true })
})
test('customizable own widget permissions do not grant layouts, system hiding or appearance', () => {
  assert.deepEqual(personalDashboardCapabilities('CUSTOMIZABLE', ['personal_dashboard.widget.create', 'personal_dashboard.widget.edit']), { layout: false, create: true, edit: true, remove: false, hide: false, configure: true, appearance: false })
  assert.deepEqual(personalDashboardCapabilities('FREE', []), { layout: false, create: false, edit: false, remove: false, hide: false, configure: false, appearance: false })
})
