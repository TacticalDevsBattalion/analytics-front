import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/flightSummaries.ts', import.meta.url), 'utf8'), { mode: 'strip' })
const { flightSummaryRows } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const metrics = [{ key: 'flights', value: 1000, breakdown: [
  { key: 'device:A', label: 'A', value: 600, children: [{ key: 'recon', label: 'Розвідка', value: 500 }, { key: 'logistics', label: 'Логістичні', value: 100 }] },
  { key: 'device:B', label: 'B', value: 400, children: [{ key: 'recon', label: 'Розвідка', value: 300 }, { key: 'followup', label: 'Дорозвідка', value: 100 }] },
] }]
test('department summary keeps complete KPI counts rather than a limited events count', () => {
  assert.deepEqual(flightSummaryRows(metrics, 'category'), [['A', 600], ['B', 400]])
})
test('purpose summary joins stable groups across departments and retains the KPI distinction', () => {
  assert.deepEqual(flightSummaryRows(metrics, 'purpose'), [['Розвідка', 800], ['Логістичні', 100], ['Дорозвідка', 100]])
  assert.equal(flightSummaryRows(metrics, 'purpose').reduce((total, [, value]) => total+value, 0), 1000)
})
test('missing flight breakdown is unavailable instead of synthesized from another metric', () => {
  assert.deepEqual(flightSummaryRows([{ key: 'effective', value: 30, breakdown: [{ key: 'A', label: 'A', value: 30 }] }], 'category'), [])
  assert.deepEqual(flightSummaryRows(undefined, 'purpose'), [])
})
