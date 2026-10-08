import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/biBuilder.ts', import.meta.url), 'utf8'), { mode: 'strip' })
const { buildWeightedFormula, comparisonInheritedFilters, dashboardGlobalFilters, nextWidgetLayout, parseFilterInput, preparePersonalWidget } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('weighted KPI uses declared metrics and preserves explicit zero weights', () => {
  assert.deepEqual(buildWeightedFormula([{ key: 'a' }, { key: 'b' }], { a: 0, b: 0.4 }), {
    op: 'add', args: [{ op: 'mul', args: [{ metric: 'a' }, 0] }, { op: 'mul', args: [{ metric: 'b' }, 0.4] }],
  })
  assert.deepEqual(buildWeightedFormula([{ key: 'a' }], {}), { op: 'mul', args: [{ metric: 'a' }, 1] })
  assert.deepEqual(buildWeightedFormula([], {}), { value: 0 })
})

test('new widget starts below every existing widget without changing layouts', () => {
  const widgets = [{ layout: { x: 0, y: 0, w: 6, h: 8 } }, { layout: { x: 6, y: 6, w: 6, h: 4 } }]
  const original = structuredClone(widgets)
  assert.deepEqual(nextWidgetLayout(widgets), { x: 0, y: 10, w: 6, h: 5 })
  assert.deepEqual(nextWidgetLayout([]), { x: 0, y: 0, w: 6, h: 5 })
  assert.deepEqual(widgets, original)
})

test('filter value builder preserves scalars and bounded array operands', () => {
  assert.equal(parseFilterInput('complete', 'eq'), 'complete')
  assert.equal(parseFilterInput('0', 'gte'), 0)
  assert.equal(parseFilterInput('true', 'eq'), true)
  assert.equal(parseFilterInput('false', 'neq'), false)
  assert.deepEqual(parseFilterInput('10, 20', 'between'), [10, 20])
  assert.deepEqual(parseFilterInput('["a", "b"]', 'in'), ['a', 'b'])
  assert.equal(parseFilterInput('ignored', 'is_null'), null)
  assert.throws(() => parseFilterInput('[{"sql":"anything"}]', 'in'))
  assert.throws(() => parseFilterInput('[[1]]', 'in'))
  assert.throws(() => parseFilterInput('[invalid]', 'in'))
})
test('personal widget payload inherits server scope without elevated access or identity claims', () => {
  const widget = { id: 'own_widget', owner_id: 'another_user', revision: 4, data_scope: 'GLOBAL', fixed_filters: [{ field: 'department', operator: 'eq', value: 'other' }], is_locked: true, query: { metrics: [{ key: 'a' }], dimensions: [], data_scope: 'GLOBAL', fixed_scope: { scope_type: 'ALL' } }, permissions: { required_permissions: ['analytics.global'], roles: ['admin'], users: ['someone'] } }
  const original = structuredClone(widget)
  const safe = preparePersonalWidget(widget)
  assert.equal(safe.owner_id, undefined)
  assert.equal(safe.revision, 4)
  assert.equal(safe.data_scope, 'USER_SCOPE')
  assert.equal(safe.query.data_scope, 'USER_SCOPE')
  assert.equal(safe.query.fixed_scope, null)
  assert.deepEqual(safe.fixed_filters, [])
  assert.deepEqual(safe.permissions, { required_permissions: [], roles: [], users: [] })
  assert.deepEqual(safe.query.metrics, [{ key: 'a' }])
  assert.deepEqual(widget, original)
})
test('legacy organization filters retain their real ID/title semantics and alias intersections', () => {
  const filters = { bbak: ['3'], battalion: ['4'], rota: ['Рота Альфа'], group: ['Crew A'], category: [], asset: [], purpose: [], result: [], class_name: [], direction: [], unit: [] }
  const original = structuredClone(filters)
  assert.deepEqual(dashboardGlobalFilters(filters, ['department', 'rota_title', 'team']), [
    { field: 'department', operator: 'in', value: ['3'] },
    { field: 'department', operator: 'in', value: ['4'] },
    { field: 'rota_title', operator: 'in', value: ['Рота Альфа'] },
    { field: 'team', operator: 'in', value: ['Crew A'] },
  ])
  assert.deepEqual(dashboardGlobalFilters(filters, ['team']), [{ field: 'team', operator: 'in', value: ['Crew A'] }])
  assert.deepEqual(filters, original)
  assert.deepEqual(dashboardGlobalFilters({ ...filters, bbak: [], battalion: [], group: [], rota: ['17', 'Рота Альфа'] }, ['group', 'rota_title']), [
    { field: 'group', operator: 'in', value: ['17'] },
    { field: 'rota_title', operator: 'in', value: ['Рота Альфа'] },
  ])
  assert.deepEqual(dashboardGlobalFilters({ ...filters, bbak: [], battalion: [], group: [], rota: ['17'] }, ['rota_id']), [
    { field: 'rota_id', operator: 'in', value: ['17'] },
  ])
})
test('comparison selectors replace only the matching inherited organizational axis', () => {
  const filters = { bbak: ['3'], battalion: [], rota: ['17', 'Рота Альфа'], group: ['Crew A'], category: ['Drone'], purpose: ['Observe'] }
  const fields = ['department', 'group', 'rota_title', 'team', 'category', 'purpose']
  assert.deepEqual(comparisonInheritedFilters(filters, fields, 'GROUP'), [
    { field: 'department', operator: 'in', value: ['3'] },
    { field: 'team', operator: 'in', value: ['Crew A'] },
    { field: 'category', operator: 'in', value: ['Drone'] },
    { field: 'purpose', operator: 'in', value: ['Observe'] },
  ])
  assert.equal(comparisonInheritedFilters(filters, fields, 'DEPARTMENT').some(filter => filter.field === 'department'), false)
  assert.equal(comparisonInheritedFilters(filters, fields, 'TEAM').some(filter => filter.field === 'team'), false)
})
