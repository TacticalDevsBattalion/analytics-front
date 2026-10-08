import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/cacheAdmin.ts', import.meta.url), 'utf8'), { mode: 'strip' })
const { cacheInvalidation, cacheWarmRequest } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const range = { from: '2026-09-01', to: '2026-09-30' }

test('selected cache invalidation sends only the selected dependency and never retained form values', () => {
  assert.deepEqual(cacheInvalidation('PERIOD', range, 'flights'), { target: 'PERIOD', date_range: range })
  assert.deepEqual(cacheInvalidation('METRIC', range, 'flights'), { target: 'METRIC', key: 'flights' })
  assert.deepEqual(cacheInvalidation('KPI', range, 'efficiency'), { target: 'KPI', key: 'efficiency' })
  assert.deepEqual(cacheInvalidation('CURRENT_PERIOD', range, 'flights'), { target: 'CURRENT_PERIOD' })
  assert.deepEqual(cacheInvalidation('ALL', range, 'flights'), { target: 'ALL' })
})

test('cache period controls reject invalid calendars, reversed and excessive invalidation ranges', () => {
  for (const dates of [{ from: '2026-02-29', to: '2026-03-01' }, { from: '', to: '2026-09-30' }, { from: '2026-10-01', to: '2026-09-30' }, { from: '2000-01-01', to: '2026-09-30' }]) assert.throws(() => cacheInvalidation('PERIOD', dates, ''))
  assert.doesNotThrow(() => cacheInvalidation('PERIOD', { from: '2024-02-29', to: '2024-02-29' }, ''))
  assert.throws(() => cacheInvalidation('METRIC', range, ''))
  assert.throws(() => cacheInvalidation('METRIC', range, 'invalid key;'))
})

test('warming payload captures selected periods and metrics independently of later form edits', () => {
  const periods = ['CURRENT_MONTH', 'CUSTOM']
  const keys = ['flights', 'efficiency']
  const dates = { ...range }
  const request = cacheWarmRequest(periods, dates, keys)
  periods.push('LAST_HORIZON'); keys.push('effective'); dates.to = '2026-10-31'
  assert.deepEqual(request, { periods: ['CURRENT_MONTH', 'CUSTOM'], metric_keys: ['flights', 'efficiency'], date_range: range })
  assert.deepEqual(cacheWarmRequest(['LAST_HORIZON'], { from: '', to: '' }, ['flights']), { periods: ['LAST_HORIZON'], metric_keys: ['flights'] })
})

test('warming requires a selected metric set and unique periods, with an explicit valid custom range', () => {
  assert.throws(() => cacheWarmRequest([], range, ['flights']))
  assert.throws(() => cacheWarmRequest(['CURRENT_MONTH', 'CURRENT_MONTH'], range, ['flights']))
  assert.throws(() => cacheWarmRequest(['CURRENT_MONTH'], range, []))
  assert.throws(() => cacheWarmRequest(['CURRENT_MONTH'], range, ['flights', 'flights']))
  assert.throws(() => cacheWarmRequest(['CURRENT_MONTH'], range, Array.from({ length: 31 }, (_, index) => `metric_${index}`)))
  assert.throws(() => cacheWarmRequest(['CUSTOM'], { from: '', to: '' }, ['flights']))
})
