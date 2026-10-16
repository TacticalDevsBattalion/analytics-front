import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = await readFile(new URL('../src/lib/metricExplanation.ts', import.meta.url), 'utf8')
const { explainMetric } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: 'strip' })).toString('base64')}`)

const catalog = [
  { key: 'flights', title: 'Вильоти', source: 'flights', aggregation: 'COUNT_DISTINCT', field: 'flight_id', direction: 'HIGHER_IS_BETTER' },
  { key: 'effective', title: 'Результативні вильоти', source: 'flights', aggregation: 'COUNT_DISTINCT', field: 'flight_id', filters: [{ field: 'mission_successful', operator: 'eq', value: true }] },
  { key: 'target_affected', title: 'Уражені цілі', source: 'events', aggregation: 'COUNT', filters: [{ field: 'norm_result', operator: 'eq', value: 'уражено' }], category_mode: 'GENERAL' },
  { key: 'target_destroyed', title: 'Знищені цілі', source: 'events', aggregation: 'COUNT' },
]

test('explains counts, filters and category handling in plain language', () => {
  assert.equal(explainMetric(catalog[0], catalog).calculation, 'Кількість унікальних вильотів.')
  assert.equal(explainMetric(catalog[1], catalog).calculation, 'Кількість унікальних вильотів, де місію позначено успішною.')
  assert.equal(explainMetric(catalog[2], catalog).calculation, 'Кількість записів результатів, де результат = «уражено» (без категорій, які показуються окремо, напр. особового складу).')
  assert.equal(explainMetric({ key: 'detected', source: 'ammunition', aggregation: 'SUM', field: 'bc_count', filters: [{ field: 'norm_bc_name', operator: 'eq', value: 'виявлено' }] }).calculation, 'Сума поля «кількість» у таблиці БК, де назва БК = «виявлено».')
  assert.equal(explainMetric(catalog[0]).kind, 'count')
})

test('ratios and formulas name the metrics they use', () => {
  const efficiency = explainMetric({ key: 'efficiency', aggregation: 'RATIO', numerator: 'effective', denominator: 'flights', format: { type: 'percent' }, direction: 'HIGHER_IS_BETTER' }, catalog)
  assert.equal(efficiency.calculation, '«Результативні вильоти» ÷ «Вильоти» × 100%.')
  assert.equal(efficiency.kind, 'rate')
  assert.equal(efficiency.direction, 'Краще більше')
  const sum = explainMetric({ key: 'target_results', aggregation: 'FORMULA', formula: { op: 'add', args: [{ metric: 'target_affected' }, { metric: 'target_destroyed' }] } }, catalog)
  assert.equal(sum.calculation, '«Уражені цілі» + «Знищені цілі».')
  const nested = explainMetric({ key: 'x', aggregation: 'FORMULA', formula: { op: 'div', args: [{ op: 'add', args: [{ metric: 'a' }, { value: 2 }] }, { metric: 'flights' }] } }, catalog)
  assert.equal(nested.calculation, '(«a» + 2) ÷ «Вильоти».')
})
