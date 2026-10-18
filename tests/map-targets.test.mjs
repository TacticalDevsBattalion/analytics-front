import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = await readFile(new URL('../src/lib/mapTargets.ts', import.meta.url), 'utf8')
const { targetHistory, targetPopupHtml } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: 'strip' })).toString('base64')}`)

const history = [
  { time: '2026-10-10 08:00', status: 'affected', result: 'Уражено', crew: 'A1', position: 'ДЖАНКОЙ', category: 'FPV' },
  { time: '2026-10-10 09:15', status: 'affected', result: 'Уражено', crew: 'A2', position: '', category: 'FPV' },
  { time: '2026-10-11 07:30', status: 'destroyed', result: 'Знищено', crew: '<b>x</b>', position: 'ІО', category: 'Бомбери' },
]

test('hover card lists every strike and ends with the destruction', () => {
  const html = targetPopupHtml({ status: 'destroyed', class_name: 'Танк', target_id: 'T1', affected_count: 2, grid_ref: '37U DQ 06502 11859', history: JSON.stringify(history) })
  assert.match(html, /Танк · T1/)
  assert.match(html, /Уражено 2 рази, потім знищено/)
  assert.equal((html.match(/map-target__strike /g) ?? []).length, 3)
  assert.ok(html.indexOf('2026-10-10 08:00') < html.indexOf('2026-10-11 07:30'))
  assert.match(html, /екіпаж A1 · ДЖАНКОЙ · FPV/)
  // Source text is escaped.
  assert.ok(!html.includes('<b>x</b>') && html.includes('&lt;b&gt;x&lt;/b&gt;'))
})

test('affected-only targets and broken history', () => {
  assert.match(targetPopupHtml({ status: 'affected', affected_count: 5, history: '[]' }), /Уражено 5 разів/)
  assert.deepEqual(targetHistory({ history: 'not json' }), [])
  assert.equal(targetHistory({ history: history }).length, 3)
})

test('cluster list puts destroyed and most struck targets first', async () => {
  const { sortTargets, targetListHtml } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: 'strip' })).toString('base64')}`)
  const features = [
    { properties: { target_id: 'A', status: 'affected', strikes: 5, affected_count: 5, timestamp: '2026-10-10 08:00' } },
    { properties: { target_id: 'B', status: 'destroyed', strikes: 1, affected_count: 0, timestamp: '2026-10-09 08:00' } },
    { properties: { target_id: 'C', status: 'affected', strikes: 1, affected_count: 1, timestamp: '2026-10-11 08:00' } },
    { properties: { target_id: 'D', status: 'destroyed', strikes: 3, affected_count: 2, timestamp: '2026-10-08 08:00' } },
  ]
  const sorted = sortTargets(features)
  assert.deepEqual(sorted.map(item => item.properties.target_id), ['D', 'B', 'A', 'C'])
  const html = targetListHtml(sorted, 120)
  assert.match(html, /Цілей: 120/)
  assert.match(html, /знищено 2 з показаних 4/)
  assert.match(html, /Знищено після 2 разів|Знищено після 2 рази/)
  assert.match(html, /Уражено 5 разів/)
  assert.equal((html.match(/data-index=/g) ?? []).length, 4)
})
