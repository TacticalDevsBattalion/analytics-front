import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const comparisonSource = stripTypeScriptTypes(await readFile(new URL('../src/lib/comparison.ts', import.meta.url), 'utf8'), { mode: 'strip' })
const setupSource = stripTypeScriptTypes(await readFile(new URL('../src/lib/comparisonSetup.ts', import.meta.url), 'utf8'), { mode: 'strip' })
  .replace(/from\s+(['"])\.\/comparison\1/g, `from ${JSON.stringify(moduleUrl(comparisonSource))}`)
const { buildComparisonRequest, comparisonSetupValidation } = await import(moduleUrl(setupSource))

function filters(overrides = {}) {
  return {
    date_from: '2026-09-01', date_to: '2026-09-07', time_from: '08:00', time_to: '18:00',
    direction: ['direction A'], unit: ['zone A', 'zone B'], category: ['device type A'],
    asset: ['asset A'], group: ['crew A'], bbak: ['42', '99'], rota: ['company A', 'company B'],
    battalion: ['3', '4'], purpose: ['purpose A'], class_name: ['class A'], result: ['result A'],
    ...overrides,
  }
}

function settings(overrides = {}) {
  return {
    enabled: true, mode: 'periods', dimension: 'bbak', granularity: 'week', reference: 'previous',
    reference_period: { date_from: '2026-08-01', date_to: '2026-08-07' },
    ...overrides,
  }
}

test('disabled comparison still validates the reporting period and produces no request', () => {
  const disabled = settings({ enabled: false, mode: 'units', reference: 'custom', reference_period: { date_from: '', date_to: '' } })
  const emptyGrouping = filters({ bbak: [] })
  assert.equal(comparisonSetupValidation(disabled, emptyGrouping), null)
  assert.equal(buildComparisonRequest(disabled, emptyGrouping), null)
  const invalidPeriod = filters({ date_from: '' })
  assert.equal(comparisonSetupValidation(disabled, invalidPeriod), 'period')
  assert.equal(buildComparisonRequest(disabled, invalidPeriod), null)
})

test('previous-period request includes only its relevant fields', () => {
  const config = settings({ reference_period: { date_from: '', date_to: '' } })
  const request = buildComparisonRequest(config, filters())
  assert.equal(comparisonSetupValidation(config, filters()), null)
  assert.deepEqual(Object.keys(request).sort(), ['filters', 'mode'])
  assert.equal(request.mode, 'periods')
  assert.equal(request.filters.date_from, '2026-09-01')
})

test('custom reference replaces only date and time endpoints and independently clones every filter array', () => {
  const current = filters()
  const config = settings({ reference: 'custom' })
  const request = buildComparisonRequest(config, current)
  assert.deepEqual(Object.keys(request).sort(), ['comparison_filters', 'filters', 'mode'])
  assert.equal(request.filters.time_from, '08:00')
  assert.equal(request.filters.time_to, '18:00')
  assert.equal(request.comparison_filters.date_from, '2026-08-01')
  assert.equal(request.comparison_filters.date_to, '2026-08-07')
  assert.equal(request.comparison_filters.time_from, undefined)
  assert.equal(request.comparison_filters.time_to, undefined)
  for (const [key, value] of Object.entries(current)) {
    if (!Array.isArray(value)) continue
    assert.deepEqual(request.filters[key], value)
    assert.deepEqual(request.comparison_filters[key], value)
    assert.notEqual(request.filters[key], value)
    assert.notEqual(request.comparison_filters[key], value)
    assert.notEqual(request.filters[key], request.comparison_filters[key])
  }
  request.comparison_filters.category.push('reference-only type')
  assert.deepEqual(current.category, ['device type A'])
  assert.deepEqual(request.filters.category, ['device type A'])
})

test('submitted requests retain snapshots after reporting filters and settings change', () => {
  const current = filters()
  const config = settings({ reference: 'custom', reference_period: { date_from: '2026-08-01', date_to: '2026-08-07', time_from: '09:15:00.125', time_to: '17:45:00.500' } })
  const request = buildComparisonRequest(config, current)
  const snapshot = structuredClone(request)
  current.date_from = '2026-10-01'
  current.category.push('new device type')
  current.bbak.splice(0, 1)
  config.reference_period.date_from = '2026-07-01'
  config.reference_period.time_from = '10:00'
  assert.deepEqual(request, snapshot)
  const unitFilters = filters()
  const unitRequest = buildComparisonRequest(settings({ mode: 'units' }), unitFilters)
  unitFilters.bbak.reverse()
  unitFilters.unit.push('zone C')
  assert.deepEqual(unitRequest.units, ['42', '99'])
  assert.deepEqual(unitRequest.filters.bbak, ['42', '99'])
  assert.deepEqual(unitRequest.filters.unit, ['zone A', 'zone B'])
  assert.notEqual(unitRequest.units, unitRequest.filters.bbak)
})

test('group selections come exclusively from the chosen filter and omit dormant mode settings', () => {
  const current = filters({ bbak: [' 42 ', '99'] })
  for (const dimension of ['unit', 'bbak', 'rota', 'battalion']) {
    const config = settings({ mode: 'units', dimension, reference: 'custom', reference_period: { date_from: '', date_to: '' } })
    const request = buildComparisonRequest(config, current)
    assert.deepEqual(Object.keys(request).sort(), ['dimension', 'filters', 'mode', 'units'])
    assert.equal(request.dimension, dimension)
    assert.deepEqual(request.units, current[dimension].map((value) => value.trim()))
    assert.deepEqual(request.filters.category, current.category)
    assert.deepEqual(request.filters.purpose, current.purpose)
  }
  assert.deepEqual(current.bbak, [' 42 ', '99'])
  const largeIds = ['9223372036854775807', '-9223372036854775808']
  assert.deepEqual(buildComparisonRequest(settings({ mode: 'units' }), filters({ bbak: largeIds })).units, largeIds)
})

test('temporal request includes granularity with all shared filters and no custom reference', () => {
  const config = settings({ mode: 'units_over_time', granularity: 'month', reference: 'custom', reference_period: { date_from: '', date_to: '' } })
  const request = buildComparisonRequest(config, filters({ date_to: '2026-10-31' }))
  assert.deepEqual(Object.keys(request).sort(), ['dimension', 'filters', 'granularity', 'mode', 'units'])
  assert.equal(request.mode, 'units_over_time')
  assert.equal(request.granularity, 'month')
  assert.deepEqual(request.units, ['42', '99'])
  assert.deepEqual(request.filters.category, ['device type A'])
  assert.deepEqual(request.filters.group, ['crew A'])
})

test('invalid calendar dates and reversed ranges return period validation errors', () => {
  for (const date of ['', '2026-2-01', '2026-02-30', '2025-02-29', '0000-01-01', '2026-09-31', '2026-09-01Z', 'not a date']) {
    assert.equal(comparisonSetupValidation(settings(), filters({ date_from: date })), 'period', date)
    assert.equal(comparisonSetupValidation(settings(), filters({ date_to: date })), 'period', date)
  }
  assert.equal(comparisonSetupValidation(settings(), filters({ date_from: '2026-09-08' })), 'period')
  assert.equal(comparisonSetupValidation(settings(), filters({ date_from: '2024-02-29', date_to: '2024-03-01' })), null)
  assert.equal(comparisonSetupValidation(settings(), filters({ date_from: '0001-01-01', date_to: '0001-01-02' })), null)
})

test('local time validation rejects offsets and malformed clocks without DST-dependent parsing', () => {
  for (const time of ['24:00', '09:60', '09:00:60', '09:00Z', '09:00+02:00', '09:00:00.1234567', '9:00', ' 09:00', '09:00 ', '08:00junk']) {
    assert.equal(comparisonSetupValidation(settings(), filters({ time_from: time })), 'period', time)
    assert.equal(comparisonSetupValidation(settings(), filters({ time_to: time })), 'period', time)
  }
  assert.equal(comparisonSetupValidation(settings(), filters({ date_to: '2026-09-01', time_from: '18:00', time_to: '08:00' })), 'period')
  assert.equal(comparisonSetupValidation(settings(), filters({ date_to: '2026-09-02', time_from: '23:59', time_to: '00:01' })), null)
  assert.equal(comparisonSetupValidation(settings(), filters({ date_to: '2026-09-01', time_from: '09:00:00.123456', time_to: '09:00:00.123456' })), null)
  assert.equal(comparisonSetupValidation(settings(), filters({ date_from: '2026-03-29', date_to: '2026-03-29', time_from: '02:30', time_to: '03:00' })), null)
})

test('blank optional times use full days and are normalized before submission', () => {
  const current = filters({ time_from: '', time_to: '' })
  assert.equal(comparisonSetupValidation(settings(), current), null)
  const request = buildComparisonRequest(settings(), current)
  assert.equal(request.filters.time_from, undefined)
  assert.equal(request.filters.time_to, undefined)
  assert.equal(current.time_from, '')
  assert.equal(current.time_to, '')
})

test('custom reference validates its own calendar and time range only when selected', () => {
  for (const reference_period of [
    { date_from: '', date_to: '' },
    { date_from: '2026-02-30', date_to: '2026-03-01' },
    { date_from: '2026-08-08', date_to: '2026-08-07' },
    { date_from: '2026-08-01', date_to: '2026-08-01', time_from: '18:00', time_to: '08:00' },
    { date_from: '2026-08-01', date_to: '2026-08-07', time_from: '08:00+03:00' },
  ]) {
    assert.equal(comparisonSetupValidation(settings({ reference: 'custom', reference_period }), filters()), 'reference')
    assert.equal(comparisonSetupValidation(settings({ reference: 'previous', reference_period }), filters()), null)
  }
})

test('empty, excessive, blank, and duplicate grouping selections are rejected after trimming', () => {
  for (const bbak of [[], ['42'], Array.from({ length: 7 }, (_, index) => String(index)), ['42', ' '], ['42', '\u00a0'], ['42', ' 42 ']]) {
    for (const mode of ['units', 'units_over_time']) {
      assert.equal(comparisonSetupValidation(settings({ mode }), filters({ bbak })), 'units')
    }
  }
  assert.equal(comparisonSetupValidation(settings({ mode: 'units' }), filters({ bbak: Array.from({ length: 6 }, (_, index) => String(index)) })), null)
  assert.equal(comparisonSetupValidation(settings(), filters({ bbak: [] })), null)
})

test('calendar workload accepts exact bounds and rejects periods or cells beyond the limits', () => {
  const config = settings({ mode: 'units_over_time', granularity: 'day' })
  assert.equal(comparisonSetupValidation(config, filters({ date_to: '2026-09-24', bbak: ['A', 'B', 'C'] })), null)
  assert.equal(comparisonSetupValidation(config, filters({ date_to: '2026-09-25' })), 'workload')
  assert.equal(comparisonSetupValidation(config, filters({ date_to: '2026-09-24', bbak: ['A', 'B', 'C', 'D'] })), 'workload')
  assert.equal(comparisonSetupValidation(config, filters({ date_to: '2026-09-12', bbak: ['A', 'B', 'C', 'D', 'E', 'F'] })), null)
  assert.equal(comparisonSetupValidation(config, filters({ date_to: '2026-09-13', bbak: ['A', 'B', 'C', 'D', 'E', 'F'] })), 'workload')
  assert.equal(comparisonSetupValidation(settings({ mode: 'units_over_time', granularity: 'month' }), filters({ date_from: '2026-09-30', date_to: '2026-10-01' })), null)
  assert.equal(comparisonSetupValidation(settings({ mode: 'units' }), filters({ date_from: '2020-01-01', date_to: '2026-09-30' })), null)
})

test('invalid enabled settings throw clear submission errors for each validation failure', () => {
  assert.throws(() => buildComparisonRequest(settings(), filters({ date_from: '' })), /valid reporting date and time range/)
  assert.throws(() => buildComparisonRequest(settings({ reference: 'custom', reference_period: { date_from: '', date_to: '' } }), filters()), /valid custom comparison date and time range/)
  assert.throws(() => buildComparisonRequest(settings({ mode: 'units' }), filters({ bbak: [] })), /2 and 6 distinct/)
  assert.throws(() => buildComparisonRequest(settings({ mode: 'units_over_time', granularity: 'day' }), filters({ date_to: '2026-09-30' })), /24 periods and 72/)
})
