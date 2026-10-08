import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = await readFile(new URL('../src/lib/comparisonDetails.ts', import.meta.url), 'utf8')
const outputText = stripTypeScriptTypes(source, { mode: 'strip' })
const { comparisonDetailRows, comparisonDetailValue } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

const selection = (id, metricKey, breakdown) => ({
  id,
  label: id,
  filters: {},
  metrics: [{ key: metricKey, label: metricKey, value: 100, breakdown }],
})

const result = (...selections) => ({
  mode: 'periods', dimension: 'unit', baseline_id: 'previous', selections,
})

test('uses complete device and purpose key paths to keep repeated child keys separate', () => {
  const response = result(selection('current', 'flights', [
    { key: 'device:А', label: 'Тип А', value: 7, children: [{ key: 'same', label: 'Задача', value: 7 }] },
    { key: 'device:Б', label: 'Тип Б', value: 4, children: [{ key: 'same', label: 'Задача', value: 4 }] },
  ]))
  const rows = comparisonDetailRows(response)
  assert.deepEqual(rows.map((row) => row.key), [
    '["device:А"]', '["device:А","same"]', '["device:Б"]', '["device:Б","same"]',
  ])
  assert.equal(rows[1].parentKey, '["device:А"]')
  assert.equal(rows[3].parentKey, '["device:Б"]')
  assert.equal(comparisonDetailValue(rows[1], 'current'), 7)
  assert.equal(comparisonDetailValue(rows[3], 'current'), 4)
})

test('preserves exact source ratios, averages, units and zero without aggregating parents or children', () => {
  const sourceItem = {
    key: 'type', label: 'Type', value: 12.34567, unit: '%',
    children: [{ key: 'sub', label: 'Sub', value: 0, unit: 'од.' }],
  }
  const response = result(
    selection('current', 'efficiency', [sourceItem]),
    selection('previous', 'efficiency', [{ key: 'type', label: 'Type', value: 98.7654, unit: '%' }]),
  )
  const rows = comparisonDetailRows(response, 'efficiency')
  assert.equal(rows[0].metrics.current, sourceItem)
  assert.equal(comparisonDetailValue(rows[0], 'current'), 12.34567)
  assert.equal(comparisonDetailValue(rows[0], 'previous'), 98.7654)
  assert.equal(rows[0].metrics.current.unit, '%')
  assert.equal(comparisonDetailValue(rows[1], 'current'), 0)
  assert.equal(rows[1].metrics.current.unit, 'од.')
  const averages = comparisonDetailRows(result(selection('current', 'avg_flights_per_position', [
    { key: 'type', label: 'Type', value: 3.14159 },
  ])), 'avg_flights_per_position')
  assert.equal(comparisonDetailValue(averages[0], 'current'), 3.14159)
})

test('missing metrics and missing nested rows remain undefined instead of zero', () => {
  const response = result(
    selection('current', 'flights', [
      { key: 'type', label: 'Type', value: 3, children: [{ key: 'task', label: 'Task', value: 3 }] },
    ]),
    selection('previous', 'flights', [{ key: 'type', label: 'Type', value: 8 }]),
    selection('other', 'effective', [{ key: 'type', label: 'Type', value: 5 }]),
  )
  const rows = comparisonDetailRows(response)
  assert.equal(rows[1].metrics.previous, undefined)
  assert.equal(comparisonDetailValue(rows[1], 'previous'), undefined)
  assert.equal(rows[0].metrics.other, undefined)
  assert.equal(comparisonDetailValue(rows[0], 'other'), undefined)
  assert.deepEqual(comparisonDetailRows(response, 'unknown'), [])
  assert.deepEqual(comparisonDetailRows(result(selection('empty', 'flights', []))), [])
})

test('suppresses primary breakdown when asked for a secondary total', () => {
  const response = result(selection('current', 'affected', [
    { key: 'type', label: 'Type', value: 5 },
  ]))
  response.selections[0].metrics[0].secondary_value = 20
  assert.equal(comparisonDetailRows(response, 'affected').length, 1)
  assert.deepEqual(comparisonDetailRows(response, 'affected:secondary'), [])
})

test('keeps first encountered source order rather than ranking by value', () => {
  const response = result(
    selection('current', 'flights', [
      { key: 'small', label: 'Small', value: 1, children: [{ key: 'taskB', label: 'B', value: 1 }] },
      { key: 'large', label: 'Large', value: 500 },
    ]),
    selection('previous', 'flights', [
      { key: 'large', label: 'Large', value: 1 },
      { key: 'small', label: 'Small', value: 999, children: [{ key: 'taskA', label: 'A', value: 999 }] },
      { key: 'new', label: 'New', value: 5000 },
    ]),
  )
  const rows = comparisonDetailRows(response)
  assert.deepEqual(rows.map((row) => row.key), [
    '["small"]', '["small","taskB"]', '["large"]', '["small","taskA"]', '["new"]',
  ])
})

test('retains supplied language labels and supports recursively nested classifications', () => {
  const response = result(selection('current', 'flights', [
    { key: 'device:тип', label: 'Тип засобів', value: 4, children: [
      { key: 'purpose', label: 'Задача', value: 4, children: [
        { key: 'detail', label: 'Деталь "А" / Б', value: 4 },
      ] },
    ] },
  ]))
  const original = structuredClone(response)
  const rows = comparisonDetailRows(response)
  assert.equal(rows[2].key, '["device:тип","purpose","detail"]')
  assert.equal(rows[2].parentKey, '["device:тип","purpose"]')
  assert.equal(rows[2].depth, 2)
  assert.equal(rows[2].label, 'Деталь "А" / Б')
  assert.deepEqual(rows[2].pathLabels, ['Тип засобів', 'Задача', 'Деталь "А" / Б'])
  assert.deepEqual(response, original)
})

test('JSON paths distinguish keys containing separators and preserve original capitalization', () => {
  const response = result(selection('current', 'flights', [
    { key: 'a/b', label: 'First', value: 1, children: [{ key: 'c', label: 'Child', value: 1 }] },
    { key: 'a', label: 'Second', value: 2, children: [{ key: 'b/c', label: 'Child', value: 2 }] },
    { key: 'A', label: 'Third', value: 3 },
  ]))
  const rows = comparisonDetailRows(response)
  assert.notEqual(rows[1].key, rows[3].key)
  assert.notEqual(rows[2].key, rows[4].key)
})

test('value helper retains finite negative numbers and treats nonfinite source values as unavailable', () => {
  const response = result(selection('current', 'flights', [
    { key: 'negative', label: 'Negative', value: -1.25 },
    { key: 'nan', label: 'NaN', value: NaN },
    { key: 'infinite', label: 'Infinite', value: Infinity },
  ]))
  const rows = comparisonDetailRows(response)
  assert.equal(comparisonDetailValue(rows[0], 'current'), -1.25)
  assert.equal(comparisonDetailValue(rows[1], 'current'), undefined)
  assert.equal(comparisonDetailValue(rows[2], 'current'), undefined)
  assert.ok(Number.isNaN(rows[1].metrics.current.value))
  assert.equal(rows[2].metrics.current.value, Infinity)
})
