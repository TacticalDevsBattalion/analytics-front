import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = await readFile(new URL('../src/lib/positionBoard.ts', import.meta.url), 'utf8')
const { groupPositions, efficiencyOf, sortValue } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: 'strip' })).toString('base64')}`)

test('rows are grouped into departments, positions and crews', () => {
  const rows = [
    { category: 'FPV', bbak_title: '1 ББАК', position: 'ЗЕФІР', team: 'IN60', flights: 50, day_flights: 40, night_flights: 10, effective: 5 },
    { category: 'FPV', bbak_title: '1 ББАК', position: 'ЗЕФІР', team: 'IN61', flights: 150, day_flights: 100, night_flights: 50, effective: 45 },
    { category: 'FPV', bbak_title: '3 ББАК', position: 'ЗЕФІР', team: 'IN62', flights: 10, day_flights: 0, night_flights: 10, effective: 0 },
    { category: 'Бомбери', bbak_title: '', position: null, team: 'IN1', flights: 500, day_flights: 200, night_flights: 300, effective: 100 },
  ]
  const [bombers, fpv] = groupPositions(rows)
  assert.equal(bombers.category, 'Бомбери')
  assert.equal(bombers.positions[0].position, 'Без позиції')
  assert.equal(fpv.flights, 210)
  // The same name under another ББАК is a separate position.
  assert.deepEqual(fpv.positions.map(item => [item.bbak, item.position, item.flights, item.day, item.night, item.crews.length]), [['1 ББАК', 'ЗЕФІР', 200, 140, 60, 2], ['3 ББАК', 'ЗЕФІР', 10, 0, 10, 1]])
  assert.equal(efficiencyOf(fpv.positions[0]), 25)
  assert.equal(sortValue(fpv.positions[1], 'night_share'), 1)
})

test('without "effective" the efficiency is weighted by flights', () => {
  const [department] = groupPositions([
    { category: 'A', position: 'X', team: '1', flights: 100, day_flights: 100, night_flights: 0, efficiency: 50 },
    { category: 'A', position: 'X', team: '2', flights: 300, day_flights: 0, night_flights: 300, efficiency: 10 },
  ])
  assert.equal(efficiencyOf(department), 20)
  assert.equal(efficiencyOf(groupPositions([{ category: 'A', flights: 3 }])[0]), null)
})
