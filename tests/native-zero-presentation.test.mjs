import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

async function load(file) {
  const source = stripTypeScriptTypes(await readFile(new URL(`../src/lib/${file}.ts`, import.meta.url), 'utf8'), { mode: 'strip' })
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const { nativeDistributionEntries, nativePlotValue, nativeTimelineTotal, nativeTimelineValues, visibleNativeTimeline, visibleNativeValues } = await load('nativeWidgetPresentation')
const { flightSummaryRows } = await load('flightSummaries')

test('native value suppression removes exact numeric zeros and preserves unavailable and negative values', () => {
  const rows = Object.freeze([Object.freeze({ value: 0 }), Object.freeze({ value: null }), Object.freeze({ value: -2 }), Object.freeze({ value: 2 }), Object.freeze({ value: '0' })])
  assert.equal(visibleNativeValues(rows, false), rows)
  assert.deepEqual(visibleNativeValues(rows, true), rows.slice(1))
  assert.equal(nativePlotValue(0, true), null)
  assert.equal(nativePlotValue(-3, true), -3)
  assert.equal(nativePlotValue(null, true), null)
  assert.equal(nativePlotValue(0, false), 0)
  assert.equal(rows[0].value, 0)
})

test('purpose zeros are suppressed after complete cross-department aggregation', () => {
  const metrics = [{ key: 'flights', value: 7, breakdown: [
    { key: 'A', label: 'A', value: 4, children: [{ key: 'same', label: 'Combined', value: 4 }, { key: 'zero', label: 'Zero', value: 0 }] },
    { key: 'B', label: 'B', value: 3, children: [{ key: 'same', label: 'Combined', value: 3 }, { key: 'zero', label: 'Zero', value: 0 }] },
  ] }]
  const complete = flightSummaryRows(metrics, 'purpose')
  const before = JSON.stringify(metrics)
  assert.deepEqual(nativeDistributionEntries(complete, true).map(entry => [entry.label, entry.value]), [['Combined', 7]])
  assert.equal(nativeDistributionEntries(complete, false).length, 2)
  assert.equal(JSON.stringify(metrics), before)
  const unusual = nativeDistributionEntries([['zero', 0], ['negative', -2], ['missing', null]], true)
  assert.deepEqual(unusual.map(entry => [entry.label, entry.value, entry.index]), [['negative', -2, 1], ['missing', null, 2]])
})

test('timeline keeps mixed dates and server totals while omitting zero-only dates', () => {
  const data = Object.freeze([
    Object.freeze({ date: '2026-10-01', total: 0, effective: 0, day: 0, night: 0 }),
    Object.freeze({ date: '2026-10-02', total: 6, effective: 2, day: 6, night: 0 }),
    Object.freeze({ date: '2026-10-03', total: -2, effective: 0, day: -2, night: 0 }),
    Object.freeze({ date: '2026-10-04', total: null, effective: null, day: null, night: 0 }),
  ])
  assert.equal(visibleNativeTimeline(data, 'combined', false), data)
  for (const view of ['combined', 'bars', 'line', 'area']) {
    const visible = visibleNativeTimeline(data, view, true)
    assert.deepEqual(visible.map(point => point.date), ['2026-10-02', '2026-10-03', '2026-10-04'])
    assert.equal(visible.reduce((sum, point) => sum + (point.total ?? 0), 0), data.reduce((sum, point) => sum + (point.total ?? 0), 0))
  }
  assert.equal(data[0].total, 0)
  assert.equal(nativeTimelineValues(data[2]).day, -2)
  assert.equal(nativeTimelineValues(data[3]).total, null)
})

test('combined timeline considers displayed efficiency and never suppresses a server total', () => {
  const efficiencyOnly = { date: '2026-10-01', total: 0, effective: 0, day: 0, night: 0, day_efficiency: 10, night_efficiency: 0 }
  const serverTotal = { date: '2026-10-02', total: 7, effective: 0, day: 0, night: 0 }
  assert.equal(visibleNativeTimeline([efficiencyOnly], 'combined', true).length, 1)
  assert.equal(visibleNativeTimeline([efficiencyOnly], 'bars', true).length, 0)
  assert.equal(visibleNativeTimeline([serverTotal], 'combined', true).length, 1)
  assert.equal(nativeTimelineValues(serverTotal).total, 7)
})

test('explicit unavailable timeline measures remain unknown while absent legacy fields retain fallbacks', () => {
  const knownZero = { date: '2026-10-01', total: 0, effective: 0, day: 0, night: 0 }
  for (const field of ['day', 'night', 'day_efficiency', 'night_efficiency']) {
    const point = { ...knownZero, [field]: null }
    assert.equal(visibleNativeTimeline([point], 'combined', true).length, 1, `${field} must not become a zero-only date`)
    const values = nativeTimelineValues(point)
    const mappedField = field === 'day_efficiency' ? 'dayEfficiency' : field === 'night_efficiency' ? 'nightEfficiency' : field
    assert.equal(values[mappedField], null)
    assert.equal(nativePlotValue(values[mappedField], true), null)
    assert.equal(point[field], null)
  }
  for (const field of ['day_effective', 'night_effective']) {
    const values = nativeTimelineValues({ ...knownZero, [field]: null })
    assert.equal(values[field === 'day_effective' ? 'dayEfficiency' : 'nightEfficiency'], null)
  }
  assert.deepEqual(nativeTimelineValues({ date: '2026-10-02', total: 2, effective: 1 }), { total: 2, day: 2, night: 0, dayEfficiency: 50, nightEfficiency: 0 })
  assert.equal(visibleNativeTimeline([knownZero], 'combined', true).length, 0)
  assert.equal(visibleNativeTimeline([{ ...knownZero, night: null }], 'bars', true).length, 1)
})

test('timeline period total uses the original daily totals and stays unavailable when a daily total is unknown', () => {
  assert.equal(nativeTimelineTotal([{ total: 4 }, { total: 0 }, { total: -1 }]), 3)
  assert.equal(nativeTimelineTotal([{ total: 4 }, { total: null }]), null)
  assert.equal(nativeTimelineTotal([{ total: undefined }]), null)
  assert.equal(nativeTimelineTotal([{ total: 0 }]), 0)
})
