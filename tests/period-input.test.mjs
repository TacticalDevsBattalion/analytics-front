import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/periodInput.ts', import.meta.url), 'utf8'), { mode: 'strip' })
const { dateTimeValue, parseDateTimeValue } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('a missing time is shown as the day boundary', () => {
  assert.equal(dateTimeValue('2026-10-08', undefined, '00:00'), '2026-10-08T00:00')
  assert.equal(dateTimeValue('2026-10-08', '', '23:59'), '2026-10-08T23:59')
})

test('an explicit time wins over the boundary and is trimmed to HH:MM:SS', () => {
  assert.equal(dateTimeValue('2026-10-08', '07:30', '00:00'), '2026-10-08T07:30')
  assert.equal(dateTimeValue('2026-10-08', '15:00:00.123', '00:00'), '2026-10-08T15:00:00')
})

test('day boundaries are stored as "no time" so full-day periods stay full-day', () => {
  assert.deepEqual(parseDateTimeValue('from', '2026-10-08T00:00'), { date: '2026-10-08', time: undefined })
  assert.deepEqual(parseDateTimeValue('from', '2026-10-08T00:00:00'), { date: '2026-10-08', time: undefined })
  assert.deepEqual(parseDateTimeValue('to', '2026-10-08T23:59'), { date: '2026-10-08', time: undefined })
  assert.deepEqual(parseDateTimeValue('to', '2026-10-08T23:59:59'), { date: '2026-10-08', time: undefined })
})

test('other times are kept; the boundary of the opposite side is not a boundary', () => {
  assert.deepEqual(parseDateTimeValue('from', '2026-10-08T07:00'), { date: '2026-10-08', time: '07:00' })
  assert.deepEqual(parseDateTimeValue('to', '2026-10-08T18:30'), { date: '2026-10-08', time: '18:30' })
  assert.deepEqual(parseDateTimeValue('from', '2026-10-08T23:59'), { date: '2026-10-08', time: '23:59' })
  assert.deepEqual(parseDateTimeValue('to', '2026-10-08T00:00'), { date: '2026-10-08', time: '00:00' })
})

test('empty or incomplete input is ignored', () => {
  assert.equal(parseDateTimeValue('from', ''), null)
  assert.equal(parseDateTimeValue('to', 'T12:00'), null)
})

test('round trip keeps the stored state', () => {
  for (const [side, time, boundary] of [['from', undefined, '00:00'], ['from', '07:15', '00:00'], ['to', undefined, '23:59'], ['to', '19:45', '23:59']]) {
    const parsed = parseDateTimeValue(side, dateTimeValue('2026-10-08', time, boundary))
    assert.deepEqual(parsed, { date: '2026-10-08', time })
  }
})
