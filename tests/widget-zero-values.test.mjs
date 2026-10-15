import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/widgetPresentation.ts', import.meta.url), 'utf8'), { mode: 'strip' })
const { hidesZeroWidgetValues, filterZeroWidgetRows, nonZeroWidgetMetrics } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const result = rows => ({ status: 'success', rows, metrics: [], dimensions: ['category'] })

test('zero suppression is on by default and only an explicit false shows zeros', () => {
  for (const value of [undefined, true]) assert.equal(hidesZeroWidgetValues({ visualization: { options: { hide_zero_values: value } } }), true)
  assert.equal(hidesZeroWidgetValues({ visualization: { options: { hide_zero_values: false } } }), false)
  assert.equal(hidesZeroWidgetValues({ visualization: {} }), true)
})

test('zero row suppression keeps negatives and mixed metrics, hides empty rows, independently of numeric dimensions', () => {
  const rows = [
    { category: 5, a: 0, b: -0 },
    { category: 0, a: undefined, b: undefined },
    { category: 0, a: 2, b: 0 },
    { category: 0, a: 0, b: -3 },
    { category: 0, a: '0', b: 0 },
  ]
  assert.deepEqual(filterZeroWidgetRows(result(rows), [{ key: 'a' }, { key: 'b' }]).rows, rows.slice(2))
  assert.deepEqual(filterZeroWidgetRows(result(rows), []).rows, rows)
})

test('a target type that was neither affected nor destroyed is hidden even though its ratios have no value', () => {
  const metrics = ['target_affected', 'target_destroyed', 'flights_per_affected', 'flights_per_destroyed'].map(key => ({ key }))
  const rows = [
    { target_type: 'Танк', target_affected: 0, target_destroyed: 0, flights_per_affected: null, flights_per_destroyed: null },
    { target_type: 'Гармата', target_affected: 2, target_destroyed: 0, flights_per_affected: 3, flights_per_destroyed: null },
    { target_type: 'Невідомо', target_affected: null, target_destroyed: undefined, flights_per_affected: null, flights_per_destroyed: null },
  ]
  assert.deepEqual(filterZeroWidgetRows(result(rows), metrics).rows, [rows[1]])
})

test('display filtering includes separate categories and preserves exact server totals, context and input', () => {
  const input = { ...result([{ category: 'zero', a: 0 }, { category: 'positive', a: 5 }]), separate_rows: [{ category: 'zero extra', a: 0 }, { category: 'ОС', a: 4 }], totals: { a: 9 }, metadata: { revision: 2 } }
  const before = structuredClone(input)
  const filtered = filterZeroWidgetRows(input, [{ key: 'a' }])
  assert.deepEqual(filtered.rows, [input.rows[1]])
  assert.deepEqual(filtered.separate_rows, [input.separate_rows[1]])
  assert.strictEqual(filtered.rows[0], input.rows[1], 'Drill-through retains the original row context')
  assert.strictEqual(filtered.totals, input.totals)
  assert.strictEqual(filtered.metadata, input.metadata)
  assert.deepEqual(input, before)
})

test('zero-only and empty series are hidden across main and separate rows', () => {
  const input = { ...result([{ a: 0, b: 1, c: 0, d: null, e: null }]), separate_rows: [{ a: 0, b: 0, c: 3, d: undefined, e: 2 }] }
  const metrics = ['a', 'b', 'c', 'd', 'e'].map(key => ({ key }))
  assert.deepEqual(nonZeroWidgetMetrics(input, metrics).map(metric => metric.key), ['b', 'c', 'e'])
  assert.deepEqual(nonZeroWidgetMetrics(result([]), metrics), metrics)
})
