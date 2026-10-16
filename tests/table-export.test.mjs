import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import ExcelJS from 'exceljs'

const load = async (file, replace = source => source) => import(`data:text/javascript;base64,${Buffer.from(replace(stripTypeScriptTypes(await readFile(new URL(`../src/lib/${file}`, import.meta.url), 'utf8'), { mode: 'strip' }))).toString('base64')}`)
const { tableExportCsv, tableExportJson, tableExportHtml, tableExportXlsx } = await load('tableExport.ts', source => source.replace("import('exceljs')", `import(${JSON.stringify(import.meta.resolve('exceljs'))})`))
const { analyzeMissionGroups, missionKey } = await load('areaComparison.ts')
const areaComparisonUrl = `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(await readFile(new URL('../src/lib/areaComparison.ts', import.meta.url), 'utf8'), { mode: 'strip' })).toString('base64')}`
const { areaComparisonDocument } = await load('areaExport.ts', source => source.replace("'./areaComparison'", JSON.stringify(areaComparisonUrl)))

const document = {
  title: 'Порівняння', createdAt: '2026-10-16T08:00:00.000Z', meta: [['Період', '2026-10-16 — 2026-10-16']], notes: ['Примітка'],
  tables: [{ name: 'Матриця', columns: [{ key: 'area', title: 'Область' }, { key: 'flights', title: 'Вильоти', kind: 'number' }, { key: 'efficiency', title: 'Результативність, %', kind: 'percent', decimals: 1 }], rows: [['=A1 <b>', 120, 45.5], ['Б', null, null]], highlight: [true, false] }],
}

test('csv keeps tables, escapes formulas and quotes', () => {
  const csv = tableExportCsv(document)
  assert.ok(csv.startsWith('﻿"Порівняння"'))
  assert.match(csv, /"Матриця"\r\n"Область","Вильоти","Результативність, %"\r\n"'=A1 <b>","120","45.5"\r\n"Б","",""/)
})

test('json maps rows to column keys', () => {
  const data = JSON.parse(tableExportJson(document))
  assert.equal(data.parameters['Період'], '2026-10-16 — 2026-10-16')
  assert.deepEqual(data.tables[0].rows[0], { area: '=A1 <b>', flights: 120, efficiency: 45.5 })
  assert.equal(data.tables[0].rows[1].flights, null)
})

test('html is standalone, escaped and printable', () => {
  const page = tableExportHtml(document)
  assert.match(page, /@media print/)
  assert.match(page, /=A1 &lt;b&gt;/)
  assert.match(page, /<tr class="hl">/)
  assert.match(page, /45,5%/)
})

test('xlsx has a parameters sheet and typed cells', async () => {
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await tableExportXlsx(document))
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Параметри', 'Матриця'])
  const sheet = workbook.getWorksheet('Матриця')
  assert.equal(sheet.getCell('B2').value, 120)
  assert.equal(sheet.getCell('C2').value, 0.455)
  assert.equal(sheet.getCell('C2').numFmt, '0.0%')
})

test('area document keeps separate ratings and per-mission statistics', () => {
  const metrics = [
    { key: 'flights', title: 'Вильоти', percent: false, rate: false, direction: 'HIGHER_IS_BETTER' },
    { key: 'efficiency', title: 'Результативність', percent: true, rate: true, direction: 'HIGHER_IS_BETTER' },
  ]
  const purposes = [
    { id: 'a', category: 'FPV', purpose: 'Ураження', values: { flights: 60, efficiency: 50 } }, { id: 'a', category: 'FPV', purpose: 'Мінування', values: { flights: 40, efficiency: 80 } },
    { id: 'b', category: 'FPV', purpose: 'Ураження', values: { flights: 50, efficiency: 30 } }, { id: 'b', category: 'FPV', purpose: 'Мінування', values: { flights: 40, efficiency: 50 } },
    { id: 'c', category: 'FPV', purpose: 'Ураження', values: { flights: 80, efficiency: 45 } },
  ]
  const totals = [{ id: 'a', category: 'FPV', values: { flights: 100, efficiency: 62 } }, { id: 'b', category: 'FPV', values: { flights: 90, efficiency: 38.9 } }, { id: 'c', category: 'FPV', values: { flights: 80, efficiency: 45 } }]
  const { departments, missions } = analyzeMissionGroups(totals, purposes, metrics)
  const groups = departments[0].groups.map(group => ({ department: 'FPV', purpose: group.purpose === null ? 'Багатозадачні' : `Лише: ${group.purpose}`, areas: group.areas, rated: group.rated >= 2, missions: id => missions.get(missionKey('FPV', id)) ?? [] }))
  const result = areaComparisonDocument({ title: 'T', meta: [], groups, metrics, label: id => id.toUpperCase(), highlighted: id => id === 'b', tr: uk => uk })
  assert.deepEqual(result.tables.map(table => table.name), ['Рейтинг', 'Матриця', 'За місіями', 'Показники'])
  const [rating, matrix, byMission] = result.tables
  // department, rating, rank, rated, area, missions
  assert.deepEqual(rating.rows.map(row => row.slice(0, 6)), [['FPV', 'Багатозадачні', 1, 2, 'A', 'Ураження 60%, Мінування 40%'], ['FPV', 'Багатозадачні', 2, 2, 'B', 'Ураження 56%, Мінування 44%'], ['FPV', 'Лише: Ураження', null, 0, 'C', 'Ураження 100%']])
  assert.deepEqual(rating.rows.map(row => row[6]), ['★★★★★', '★★☆☆☆', null])
  assert.match(rating.rows[0][11], /Результативність: \+11\.5 в\.п\./)
  assert.deepEqual(matrix.rows[0].slice(4), ['A', 'Ураження 60%, Мінування 40%', 100, 62])
  assert.deepEqual(byMission.rows[0], ['FPV', 'A', 'Ураження', 'Ураження', 60, true, 60, 50])
  assert.deepEqual(rating.highlight, [false, true, false])
})
