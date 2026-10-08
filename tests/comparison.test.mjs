import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = await readFile(new URL('../src/lib/comparison.ts', import.meta.url), 'utf8')
const outputText = stripTypeScriptTypes(source, { mode: 'strip' })
const { comparisonCsv, comparisonMetricRows, comparisonReference, metricDifference, temporalGroups, temporalMetricCells, temporalPeriodCount, temporalPresetRange } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

test('compares counts with absolute and relative differences', () => {
  assert.deepEqual(metricDifference(150, 100), { absolute: 50, relative: 50 })
  assert.deepEqual(metricDifference(75, 100), { absolute: -25, relative: -25 })
  assert.deepEqual(metricDifference(100, 100), { absolute: 0, relative: 0 })
})

test('percentage values differ in percentage points; relative change is separate', () => {
  const result = metricDifference(60, 50)
  assert.equal(result.absolute, 10)
  assert.equal(result.relative, 20)
})

test('zero reference retains absolute difference and leaves relative change undefined', () => {
  assert.deepEqual(metricDifference(5, 0), { absolute: 5, relative: null })
  assert.deepEqual(metricDifference(0, 0), { absolute: 0, relative: null })
})

test('missing and nonfinite metrics do not become zero values', () => {
  for (const value of [undefined, null, NaN, Infinity, -Infinity]) {
    assert.deepEqual(metricDifference(value, 20), { absolute: null, relative: null })
    assert.deepEqual(metricDifference(20, value), { absolute: null, relative: null })
  }
  const rows = comparisonMetricRows({
    mode: 'periods', baseline_id: 'previous', selections: [
      { id: 'current', metrics: [{ key: 'flights', label: 'Flights', value: 4 }] },
      { id: 'previous', metrics: [{ key: 'efficiency', label: 'Efficiency', value: 50, unit: '%' }] },
    ],
  })
  assert.deepEqual(rows.map((row) => row.key), ['flights', 'efficiency'])
  assert.equal(rows[0].metrics.previous, undefined)
  assert.equal(rows[1].metrics.current, undefined)
  assert.equal(rows[1].unit, '%')
})

test('CSV protects formula strings while preserving numeric differences', () => {
  const document = comparisonCsv([
    ['=SUM(A1:A2)', ' +cmd', '-cmd', '@formula', '\t=1+1'],
    [12, -25, null, undefined, 'safe'],
  ])
  assert.equal(document, '\uFEFF"\'=SUM(A1:A2)","\' +cmd","\'-cmd","\'@formula","\'\t=1+1"\r\n"12","-25","","","safe"\r\n')
})

test('keeps primary context and compares secondary totals including zero and missing values', () => {
  const rows = comparisonMetricRows({
    mode: 'periods', baseline_id: 'previous', selections: [
      { id: 'current', metrics: [
        { key: 'affected', label: 'Уражено', value: 2, primary_label: 'ОС', secondary_label: 'Загалом', secondary_value: 0 },
        { key: 'destroyed', label: 'Знищено', value: 1, primary_label: 'ОС', secondary_label: 'Загалом', secondary_value: 4 },
      ] },
      { id: 'previous', metrics: [
        { key: 'affected', label: 'Уражено', value: 1, primary_label: 'ОС', secondary_label: 'Загалом', secondary_value: 5 },
        { key: 'destroyed', label: 'Знищено', value: 0, primary_label: 'ОС' },
      ] },
    ],
  })
  assert.deepEqual(rows.map((row) => row.key), ['affected', 'affected:secondary', 'destroyed', 'destroyed:secondary'])
  assert.equal(rows[0].context, 'ОС')
  assert.equal(rows[1].context, 'Загалом')
  assert.equal(rows[1].metricKey, 'affected')
  assert.equal(rows[1].metrics.current.value, 0)
  assert.deepEqual(metricDifference(rows[1].metrics.current.value, rows[1].metrics.previous.value), { absolute: -5, relative: -100 })
  assert.equal(rows[3].metrics.previous, undefined)
  assert.deepEqual(metricDifference(rows[3].metrics.current.value, rows[3].metrics.previous?.value), { absolute: null, relative: null })
})

