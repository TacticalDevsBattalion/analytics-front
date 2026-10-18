import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = await readFile(new URL('../src/lib/lostDevices.ts', import.meta.url), 'utf8')
const { summarizeLosses } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: 'strip' })).toString('base64')}`)

test('losses are counted per device with their results', () => {
  const rows = [
    { category: 'FPV ППО', asset: 'Interceptor', result: 'Впав' },
    { category: 'FPV ППО', asset: 'Interceptor', result: 'Технічні несправності' },
    { category: 'FPV ППО', asset: 'Interceptor', result: 'Впав' },
    { category: 'FPV ППО', asset: 'Sting', result: 'Впав' },
    { category: 'Бомбери', asset: '—', result: 'Втрата борту' },
    { category: 'Бомбери', asset: 'Vampire', result: 'Втрата борту' },
    { category: 'Бомбери', asset: 'Vampire', result: 'Втрата борту' },
  ]
  const [bombers, interceptors] = summarizeLosses(rows, ['Бомбери', 'FPV ППО'])
  assert.equal(bombers.department, 'Бомбери')
  assert.equal(bombers.lost, 3)
  assert.deepEqual(bombers.assets.map(item => [item.asset, item.lost]), [['Vampire', 2], ['Засіб не вказано', 1]])
  assert.deepEqual(interceptors.results, [['Впав', 3], ['Технічні несправності', 1]])
  assert.deepEqual(interceptors.assets[0], { asset: 'Interceptor', lost: 3, spent: 0, results: [['Впав', 2], ['Технічні несправності', 1]], positions: [['Позицію не вказано', 3]] })
})

test('spent single-use drones are counted apart from losses', () => {
  const [fpv] = summarizeLosses([
    { category: 'FPV', asset: 'A', result: 'Уражено', spent: true },
    { category: 'FPV', asset: 'A', result: 'Знищено', spent: true },
    { category: 'FPV', asset: 'A', result: 'Впав' },
    { category: 'FPV', asset: 'B', result: 'Знищено', spent: true },
  ])
  assert.deepEqual([fpv.lost, fpv.spent], [1, 3])
  assert.deepEqual(fpv.results, [['Впав', 1]])
  assert.deepEqual(fpv.assets.map(item => [item.asset, item.lost, item.spent]), [['A', 1, 2], ['B', 0, 1]])
})

test('losses of reusable drones are counted per position', () => {
  const [bombers] = summarizeLosses([
    { category: 'Бомбери', asset: 'Vampire', result: 'Втрата борту', group: 'ДЖАНКОЙ' },
    { category: 'Бомбери', asset: 'Vampire', result: 'Втрата борту', group: 'ДЖАНКОЙ' },
    { category: 'Бомбери', asset: 'Vampire', result: 'Втрата борту', group: 'ІО' },
    { category: 'Бомбери', asset: 'Heavy', result: 'Втрата борту', group: '—' },
  ])
  assert.deepEqual(bombers.positions, [['ДЖАНКОЙ', 2], ['ІО', 1], ['Позицію не вказано', 1]])
  assert.deepEqual(bombers.assets[0].positions, [['ДЖАНКОЙ', 2], ['ІО', 1]])
})
