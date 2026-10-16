import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = await readFile(new URL('../src/lib/areaComparison.ts', import.meta.url), 'utf8')
const lib = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: 'strip' })).toString('base64')}`)
const { analyzeAreas, analyzeMissionGroups, missionKey, isRateMetric, normalizeDirection } = lib

const metrics = [
  { key: 'flights', title: 'Flights', percent: false, rate: false, direction: 'HIGHER_IS_BETTER' },
  { key: 'efficiency', title: 'Efficiency', percent: true, rate: true, direction: 'HIGHER_IS_BETTER' },
  { key: 'per_result', title: 'Flights per result', percent: false, rate: true, direction: 'LOWER_IS_BETTER' },
  { key: 'events', title: 'Events', percent: false, rate: true, direction: 'NEUTRAL' },
]
const rows = [
  { id: 'a', values: { flights: 100, efficiency: 60, per_result: 2, events: 9 } },
  { id: 'b', values: { flights: 5000, efficiency: 40, per_result: 8, events: 1 } },
  { id: 'c', values: { flights: 80, efficiency: 50, per_result: 4, events: 5 } },
]

test('ranks areas only by rate metrics, direction-aware', () => {
  const result = analyzeAreas(rows, metrics)
  // b has by far the most flights, but counts are not judged.
  assert.deepEqual(result.map(item => item.id), ['a', 'c', 'b'])
  assert.equal(result[0].score, 100)
  assert.equal(result[2].score, 0)
  assert.deepEqual(result[0].best, ['efficiency', 'per_result'])
  assert.deepEqual(result[2].worst, ['efficiency', 'per_result'])
  for (const item of result) {
    assert.ok(!item.best.includes('flights') && !item.worst.includes('flights'))
    assert.ok(!item.best.includes('events') && !item.worst.includes('events'))
    assert.ok([...item.strengths, ...item.weaknesses].every(insight => insight.metric.rate))
  }
})

test('strengths and weaknesses use percentage points and lower-is-better ratios', () => {
  const [a, , b] = analyzeAreas(rows, metrics)
  assert.equal(a.strengths.find(item => item.metric.key === 'per_result').deviation, 50) // 2 vs median 4
  assert.equal(a.strengths.find(item => item.metric.key === 'efficiency').deviation, 10) // pp
  assert.equal(b.weaknesses[0].metric.key, 'per_result')
  assert.equal(b.weaknesses[0].deviation, -100)
  assert.equal(b.strengths.length, 0)
})

test('areas with too little activity are shown but not rated', () => {
  const result = analyzeAreas([...rows, { id: 'tiny', values: { flights: 1, efficiency: 100, per_result: 1 } }], metrics)
  const tiny = result.find(item => item.id === 'tiny')
  assert.equal(tiny.lowVolume, true)
  assert.equal(tiny.score, null)
  assert.deepEqual(tiny.best, [])
  assert.equal(result.at(-1).id, 'tiny')
  assert.deepEqual(result.find(item => item.id === 'a').best, ['efficiency', 'per_result'])
})

test('missing values, ties and zero medians are handled without invented judgements', () => {
  const result = analyzeAreas([
    { id: 'x', values: { flights: 20, efficiency: 50, per_result: 0 } },
    { id: 'y', values: { flights: 20, efficiency: 50, per_result: 0 } },
    { id: 'z', values: { flights: 20 } },
  ], metrics.slice(0, 3))
  const z = result.find(item => item.id === 'z')
  assert.equal(z.score, null)
  assert.equal(result.at(-1).id, 'z')
  for (const item of result) { assert.deepEqual(item.best, []); assert.deepEqual(item.strengths, []) }
})

test('rate detection and direction defaults', () => {
  assert.equal(isRateMetric({ aggregation: 'RATIO', format: { type: 'number' } }), true)
  assert.equal(isRateMetric({ aggregation: 'COUNT_DISTINCT', format: { type: 'percent' } }), true)
  assert.equal(isRateMetric({ aggregation: 'FORMULA', normalization: 'PER_100_OPERATIONS' }), true)
  assert.equal(isRateMetric({ aggregation: 'SUM', format: { type: 'number' } }), false)
  assert.equal(isRateMetric({ aggregation: 'COUNT_DISTINCT' }), false)
  assert.equal(normalizeDirection(undefined), 'HIGHER_IS_BETTER')
  assert.equal(normalizeDirection('LOWER_IS_BETTER'), 'LOWER_IS_BETTER')
})

test('single-mission areas are rated only with the same mission, multi-mission areas together, departments never mixed', () => {
  const rate = metrics.slice(0, 2)
  const purposes = [
    // Mavic x only reconnaissance; y reconnaissance plus strikes; w one occasional strike flight.
    { id: 'x', category: 'Mavic', purpose: 'Розвідка', values: { flights: 500, efficiency: 98 } },
    { id: 'w', category: 'Mavic', purpose: 'Розвідка', values: { flights: 300, efficiency: 97 } },
    { id: 'w', category: 'Mavic', purpose: 'Ураження', values: { flights: 1, efficiency: 0 } },
    { id: 'y', category: 'Mavic', purpose: 'Розвідка', values: { flights: 300, efficiency: 96 } },
    { id: 'y', category: 'Mavic', purpose: 'Ураження', values: { flights: 100, efficiency: 50 } },
    // Bombers: b1 only logistics; b2 and b3 several missions.
    { id: 'b1', category: 'Бомбери', purpose: 'Доставка', values: { flights: 400, efficiency: 99 } },
    { id: 'b2', category: 'Бомбери', purpose: 'Доставка', values: { flights: 100, efficiency: 98 } },
    { id: 'b2', category: 'Бомбери', purpose: 'Мінування', values: { flights: 100, efficiency: 95 } },
    { id: 'b3', category: 'Бомбери', purpose: 'Ураження', values: { flights: 100, efficiency: 40 } },
    { id: 'b3', category: 'Бомбери', purpose: 'Мінування', values: { flights: 50, efficiency: 90 } },
  ]
  const totals = [
    { id: 'x', category: 'Mavic', values: { flights: 500, efficiency: 98 } }, { id: 'w', category: 'Mavic', values: { flights: 301, efficiency: 96.7 } },
    { id: 'y', category: 'Mavic', values: { flights: 400, efficiency: 84.5 } },
    { id: 'b1', category: 'Бомбери', values: { flights: 400, efficiency: 99 } }, { id: 'b2', category: 'Бомбери', values: { flights: 200, efficiency: 96.5 } },
    { id: 'b3', category: 'Бомбери', values: { flights: 150, efficiency: 56.7 } },
  ]
  const { departments, missions } = analyzeMissionGroups(totals, purposes, rate)
  const shape = departments.map(department => [department.category, department.groups.map(group => [group.purpose, group.areas.map(area => area.id)])])
  assert.deepEqual(shape, [
    ['Mavic', [[null, ['y']], ['Розвідка', ['x', 'w']]]],
    ['Бомбери', [[null, ['b2', 'b3']], ['Доставка', ['b1']]]],
  ])
  // The logistics-only bomber is not rated against multi-mission bombers.
  assert.equal(departments[1].groups[1].rated, 0)
  // b2: delivery worse than b1, mining better than b3; b3 has no strike peer and weaker mining.
  assert.deepEqual(departments[1].groups[0].areas.map(area => [area.id, Math.round(area.quality), Math.round(area.difficulty), Math.round(area.score)]), [['b2', 62, 65, 62], ['b3', 0, 93, 23]])
  const w = missions.get(missionKey('Mavic', 'w'))
  assert.deepEqual(w.map(mission => [mission.purpose, mission.main]), [['Розвідка', true], ['Ураження', false]])
})

test('related purposes form one mission', () => {
  const { missionOf, missionParts, missionRows } = lib
  const rate = metrics.slice(0, 2)
  assert.equal(missionOf('Вільне полювання'), 'Ураження')
  assert.equal(missionOf(' засідка '), 'Ураження')
  assert.equal(missionOf('Зйомка ураження'), 'Розвідка')
  assert.equal(missionOf('Евакуація'), 'Доставка та евакуація')
  assert.equal(missionOf('Мінування'), 'Мінування')
  assert.deepEqual([...missionParts(['Розвідка', 'Динамічне ураження', 'Засідка', 'Мінування', ''])], [['Розвідка', ['Розвідка']], ['Ураження', ['Динамічне ураження', 'Засідка']], ['Мінування', ['Мінування']]])
  const purposes = [
    { id: 'a', category: 'Mavic', purpose: 'Динамічне ураження', values: { flights: 60, efficiency: 50 } },
    { id: 'a', category: 'Mavic', purpose: 'Вільне полювання', values: { flights: 40, efficiency: 100 } },
    { id: 'b', category: 'Mavic', purpose: 'Засідка', values: { flights: 30, efficiency: 70 } },
    { id: 'b', category: 'Mavic', purpose: 'Розвідка', values: { flights: 70, efficiency: 90 } },
  ]
  const combined = new Map([['Ураження', [{ id: 'a', category: 'Mavic', values: { flights: 100, efficiency: 72 } }, { id: 'b', category: 'Mavic', values: { flights: 30, efficiency: 70 } }]]])
  const rows = missionRows(purposes, combined)
  assert.deepEqual(rows.map(row => [row.id, row.purpose, row.parts, row.values]), [
    ['a', 'Ураження', ['Динамічне ураження', 'Вільне полювання'], { flights: 100, efficiency: 72 }],
    ['b', 'Ураження', ['Засідка'], { flights: 30, efficiency: 70 }],
    ['b', 'Розвідка', ['Розвідка'], { flights: 70, efficiency: 90 }],
  ])
  // A strike-only area is no longer multi-mission.
  const totals = [{ id: 'a', category: 'Mavic', values: { flights: 100, efficiency: 72 } }, { id: 'b', category: 'Mavic', values: { flights: 100, efficiency: 84 } }]
  const { departments } = analyzeMissionGroups(totals, rows, rate)
  assert.deepEqual(departments[0].groups.map(group => [group.purpose, group.areas.map(area => area.id)]), [[null, ['b']], ['Ураження', ['a']]])
  // Without combined values only flights are summed; rates are not added up.
  assert.deepEqual(missionRows(purposes, new Map())[0].values, { flights: 100 })
})

test('score is shown as 1–5 stars', () => {
  assert.deepEqual([0, 19.9, 20, 59, 79.9, 80, 100].map(lib.scoreStars), [1, 1, 2, 3, 4, 5, 5])
})

test('multi-mission rating compares each mission with the same mission and rewards strikes', () => {
  const rate = metrics.slice(0, 2)
  const row = (id, purpose, flights, efficiency) => ({ id, category: 'Mavic', purpose, values: { flights, efficiency } })
  // a: mostly strikes; b: mostly delivery, so its total effectiveness is higher.
  // Strike and delivery quality are the same for both.
  const purposes = [row('a', 'Ураження', 1500, 40), row('a', 'Доставка та евакуація', 500, 95), row('b', 'Ураження', 500, 40), row('b', 'Доставка та евакуація', 1500, 95), row('c', 'Ураження', 1000, 30), row('c', 'Доставка та евакуація', 1000, 90)]
  const totals = [{ id: 'a', category: 'Mavic', values: { flights: 2000, efficiency: 53.75 } }, { id: 'b', category: 'Mavic', values: { flights: 2000, efficiency: 81.25 } }, { id: 'c', category: 'Mavic', values: { flights: 2000, efficiency: 60 } }]
  const [group] = analyzeMissionGroups(totals, purposes, rate).departments[0].groups
  assert.equal(group.purpose, null)
  assert.deepEqual(group.areas.map(area => area.id), ['a', 'b', 'c'])
  const [a, b, c] = group.areas
  assert.equal(a.quality, 100); assert.equal(b.quality, 100); assert.equal(c.quality, 0)
  assert.deepEqual([a, b, c].map(area => Math.round(area.difficulty)), [85, 55, 70])
  assert.equal(lib.missionWeight('Мінування') > lib.missionWeight('Доставка та евакуація'), true)
})
