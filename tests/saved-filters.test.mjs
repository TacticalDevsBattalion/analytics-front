import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/savedFilters.ts', import.meta.url), 'utf8'), { mode: 'strip' })
const { serializeFilters, restoreFilters } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const defaults = { date_from: '2026-10-14', date_to: '2026-10-20', bbak: [], purpose: [], result: [] }

test('a recent period moves with the calendar, a past one stays', () => {
  const week = serializeFilters({ ...defaults, date_from: '2026-10-14', date_to: '2026-10-20', bbak: ['4'] }, '2026-10-20')
  assert.deepEqual(week.period, { mode: 'relative', end_offset: 0, length: 7 })
  const tomorrow = restoreFilters(week, defaults, '2026-10-21')
  assert.equal(tomorrow.date_from, '2026-10-15'); assert.equal(tomorrow.date_to, '2026-10-21'); assert.deepEqual(tomorrow.bbak, ['4'])
  const yesterday = serializeFilters({ ...defaults, date_from: '2026-10-19', date_to: '2026-10-19' }, '2026-10-20')
  assert.deepEqual(restoreFilters(yesterday, defaults, '2026-11-01'), { ...defaults, date_from: '2026-10-31', date_to: '2026-10-31' })
  const september = serializeFilters({ ...defaults, date_from: '2026-09-01', date_to: '2026-09-15' }, '2026-10-20')
  assert.deepEqual(september.period, { mode: 'absolute', from: '2026-09-01', to: '2026-09-15' })
  assert.equal(restoreFilters(september, defaults, '2026-12-01').date_to, '2026-09-15')
})

test('reporting day, custom filters and unknown keys', () => {
  const saved = serializeFilters({ ...defaults, time_from: '16:30', time_to: '16:30', purpose: ['Розвідка'] }, '2026-10-20', { x_zone: ['A'] })
  assert.equal(saved.time_from, '16:30'); assert.deepEqual(saved.custom, { x_zone: ['A'] })
  const restored = restoreFilters({ ...saved, values: { ...saved.values, removed_field: ['x'] } }, defaults, '2026-10-20')
  assert.equal(restored.time_to, '16:30'); assert.deepEqual(restored.purpose, ['Розвідка']); assert.equal('removed_field' in restored, false)
  assert.deepEqual(restoreFilters({ version: 2 }, defaults, '2026-10-20'), defaults)
  assert.deepEqual(restoreFilters(null, defaults, '2026-10-20'), defaults)
})
