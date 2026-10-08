import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

async function load(name) {
  const source = stripTypeScriptTypes(await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8'), { mode: 'strip' })
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const { changedWidgetLayouts, constrainWidgetLayout, layoutsOverlap, reflowWidgetLayouts } = await load('widgetGrid')
const { dimensionTitle, hasNumericWidgetRows, totalHighlightValues } = await load('widgetPresentation')
const card = (id, x, y, w = 6, h = 4, policy = {}) => ({ id, layout: { x, y, w, h }, ...policy })
function assertNoCollisions(layouts) {
  const values = Object.values(layouts)
  for (let first = 0; first < values.length; first++) for (let second = first + 1; second < values.length; second++) assert.equal(layoutsOverlap(values[first], values[second]), false)
}
test('drag collision reflows neighbours and returns all changed layouts together', () => {
  const widgets = [card('moving', 0, 0), card('neighbour', 6, 0), card('bottom', 0, 4, 12)]
  const before = structuredClone(widgets)
  const layouts = reflowWidgetLayouts(widgets, { id: 'moving', layout: { x: 6, y: 0, w: 6, h: 4 } })
  assertNoCollisions(layouts)
  assert.deepEqual(layouts.moving, { x: 6, y: 0, w: 6, h: 4 })
  assert.deepEqual(layouts.neighbour, { x: 6, y: 4, w: 6, h: 4 })
  assert.deepEqual(layouts.bottom, { x: 0, y: 8, w: 12, h: 4 })
  assert.deepEqual(Object.keys(changedWidgetLayouts(widgets, layouts)).sort(), ['bottom', 'moving', 'neighbour'])
  assert.deepEqual(widgets, before)
})
test('resize collision moves neighbours while pinned and locked cards stay in place', () => {
  const widgets = [card('growing', 0, 0), card('neighbour', 0, 4), card('fixed', 6, 0, 6, 4, { movable: false }), card('locked', 6, 4, 6, 4, { is_locked: true })]
  const layouts = reflowWidgetLayouts(widgets, { id: 'growing', layout: { x: 0, y: 0, w: 6, h: 8 } })
  assertNoCollisions(layouts)
  assert.equal(layouts.neighbour.y, 8)
  assert.deepEqual(layouts.fixed, widgets[2].layout)
  assert.deepEqual(layouts.locked, widgets[3].layout)
})
test('vertical compaction removes gaps and preserves horizontal placement', () => {
  const widgets = [card('first', 0, 10), card('second', 6, 20), card('third', 0, 30)]
  const layouts = reflowWidgetLayouts(widgets)
  assert.deepEqual(layouts, { first: { x: 0, y: 0, w: 6, h: 4 }, second: { x: 6, y: 0, w: 6, h: 4 }, third: { x: 0, y: 4, w: 6, h: 4 } })
  assertNoCollisions(layouts)
})
test('a moved card cannot replace a fixed obstacle and disabled resizing is preserved', () => {
  const widgets = [card('fixed', 0, 0, 6, 4, { movable: false }), card('moving', 6, 0, 6, 4, { resizable: false })]
  const layouts = reflowWidgetLayouts(widgets, { id: 'moving', layout: { x: 0, y: 0, w: 12, h: 9 } })
  assert.deepEqual(layouts.fixed, widgets[0].layout)
  assert.deepEqual(layouts.moving, { x: 0, y: 4, w: 6, h: 4 })
  assertNoCollisions(layouts)
  assert.deepEqual(reflowWidgetLayouts([card('locked', 0, 0, 6, 4, { is_locked: true })], { id: 'locked', layout: { x: 6, y: 5, w: 4, h: 9 } }).locked, { x: 0, y: 0, w: 6, h: 4 })
})
test('a pinned resizable card rejects a size that overlaps another fixed card', () => {
  const widgets = [card('pinned', 0, 0, 6, 4, { movable: false }), card('obstacle', 6, 0, 6, 4, { is_locked: true })]
  const layouts = reflowWidgetLayouts(widgets, { id: 'pinned', layout: { x: 0, y: 0, w: 12, h: 4 } })
  assert.deepEqual(layouts.pinned, widgets[0].layout)
  assertNoCollisions(layouts)
})
test('grid constraints reject nonfinite values and keep every size inside twelve columns', () => {
  assert.deepEqual(constrainWidgetLayout({ x: 11, y: -4, w: 8, h: 0 }), { x: 4, y: 0, w: 8, h: 1 })
  assert.deepEqual(constrainWidgetLayout({ x: NaN, y: Infinity, w: NaN, h: NaN }), { x: 0, y: 0, w: 6, h: 4 })
})
test('total highlight covers the right end of the server total without adding business metrics', () => {
  assert.deepEqual(totalHighlightValues({ target_results: 10, target_destroyed: 3, target_affected: 200 }), { total: 10, highlight: 3, start: 7 })
  assert.deepEqual(totalHighlightValues({ target_results: 10, target_destroyed: 30 }), { total: 10, highlight: 10, start: 0 })
  assert.deepEqual(totalHighlightValues({ target_results: 0, target_destroyed: 0 }), { total: 0, highlight: 0, start: 0 })
  assert.equal(totalHighlightValues({ target_results: NaN }), null)
  assert.equal(totalHighlightValues({ target_results: -1 }), null)
  assert.deepEqual(totalHighlightValues({ total: 5, special: 2 }, 'total', 'special'), { total: 5, highlight: 2, start: 3 })
})
test('numeric empty check includes zero and separately displayed categories', () => {
  assert.equal(hasNumericWidgetRows([{ count: 0 }], [{ key: 'count' }]), true)
  assert.equal(hasNumericWidgetRows([{ count: null }, { count: NaN }], [{ key: 'count' }]), false)
  assert.equal(hasNumericWidgetRows([{ target_type: 'ОС', count: 3 }], [{ key: 'count' }]), true)
})
test('dimension headings use catalog labels and human semantic fallbacks', () => {
  const result = { rows: [], dimensions: [], metrics: [], status: 'success', dimension_labels: { purpose: 'Вид завдання' } }
  assert.equal(dimensionTitle(result, 'purpose', 'uk-UA'), 'Вид завдання')
  assert.equal(dimensionTitle(result, 'direction', 'uk-UA'), 'АК')
  assert.equal(dimensionTitle(result, 'device_type', 'uk-UA'), 'Кафедра')
  assert.equal(dimensionTitle(result, 'unknown_private_column', 'uk-UA'), 'Розріз')
})
