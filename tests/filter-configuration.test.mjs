import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/filterConfiguration.ts', import.meta.url), 'utf8'), { mode: 'strip' })
const { canonicalOrganizationFilters, countSelectedFilters, optionsWithSelections, resolveFilterFields, selectedFilterKeys } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const filters = (extra = {}) => ({ date_from: '2026-09-01', date_to: '2026-09-30', direction: [], unit: [], category: [], asset: [], group: [], bbak: [], rota: [], battalion: [], purpose: [], class_name: [], result: [], ...extra })

test('a legacy battalion-only selection appears in the single BBAK field without mutating submitted filters', () => {
  const submitted = filters({ battalion: ['12', '7'] })
  const next = canonicalOrganizationFilters(submitted, 'bbak')
  assert.deepEqual(next.bbak, ['12', '7'])
  assert.deepEqual(next.battalion, [])
  assert.deepEqual(submitted.battalion, ['12', '7'])
  next.bbak.push('3')
  assert.deepEqual(submitted.bbak, [])
})

test('equivalent alias conditions are counted once while differing legacy intersections remain intact', () => {
  const duplicate = canonicalOrganizationFilters(filters({ bbak: ['1', '2'], battalion: ['2', '1'] }), 'bbak')
  assert.equal(countSelectedFilters(duplicate), 2)
  const distinct = canonicalOrganizationFilters(filters({ bbak: ['1', '2'], battalion: ['2', '3'] }), 'bbak')
  assert.deepEqual(distinct.bbak, ['1', '2'])
  assert.deepEqual(distinct.battalion, ['2', '3'])
  assert.deepEqual(selectedFilterKeys(distinct), ['bbak', 'battalion'])
})

test('organization owns its selected dimension so the responsibility-zone field cannot repeat it', () => {
  const fields = [{ key: 'unit', label: 'Zone', placement: 'extra' }, { key: 'organization', label: 'Organization', placement: 'main' }, { key: 'category', label: 'Department', placement: 'main' }, { key: 'time', label: 'Time', placement: 'extra' }]
  assert.deepEqual(resolveFilterFields(fields, 'unit').map((field) => field.selectionKey), ['unit', 'category'])
  assert.deepEqual(resolveFilterFields(fields, 'bbak').map((field) => field.selectionKey), ['unit', 'bbak', 'category'])
})

test('placement changes retain stable filter keys and hidden selections remain removable', () => {
  const fields = [{ key: 'category', label: 'Custom name', placement: 'hidden' }, { key: 'purpose', label: 'Purpose', placement: 'main' }]
  const resolved = resolveFilterFields(fields, 'bbak')
  assert.equal(resolved[0].selectionKey, 'category')
  assert.equal(resolved[0].placement, 'hidden')
  assert.deepEqual(selectedFilterKeys(filters({ category: ['FPV'], purpose: ['Розвідка'] })), ['category', 'purpose'])
})

test('saved values absent from current options stay selectable by their original API identifiers', () => {
  const choices = optionsWithSelections([{ id: 7, title: 'Seven' }], ['7', 'old-id', 'old-id'])
  assert.deepEqual(choices, [{ id: 7, title: 'Seven' }, 'old-id'])
})