test('CSV preserves UTF-8 labels, quotes, commas, and line breaks', () => {
  assert.equal(comparisonCsv([['ББАК "А", рота', 'line\nnext']]), '\uFEFF"ББАК ""А"", рота","line\nnext"\r\n')
})

test('calendar presets start on Monday and include the current bucket through today', () => {
  assert.deepEqual(temporalPresetRange('week', 4, '2026-09-30'), {
    date_from: '2026-09-07', date_to: '2026-09-30', time_from: undefined, time_to: undefined,
  })
  assert.equal(temporalPresetRange('week', 1, '2026-10-04').date_from, '2026-09-28')
  assert.equal(temporalPresetRange('week', 1, '2026-10-05').date_from, '2026-10-05')
  assert.equal(temporalPresetRange('day', 7, '2026-03-31').date_from, '2026-03-25')
})

test('month and quarter presets cross years without month-end overflow', () => {
  assert.equal(temporalPresetRange('month', 6, '2026-09-30').date_from, '2026-04-01')
  assert.equal(temporalPresetRange('month', 6, '2026-01-31').date_from, '2025-08-01')
  assert.equal(temporalPresetRange('quarter', 4, '2026-09-30').date_from, '2025-10-01')
  assert.equal(temporalPresetRange('month', 2, '2024-03-31').date_from, '2024-02-01')
  assert.throws(() => temporalPresetRange('week', 0, '2026-09-30'))
  assert.throws(() => temporalPresetRange('month', 6, '2026-02-31'))
})

test('bucket workload counts clipped edges and caps oversized ranges independently of DST', () => {
  assert.equal(temporalPeriodCount('2026-09-07', '2026-09-30', 'week'), 4)
  assert.equal(temporalPeriodCount('2026-09-29', '2026-10-01', 'month'), 2)
  assert.equal(temporalPeriodCount('2026-03-25', '2026-03-31', 'day'), 7)
  assert.equal(temporalPeriodCount('2026-01-01', '2026-09-30', 'quarter'), 3)
  assert.equal(temporalPeriodCount('2020-01-01', '2026-09-30', 'week'), 25)
  assert.equal(temporalPeriodCount('2026-10-01', '2026-09-30', 'day'), 0)
  assert.equal(temporalPeriodCount('2026-09-30', '2026-09-01', 'month'), 0)
})

test('temporal matrix and export references use preceding period of the same group', () => {
  const periods = ['p1', 'p2', 'p3'].map((id) => ({ id, label: id, date_from: '2026-09-01', date_to: '2026-09-07', is_partial: false }))
  const selection = (period, group, value) => ({
    id: `${period}/${group}`, group_id: group, period_id: period, label: group,
    metrics: [{ key: 'flights', label: 'Flights', value }],
  })
  const result = {
    mode: 'units_over_time', baseline_id: 'p1/a', periods,
    selections: [selection('p1', 'a', 10), selection('p1', 'b', 100), selection('p2', 'a', 20), selection('p2', 'b', 0), selection('p3', 'a', 5), selection('p3', 'b', 10)],
  }
  assert.deepEqual(temporalGroups(result).map((group) => group.id), ['a', 'b'])
  assert.equal(comparisonReference(result, result.selections[0]), undefined)
  assert.equal(comparisonReference(result, result.selections[3]).id, 'p1/b')
  const [row] = comparisonMetricRows(result)
  const matrix = temporalMetricCells(result, row)
  assert.equal(matrix[0].cells[0].absolute, null)
  assert.equal(matrix[0].cells[1].relative, null)
  assert.deepEqual([matrix[1].cells[0].absolute, matrix[1].cells[0].relative], [10, 100])
  assert.deepEqual([matrix[1].cells[1].absolute, matrix[1].cells[1].relative], [-100, -100])
  assert.deepEqual([matrix[2].cells[1].absolute, matrix[2].cells[1].relative], [10, null])
  const missing = { ...result, selections: result.selections.filter((item) => item.id !== 'p2/a') }
  assert.equal(comparisonReference(missing, missing.selections.find((item) => item.id === 'p3/a')), undefined)
  const missingMatrix = temporalMetricCells(missing, comparisonMetricRows(missing)[0])
  assert.equal(missingMatrix[1].cells[0].value, null)
  assert.equal(missingMatrix[2].cells[0].absolute, null)
})
