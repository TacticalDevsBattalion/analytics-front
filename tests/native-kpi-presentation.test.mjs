import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/nativeKpiPresentation.ts', import.meta.url), 'utf8'), { mode: 'strip' })
const { filterNativeKpiBreakdown, nativeKpiCardVisible, nativeKpiHasSecondary, nativeKpiValueVisible } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const metric = values => ({ key: 'affected', label: 'Уражено', value: 0, ...values })
const row = (key, value, children) => ({ key, label: key, value, ...(children ? { children } : {}) })

test('native zero suppression is opt-in and distinguishes strict numeric zero from missing values', () => {
  assert.equal(nativeKpiCardVisible(metric({})), true)
  assert.equal(nativeKpiValueVisible(0), true)
  for (const value of [null, undefined, -2, 3, '0', NaN]) assert.equal(nativeKpiValueVisible(value, true), true)
  for (const value of [0, -0]) assert.equal(nativeKpiValueVisible(value, true), false)
  const items = [row('zero', 0)]
  assert.strictEqual(filterNativeKpiBreakdown(items), items)
})

test('zero primary values hide the entire card even when secondary results or labels exist', () => {
  assert.equal(nativeKpiCardVisible(metric({}), true), false)
  assert.equal(nativeKpiCardVisible(metric({ secondary_value: null, secondary_label: null }), true), false, 'Optional unlabeled secondary metadata is absent')
  assert.equal(nativeKpiCardVisible(metric({ secondary_value: 0, secondary_label: 'Загальний результат', delta: 0 }), true), false)
  for (const value of [5, -3, null, undefined]) {
    assert.equal(nativeKpiCardVisible(metric({ secondary_value: value, secondary_label: 'Загальний результат' }), true), false)
  }
  assert.equal(nativeKpiHasSecondary(metric({ secondary_value: 4 })), true)
  assert.equal(nativeKpiCardVisible(metric({ secondary_value: 4 }), true), false)
  assert.equal(nativeKpiCardVisible(metric({ value: 4, secondary_value: 0, secondary_label: 'Додатковий результат' }), true), true)
  for (const value of [null, undefined, -2]) assert.equal(nativeKpiCardVisible(metric({ value }), true), true)
})

test('zero-primary cards hide their name, delta and nonzero breakdown together', () => {
  assert.equal(nativeKpiCardVisible(metric({ delta: -100 }), true), false)
  assert.equal(nativeKpiCardVisible(metric({ delta: 3 }), true), false)
  assert.equal(nativeKpiCardVisible(metric({ delta: 0 }), true), false)
  assert.equal(nativeKpiCardVisible(metric({ secondary_value: 7, delta: 12, breakdown: [row('meaningful child', 8)] }), true), false)
  assert.equal(nativeKpiCardVisible(metric({ secondary_value: 7, delta: 12, breakdown: [row('meaningful child', 8)] }), false), true)
})

test('recursive zero pruning hides whole zero groups including nonzero descendants while preserving unknown and negative groups', () => {
  const input = [
    row('empty', 0, [row('zero child', 0)]),
    row('parent', 0, [row('nested zero', 0, [row('zero leaf', 0), row('negative leaf', -2)]), row('missing leaf', null)]),
    row('missing parent', null, [row('positive leaf', 3), row('zero leaf', 0)]),
    row('missing only', null),
    row('nonzero parent', 7, [row('zero branch', 0, [row('positive hidden descendant', 5)]), row('negative child', -2)]),
  ]
  const before = structuredClone(input)
  const filtered = filterNativeKpiBreakdown(input, true)
  assert.deepEqual(filtered.map(item => item.key), ['missing parent', 'missing only', 'nonzero parent'])
  assert.equal(filtered[0].value, null)
  assert.deepEqual(filtered[0].children, [input[2].children[0]])
  assert.deepEqual(filtered[2].children, [input[4].children[1]])
  assert.deepEqual(input, before)
  assert.equal(nativeKpiCardVisible(metric({ breakdown: input }), true), false)
})

test('filtering never recalculates original parent aggregates or changes calculation metadata', () => {
  const parent = Object.freeze({ ...row('total', 7, Object.freeze([Object.freeze(row('hidden', 0))])), numerator: 0, denominator: 23 })
  const input = Object.freeze([parent])
  const filtered = filterNativeKpiBreakdown(input, true)
  assert.equal(filtered[0].value, 7)
  assert.equal(filtered[0].numerator, 0)
  assert.equal(filtered[0].denominator, 23)
  assert.deepEqual(filtered[0].children, [])
  assert.equal(input[0].children.length, 1)
  assert.equal(nativeKpiCardVisible(metric({ breakdown: [row('zero', 0)] }), true), false)
  assert.equal(nativeKpiCardVisible(metric({ breakdown: [row('missing', null)] }), true), false)
  assert.equal(nativeKpiCardVisible(metric({ value: null, breakdown: [row('missing', null)] }), true), true)
})
