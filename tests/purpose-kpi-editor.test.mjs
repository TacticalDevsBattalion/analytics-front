import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/purposeKpiEditor.ts', import.meta.url), 'utf8'), { mode: 'strip' })
const { purposeKpiSample, validatePurposeKpi, uniquePurposeKpiValues } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const rule = { purpose: 'Окрема мета', success_mode: 'source', successful_results: [], usefulness_percent: 50, coefficient: 2 }
test('KPI rule accepts zero coefficient without changing successful flight counts', () => {
  assert.equal(validatePurposeKpi({ purpose_rules: [{ ...rule, coefficient: 0 }] }), null)
  assert.deepEqual(purposeKpiSample({ ...rule, coefficient: 0 }, 10, 6), { points: 0, capacity: 0, value: null })
})
test('KPI sample applies usefulness and weighting with no fabricated zero percentage', () => {
  assert.deepEqual(purposeKpiSample(rule, 10, 6), { points: 6, capacity: 20, value: 30 })
  assert.deepEqual(purposeKpiSample(rule, 0, 0), { points: 0, capacity: 0, value: null })
  assert.equal(purposeKpiSample(rule, 5, 6), null)
  assert.equal(purposeKpiSample(rule, 2.5, 1), null)
})
test('result-based success must explicitly choose at least one outcome', () => {
  assert.match(validatePurposeKpi({ purpose_rules: [{ ...rule, success_mode: 'results' }] }), /хоча б один/)
  assert.equal(validatePurposeKpi({ purpose_rules: [{ ...rule, success_mode: 'results', successful_results: ['Успішно'] }] }), null)
})
test('rules reject duplicates, invalid ranges, and nonfinite values before save', () => {
  assert.match(validatePurposeKpi({ purpose_rules: [rule, rule] }), /більше одного/)
  for (const coefficient of [-1, 101, NaN, Infinity]) assert.match(validatePurposeKpi({ purpose_rules: [{ ...rule, coefficient }] }), /коефіцієнт/)
  for (const usefulness_percent of [-1, 101, NaN, Infinity]) assert.match(validatePurposeKpi({ purpose_rules: [{ ...rule, usefulness_percent }] }), /частка/)
  assert.match(validatePurposeKpi({ purpose_rules: [{ ...rule, success_mode: 'results', successful_results: ['A', 'A'] }] }), /повторюватися/)
})
test('equivalent source casing and whitespace cannot create overlapping purpose rules or outcomes', () => {
  assert.match(validatePurposeKpi({ purpose_rules: [rule, { ...rule, purpose: '  ОКРЕМА   МЕТА  ' }] }), /більше одного/)
  assert.match(validatePurposeKpi({ purpose_rules: [{ ...rule, success_mode: 'results', successful_results: [' Успішно', 'УСПІШНО  '] }] }), /повторюватися/)
  assert.deepEqual(uniquePurposeKpiValues(['УСПІШНО', 'Інший результат', 'Успішно']), ['Успішно', 'Інший результат'])
  assert.match(validatePurposeKpi({ purpose_rules: [{ ...rule, successful_results: ['Успішно'] }] }), /не потребує/)
})
