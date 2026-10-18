import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = await readFile(new URL('../src/lib/whatsNew.ts', import.meta.url), 'utf8')
const { WHATS_NEW, activeEntries, entriesFor, formatBuild } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: 'strip' })).toString('base64')}`)

const entries = [
  { id: 'a', version: '1', date: '2026-10-18', title: 'A', text: '', target: { page: 'map', widgets: ['map'] } },
  { id: 'b', version: '1', date: '2026-10-17', title: 'B', text: '', target: { page: 'statistics', section: 'positions', widgets: ['position_board'] } },
  { id: 'c', version: '1', date: '2026-08-01', title: 'C', text: '', target: { page: 'comparison' } },
]

test('seen and old entries are not highlighted', () => {
  const today = new Date('2026-10-20T12:00:00')
  assert.deepEqual(activeEntries(entries, new Set(), today).map(entry => entry.id), ['a', 'b'])
  assert.deepEqual(activeEntries(entries, new Set(['a']), today).map(entry => entry.id), ['b'])
})

test('entries are found by page, statistics section and widget', () => {
  assert.deepEqual(entriesFor(entries, { page: 'map' }).map(entry => entry.id), ['a'])
  assert.deepEqual(entriesFor(entries, { page: 'statistics' }).map(entry => entry.id), ['b'])
  assert.deepEqual(entriesFor(entries, { section: 'positions' }).map(entry => entry.id), ['b'])
  assert.deepEqual(entriesFor(entries, { widget: ['stats-positions-table', null, 'position_board'] }).map(entry => entry.id), ['b'])
})

test('build label and changelog shape', () => {
  assert.equal(formatBuild('0.8.0', '2026-10-18T10:00:00Z', 'abc1234'), 'v0.8.0 · 18.10.2026 · abc1234')
  assert.equal(formatBuild('0.8.0', '', ''), 'v0.8.0')
  assert.equal(new Set(WHATS_NEW.map(entry => entry.id)).size, WHATS_NEW.length)
  for (const entry of WHATS_NEW) assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/)
})
