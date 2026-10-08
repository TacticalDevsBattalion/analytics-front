import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/customFilters.ts', import.meta.url), 'utf8'), { mode: 'strip' })
const lib = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const { countCustomValues, customFiltersToQuery, customSignature, describeCustomValue, formatCustomOptions, isCustomValueActive, parseCustomOptions, pruneCustomValues, slugifyFilterId, validateCustomFilters } = lib

const select = { id: 'ammo', label: 'Тип БК', field: 'bc_name', type: 'select', placement: 'main', options: [{ value: 'a', label: 'Альфа' }, { value: 'b', label: 'Бета' }] }
const range = { id: 'count', label: 'Кількість', field: 'bc_count', type: 'number_range', placement: 'extra', options: [] }
const text = { id: 'note', label: 'Текст', field: 'result', type: 'text', placement: 'extra', options: [] }
const flag = { id: 'eff', label: 'Ефективні', field: 'is_effective', type: 'boolean', placement: 'extra', options: [] }
const all = [select, range, text, flag]

test('each filter type becomes the BI operator the engine already supports', () => {
  const query = customFiltersToQuery(all, { ammo: ['a'], count: { min: '2', max: '10' }, note: ' збит ', eff: 'no' })
  assert.deepEqual(query, [
    { field: 'bc_name', operator: 'in', value: ['a'] },
    { field: 'bc_count', operator: 'between', value: [2, 10] },
    { field: 'result', operator: 'contains', value: 'збит' },
    { field: 'is_effective', operator: 'eq', value: false },
  ])
})

test('open-ended ranges use one bound and reversed bounds are ordered', () => {
  assert.deepEqual(customFiltersToQuery([range], { count: { min: '3' } }), [{ field: 'bc_count', operator: 'gte', value: 3 }])
  assert.deepEqual(customFiltersToQuery([range], { count: { max: '7,5' } }), [{ field: 'bc_count', operator: 'lte', value: 7.5 }])
  assert.deepEqual(customFiltersToQuery([range], { count: { min: '9', max: '1' } }), [{ field: 'bc_count', operator: 'between', value: [1, 9] }])
})

test('empty, invalid and stale values produce no query filters', () => {
  assert.deepEqual(customFiltersToQuery(all, { ammo: [], count: { min: '', max: 'abc' }, note: '   ', eff: '' }), [])
  assert.deepEqual(customFiltersToQuery([select], { ammo: ['gone'] }), [])
  assert.equal(isCustomValueActive(select, ['a']), true)
  assert.equal(isCustomValueActive(select, undefined), false)
  assert.equal(countCustomValues(all, { ammo: ['a'], eff: 'yes' }), 2)
})

test('pruning drops values of removed definitions and unknown options', () => {
  assert.deepEqual(pruneCustomValues([select], { ammo: ['a', 'zzz'], removed: ['x'], count: { min: '1' } }), { ammo: ['a'] })
})

test('signature ignores selection order and empty values', () => {
  assert.equal(customSignature([select], { ammo: ['b', 'a'] }), customSignature([select], { ammo: ['a', 'b'] }))
  assert.equal(customSignature([select], {}), customSignature([select], { ammo: [] }))
  assert.notEqual(customSignature([select], { ammo: ['a'] }), customSignature([select], {}))
})

test('chips describe values with the administrator labels', () => {
  assert.equal(describeCustomValue(select, ['a', 'b']), 'Альфа, Бета')
  assert.equal(describeCustomValue(range, { min: '2', max: '5' }), '2 – 5')
  assert.equal(describeCustomValue(range, { max: '5' }), 'до 5')
  assert.equal(describeCustomValue(flag, 'yes'), 'Так')
  assert.equal(describeCustomValue(text, 'abc'), '«abc»')
  assert.equal(describeCustomValue(text, ''), '')
})

test('option text round-trips and ignores blanks and duplicates', () => {
  const parsed = parseCustomOptions('a = Альфа\n\n b\na = дубль\nc=Цей = рівно')
  assert.deepEqual(parsed, [{ value: 'a', label: 'Альфа' }, { value: 'b', label: 'b' }, { value: 'c', label: 'Цей = рівно' }])
  assert.deepEqual(parseCustomOptions(formatCustomOptions(parsed)), parsed)
})

test('generated ids are unique, lowercase and valid for the backend pattern', () => {
  const pattern = /^[a-z][a-z0-9_]{1,39}$/
  const first = slugifyFilterId('Новий фільтр', ['result'])
  const second = slugifyFilterId('Новий фільтр', [first])
  assert.notEqual(first, second)
  assert.ok(pattern.test(first) && pattern.test(second))
  assert.ok(pattern.test(slugifyFilterId('9 Ammo type!', [])))
  assert.notEqual(slugifyFilterId('Result', ['result']), 'result')
})

test('validation requires names, fields, unique ids and options for selections', () => {
  assert.equal(validateCustomFilters(all), null)
  assert.match(validateCustomFilters([{ ...select, label: ' ' }]), /назва/)
  assert.match(validateCustomFilters([{ ...select, field: '' }]), /поле/)
  assert.match(validateCustomFilters([select, select]), /унікальн/)
  assert.match(validateCustomFilters([{ ...select, options: [] }]), /значення/)
  assert.match(validateCustomFilters(Array.from({ length: 21 }, (_, index) => ({ ...flag, id: `f${index}` }))), /20/)
})
