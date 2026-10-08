import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/dashboardPreferences.ts', import.meta.url), 'utf8'), { mode: 'strip' })
const { defaultPersonalDashboardPreferences, resolveDashboardPreferences, validateDashboardPreferences, moveDashboardItem } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const shared = { dashboard: { metric_keys: ['flights', 'efficiency'], blocks: ['timeline', 'map'] }, appearance: { density: 'compact' } }

test('inherited selections follow shared changes while empty selections remain intentionally empty', () => {
  const inherited = defaultPersonalDashboardPreferences()
  assert.deepEqual(resolveDashboardPreferences(inherited, shared).metric_keys, ['flights', 'efficiency'])
  const updated = { ...shared, dashboard: { metric_keys: ['weighted_efficiency'], blocks: ['events'] }, appearance: { density: 'comfortable' } }
  assert.deepEqual(resolveDashboardPreferences(inherited, updated).metric_keys, ['weighted_efficiency'])
  assert.deepEqual(resolveDashboardPreferences(null, updated).blocks, ['events'])
  assert.equal(resolveDashboardPreferences(inherited, updated).density, 'comfortable')
  const empty = { ...inherited, metric_keys: [], blocks: [] }
  assert.equal(validateDashboardPreferences(empty), null)
  assert.deepEqual(resolveDashboardPreferences(empty, updated).metric_keys, [])
  assert.deepEqual(resolveDashboardPreferences(empty, updated).blocks, [])
})
test('explicit account selections preserve order, chart styles, and density independently of shared defaults', () => {
  const prefs = { ...defaultPersonalDashboardPreferences(), metric_keys: ['efficiency', 'flights'], blocks: ['timeline_area', 'purpose_chart', 'timeline_line'], background: 'forest', density: 'comfortable', chart_styles: { timeline: 'line', category: 'donut', purpose: 'bars' } }
  const before = structuredClone(prefs)
  const configBefore = structuredClone(shared)
  const resolved = resolveDashboardPreferences(prefs, shared)
  assert.deepEqual(resolved.metric_keys, ['efficiency', 'flights'])
  assert.deepEqual(resolved.blocks, ['timeline_area', 'purpose_chart', 'timeline_line'])
  assert.equal(resolved.density, 'comfortable')
  assert.equal(resolved.background, 'forest')
  assert.deepEqual(resolved.chart_styles, prefs.chart_styles)
  resolved.metric_keys.push('effective')
  resolved.blocks.push('map')
  resolved.chart_styles.timeline = 'area'
  assert.deepEqual(prefs, before)
  assert.deepEqual(shared, configBefore)
})
test('validation rejects duplicate or unknown cards, widgets, graph types, and arbitrary configuration fields', () => {
  const defaults = defaultPersonalDashboardPreferences()
  assert.equal(validateDashboardPreferences(defaults), null)
  assert.equal(validateDashboardPreferences(null), null)
  for (const metric_keys of [['flights', 'flights'], ['unknown'], 'flights', [1], undefined]) assert.ok(validateDashboardPreferences({ ...defaults, metric_keys }))
  for (const blocks of [['map', 'map'], ['unknown'], 'map', undefined]) assert.ok(validateDashboardPreferences({ ...defaults, blocks }))
  for (const extra of [{ version: 2 }, { background: 'custom-css' }, { density: 'large' }, { kpi: { purpose_rules: [] } }, { chart_styles: { timeline: 'pie', category: 'bars', purpose: 'bars' } }, { chart_styles: { timeline: 'line', category: 'bars' } }]) assert.ok(validateDashboardPreferences({ ...defaults, ...extra }))
})
test('reordering swaps only adjacent selected widgets without mutating selections or losing an item', () => {
  const list = ['timeline_line', 'map', 'category_chart']
  assert.deepEqual(moveDashboardItem(list, 1, -1), ['map', 'timeline_line', 'category_chart'])
  assert.deepEqual(moveDashboardItem(list, 1, 1), ['timeline_line', 'category_chart', 'map'])
  for (const index of [-1, 0, 3, NaN]) assert.deepEqual(moveDashboardItem(list, index, -1), list)
  assert.deepEqual(moveDashboardItem(list, 2, 1), list)
  assert.deepEqual(list, ['timeline_line', 'map', 'category_chart'])
})
test('defaults and fallback resolution return fresh values rather than shared mutable settings', () => {
  const first = defaultPersonalDashboardPreferences()
  const second = defaultPersonalDashboardPreferences()
  first.chart_styles.timeline = 'line'
  assert.equal(second.chart_styles.timeline, 'combined')
  const invalid = { ...second, metric_keys: ['injected'] }
  const resolved = resolveDashboardPreferences(invalid, shared)
  assert.deepEqual(resolved.metric_keys, shared.dashboard.metric_keys)
  resolved.blocks.reverse()
  assert.deepEqual(shared.dashboard.blocks, ['timeline', 'map'])
})
