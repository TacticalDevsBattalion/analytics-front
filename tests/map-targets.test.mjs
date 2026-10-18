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
