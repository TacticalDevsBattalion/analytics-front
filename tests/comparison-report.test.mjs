import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { SaxesParser } from 'saxes'

const reportSource = stripTypeScriptTypes(await readFile(new URL('../src/lib/comparisonReport.ts', import.meta.url), 'utf8'), { mode: 'strip' })
const reportUrl = `data:text/javascript;base64,${Buffer.from(reportSource).toString('base64')}`
const { buildComparisonReport } = await import(reportUrl)
const exportSource = stripTypeScriptTypes(await readFile(new URL('../src/lib/comparisonExport.ts', import.meta.url), 'utf8'), { mode: 'strip' })
  .replace("'./comparisonReport'", JSON.stringify(reportUrl))
  .replace("import('exceljs')", `import(${JSON.stringify(import.meta.resolve('exceljs'))})`)
const { comparisonReportCsv, comparisonReportXml, comparisonReportXlsx, comparisonCsvHeaders, COMPARISON_CSV_COLUMNS } = await import(`data:text/javascript;base64,${Buffer.from(exportSource).toString('base64')}`)

const config = {
  filters: { organization_dimension: 'bbak', fields: [{ key: 'organization', label: 'Підрозділ' }, { key: 'category', label: 'Кафедра' }] },
  dashboard: { metric_keys: ['flights'] },
  dictionaries: { labels: { bbak: { '1': 'Підрозділ А' }, category: { 'Коптер': 'Кафедра коптерів' }, purpose: { 'Розвідка': 'Розвідувальні' } } },
  kpi: { purpose_rules: [{ purpose: 'Сьогоднішні правила не можна підставляти', success_mode: 'source', successful_results: [], usefulness_percent: 99, coefficient: 5 }] },
}
const options = { bbak: [{ id: 1, title: 'Перша ББАК' }, { id: 2, title: 'Друга ББАК' }] }
const baseFilters = {
  date_from: '2026-09-01', date_to: '2026-09-07', time_from: '09:15:00.125', time_to: '17:30:00.500',
  direction: [], unit: [], category: [], asset: [], group: [], bbak: [], rota: [], battalion: [], purpose: [], class_name: [], result: [],
}
const appliedRules = [{ purpose: 'Розвідка', success_mode: 'results', successful_results: ['Виявлено & підтверджено'], usefulness_percent: 40, coefficient: 2 }]
function metricSet(flights, efficiency) {
  return [
    { key: 'flights', label: 'Вильоти', value: flights, breakdown: [{ key: 'device:Коптер', label: 'Коптер', value: flights, children: [{ key: 'recon', label: 'Розвідка', value: flights, children: [{ key: 'sub', label: 'Додатковий розріз', value: 0 }] }, { key: 'zero', label: 'Нульова мета', value: 0 }] }] },
    { key: 'efficiency', label: 'Ефективність', unit: '%', value: efficiency, breakdown: [{ key: 'Коптер', label: 'Коптер', value: efficiency, unit: '%' }] },
    { key: 'affected', label: 'Уражено', value: 3, primary_label: 'ОС', secondary_label: 'Загалом', secondary_value: 0, breakdown: [{ key: 'Коптер', label: 'Коптер', value: 3 }] },
    { key: 'weighted_efficiency', label: 'Зважений KPI', unit: '%', value: null, numerator: 0, denominator: 0, breakdown: [{ key: 'device:Коптер', label: 'Коптер', value: null, numerator: 0, denominator: 0, unit: '%', children: [{ key: 'recon', label: 'Розвідка', value: null, numerator: 0, denominator: 0, unit: '%' }] }] },
  ]
}
function response() {
  return {
    mode: 'units_over_time', dimension: 'bbak', granularity: 'week', baseline_id: 'p1/a', source: 'clickhouse', configuration_revision: 7, kpi_fingerprint: 'applied-fingerprint', kpi_configuration: { purpose_rules: structuredClone(appliedRules) },
    periods: [{ id: 'p1', label: 'Тиждень 1', date_from: '2026-09-01', date_to: '2026-09-07', is_partial: true }, { id: 'p2', label: 'Тиждень 2', date_from: '2026-09-08', date_to: '2026-09-14', is_partial: false, is_current: true }],
    selections: [
      { id: 'p1/a', label: 'Перша ББАК', group_id: 'bbak:1', period_id: 'p1', filters: { ...baseFilters, bbak: ['1'] }, metrics: metricSet(10, 50) },
      { id: 'p1/b', label: 'Друга ББАК', group_id: 'bbak:2', period_id: 'p1', filters: { ...baseFilters, bbak: ['2'] }, metrics: metricSet(0, 0) },
      { id: 'p2/a', label: 'Перша ББАК', group_id: 'bbak:1', period_id: 'p2', filters: { ...baseFilters, date_from: '2026-09-08', date_to: '2026-09-14', bbak: ['1'] }, metrics: metricSet(12, 60) },
      { id: 'p2/b', label: 'Друга ББАК', group_id: 'bbak:2', period_id: 'p2', filters: { ...baseFilters, date_from: '2026-09-08', date_to: '2026-09-14', bbak: ['2'] }, metrics: [metricSet(2, 0)[0]] },
    ],
  }
}
const build = (result = response()) => buildComparisonReport(result, { config, options, sourceLabel: 'ClickHouse', createdAt: '2026-10-02T12:00:00.000Z' })

function parseCsv(document) {
  const output = [], row = []
  let value = '', quoted = false
  const source = document.replace(/^\uFEFF/, '')
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { value += '"'; index++ } else quoted = !quoted
    } else if (!quoted && character === ',') { row.push(value); value = '' }
    else if (!quoted && character === '\r' && source[index + 1] === '\n') { row.push(value); output.push([...row]); row.length = 0; value = ''; index++ }
    else value += character
  }
  assert.equal(quoted, false)
  return output
}

test('report contains every metric, secondary distinction and full recursive breakdown, independent of visible cards', () => {
  const report = build()
  assert.deepEqual(report.metrics.map(item => item.id), ['flights', 'efficiency', 'affected', 'affected:secondary', 'weighted_efficiency'])
  assert.equal(report.rows.filter(row => row.depth === 0).length, 20)
  assert.ok(report.rows.some(row => row.depth === 3 && row.scope === 'breakdown' && row.value === 0))
  const primary = report.rows.find(row => row.selectionId === 'p1/a' && row.metricId === 'affected' && row.depth === 0)
  const secondary = report.rows.find(row => row.selectionId === 'p1/a' && row.metricId === 'affected:secondary')
  assert.equal(primary.metricContext, 'ОС'); assert.equal(primary.unit, 'осіб')
  assert.equal(secondary.metricContext, 'Загалом'); assert.equal(secondary.value, 0)
  assert.equal(report.rows.filter(row => row.metricId === 'affected:secondary' && row.depth > 0).length, 0)
})

test('each temporal reference is the previous period of the same stable group, never a different unit', () => {
  const report = build()
  assert.equal(report.selections.find(item => item.id === 'p1/a').referenceId, '')
  assert.equal(report.selections.find(item => item.id === 'p2/a').referenceId, 'p1/a')
  assert.equal(report.selections.find(item => item.id === 'p2/b').referenceId, 'p1/b')
  const row = report.rows.find(row => row.selectionId === 'p2/a' && row.metricId === 'efficiency' && row.depth === 0)
  assert.equal(row.absoluteDifference, 10); assert.equal(row.differenceUnit, 'в.п.'); assert.equal(row.relativeDifference, 20)
  const zeroBase = report.rows.find(row => row.selectionId === 'p2/b' && row.metricId === 'flights' && row.depth === 0)
  assert.equal(zeroBase.absoluteDifference, 2); assert.equal(zeroBase.relativeDifference, null); assert.equal(zeroBase.differenceStatus, 'zero_reference')
})

test('missing values and zero weights remain distinct from numeric zero at every breakdown depth', () => {
  const report = build()
  const missing = report.rows.find(row => row.selectionId === 'p2/b' && row.metricId === 'efficiency' && row.depth === 0)
  assert.equal(missing.value, null); assert.equal(missing.valueStatus, 'unavailable')
  const zero = report.rows.find(row => row.selectionId === 'p1/b' && row.metricId === 'flights' && row.depth === 0)
  assert.equal(zero.value, 0); assert.equal(zero.valueStatus, 'available')
  const weighted = report.rows.filter(row => row.selectionId === 'p1/a' && row.metricId === 'weighted_efficiency')
  assert.ok(weighted.every(row => row.valueStatus === 'zero_weight' && row.denominator === 0))
  const empty = response(); empty.selections[0].metrics.find(item => item.key === 'weighted_efficiency').breakdown = []
  assert.equal(build(empty).rows.find(row => row.selectionId === 'p1/a' && row.metricId === 'weighted_efficiency').valueStatus, 'zero_weight')
})

test('aliases resolve readable labels while raw IDs, exact dates and millisecond time boundaries remain intact', () => {
  const report = build(), selection = report.selections[0]
  assert.equal(selection.label, 'Підрозділ А')
  assert.deepEqual(selection.filters[0].rawValues, ['1']); assert.deepEqual(selection.filters[0].labels, ['Підрозділ А'])
  assert.equal(selection.filters[0].label, 'Підрозділ')
  assert.equal(selection.timeFrom, '09:15:00.125'); assert.equal(selection.timeTo, '17:30:00.500'); assert.equal(selection.isPartial, true)
  const purpose = report.rows.find(row => row.metricId === 'flights' && row.depth === 2)
  assert.deepEqual(purpose.pathKeys, ['device:Коптер', 'recon'])
  assert.deepEqual(purpose.pathLabels, ['Кафедра коптерів', 'Розвідувальні'])
  assert.deepEqual(purpose.rawPathLabels, ['Коптер', 'Розвідка'])
})

test('the immutable applied rule snapshot is used, with an explicit unavailable state for legacy responses', () => {
  const original = response(), report = build(original)
  original.kpi_configuration.purpose_rules[0].coefficient = 100
  assert.deepEqual(report.kpiRules, appliedRules); assert.equal(report.configurationRevision, 7); assert.equal(report.fingerprint, 'applied-fingerprint')
  const old = response(); delete old.kpi_configuration
  assert.equal(build(old).kpiRules, null)
})

test('non-temporal modes use the designated reference and retain actual zeros', () => {
  for (const mode of ['periods', 'units']) {
    const data = response(); data.mode = mode; data.baseline_id = 'p1/b'
    const report = build(data)
    assert.ok(report.selections.every(selection => selection.referenceId === 'p1/b'))
    const baseline = report.rows.find(row => row.selectionId === 'p1/b' && row.metricId === 'flights' && row.depth === 0)
    assert.equal(baseline.absoluteDifference, 0); assert.equal(baseline.differenceStatus, 'zero_reference')
  }
})

test('CSV is a single rectangular table with stable headers, numeric changes, exact context and separate rule records', () => {
  const report = build(), table = parseCsv(comparisonReportCsv(report)), [headers, ...records] = table
  assert.deepEqual(headers, comparisonCsvHeaders('uk'))
  assert.deepEqual(headers.map(header => header.match(/\((\w+)\)$/)[1]), [...COMPARISON_CSV_COLUMNS])
  assert.ok(headers.includes('Значення (value)'))
  assert.ok(comparisonCsvHeaders('en').includes('Value (value)'))
  assert.ok(records.every(row => row.length === headers.length))
  const field = key => headers.findIndex(header => header.endsWith(`(${key})`))
  const metrics = records.filter(row => row[field('record_type')] === 'metric')
  assert.equal(metrics.length, report.rows.length)
  assert.equal(records.filter(row => row[field('record_type')] === 'kpi_rule').length, 1)
  const rule = records.find(row => row[field('record_type')] === 'kpi_rule')
  assert.equal(rule[field('rule_coefficient')], '2'); assert.equal(rule[field('rule_usefulness_percent')], '40')
  const kpiContext = records.find(row => row[field('record_type')] === 'kpi_context')
  assert.equal(kpiContext[field('kpi_formula')], report.kpiFormula)
  assert.match(kpiContext[field('kpi_formula')], /100 × Σ/)
  assert.equal(kpiContext[field('kpi_default_rule')], report.kpiDefaultRule)
  assert.match(kpiContext[field('kpi_default_rule')], /корисна дія 100%, коефіцієнт 1/)
  assert.ok(metrics.every(row => row[field('kpi_formula')] === '' && row[field('kpi_default_rule')] === ''))
  const value = metrics.find(row => row[field('selection_id')] === 'p2/a' && row[field('metric_variant')] === 'efficiency' && row[field('scope')] === 'primary')
  assert.equal(value[field('value')], '60'); assert.equal(value[field('absolute_difference')], '10'); assert.equal(value[field('relative_change_percent')], '20')
  assert.equal(value[field('time_from')], '09:15:00.125'); assert.equal(JSON.parse(value[field('filters_json')]).bbak[0], '1')
})

test('CSV neutralizes formula-like text but retains negative numeric differences', () => {
  const report = build(); report.rows[0].category = '=HYPERLINK("evil")'; report.rows[0].metricLabel = '\t+SUM(A1)'; report.rows[0].absoluteDifference = -4
  const [headers, row] = parseCsv(comparisonReportCsv(report))
  const field = key => headers.findIndex(header => header.endsWith(`(${key})`))
  assert.equal(row[field('category')], "'=HYPERLINK(\"evil\")")
  assert.equal(row[field('metric_label')], "'\t+SUM(A1)")
  assert.equal(row[field('absolute_difference')], '-4')
})

test('XML is valid structured data with escaped labels, nested values, null statuses and source rule snapshot', () => {
  const report = build(); report.selections[0].label = 'A < B & "quoted"'; report.rows[0].metricLabel = 'Metric & <value>'
  const document = comparisonReportXml(report)
  const parser = new SaxesParser(), elements = []
  parser.on('opentag', tag => elements.push(tag.name)); parser.write(document).close()
  assert.equal(elements.filter(name => name === 'selection').length, 4)
  assert.equal(elements.filter(name => name === 'metric').length, 20)
  assert.ok(elements.includes('breakdowns')); assert.ok(elements.includes('item'))
  assert.match(document, /A &lt; B &amp; &quot;quoted&quot;/)
  assert.match(document, /<value status="zero_weight" unit="%"\/>/)
  assert.match(document, /usefulness-percent="40" coefficient="2"/)
  assert.match(document, /<kpi-formula>Зважений KPI = 100 × Σ/)
  assert.match(document, /<kpi-default-rule>Без окремого правила: результативність із джерела, корисна дія 100%, коефіцієнт 1/)
  assert.match(document, /raw="1"/); assert.match(document, /09:15:00.125/)
})

test('real XLSX ZIP opens with four sheets, typed zero/percentage/null cells, references, frozen headers and no untrusted formulas', async () => {
  const data = response()
  for (const selection of data.selections) selection.metrics.push({ key: 'avg_flights_per_position', label: 'Середні вильоти', value: 1.25 })
  const report = build(data); report.kpiRules[0].purpose = '=SUM(A1)'
  const bytes = await comparisonReportXlsx(report)
  assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b)
  const zip = await JSZip.loadAsync(bytes)
  assert.ok(zip.file('xl/workbook.xml')); assert.ok(zip.file('[Content_Types].xml'))
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes)
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Зведення', 'Деталізація', 'Контекст', 'Правила KPI'])
  const summary = workbook.getWorksheet('Зведення')
  assert.match(summary.getCell('C6').value, /Неповний/)
  assert.match(summary.getCell('E6').value, /Поточний/)
  assert.match(summary.getCell('A4').value, /Поточні, часткові й майбутні періоди можуть мати неповні дані/)
  assert.ok(summary.getRow(4).height >= 42); assert.ok(summary.getRow(6).height >= 64)
  assert.match(summary.getCell('A2').value, /Підрозділи за періодами · Тижні/)
  assert.doesNotMatch(summary.getCell('A2').value, /units_over_time/)
  assert.equal(summary.getCell('C9').value, 10); assert.equal(summary.getCell('D9').value, 0)
  assert.equal(summary.getCell('C9').numFmt, '#,##0;[Red]-#,##0')
  assert.equal(summary.getCell('C10').value, .5); assert.match(summary.getCell('C10').numFmt, /%/)
  assert.equal(summary.getCell('F10').value, null)
  const averageRow = report.metrics.findIndex(metric => metric.key === 'avg_flights_per_position') + 9
  assert.equal(summary.getCell(averageRow, 3).value, 1.25)
  assert.equal(summary.getCell(averageRow, 3).numFmt, '#,##0.00;[Red]-#,##0.00')
  assert.equal(summary.views[0].ySplit, 8); assert.ok(summary.autoFilter)
  const details = workbook.getWorksheet('Деталізація')
  assert.equal(details.rowCount, report.rows.length + 3)
  assert.equal(details.views[0].xSplit, 2)
  assert.ok(Array.from({ length: 7 }, (_, index) => details.getColumn(20 + index).hidden).every(Boolean))
  const percentageRow = report.rows.findIndex(row => row.selectionId === 'p2/a' && row.metricId === 'efficiency' && row.depth === 0) + 4
  assert.equal(details.getCell(percentageRow, 8).value, .6)
  assert.equal(details.getCell(percentageRow, 14).value, 10)
  assert.equal(details.getCell(percentageRow, 16).value, .2)
  assert.match(details.getCell(percentageRow, 14).numFmt, /в\.п\./)
  const rules = workbook.getWorksheet('Правила KPI')
  assert.equal(rules.getCell('A7').value, '=SUM(A1)'); assert.equal(rules.getCell('D7').value, .4); assert.equal(rules.getCell('E7').value, 2)
  assert.equal(rules.getCell('E7').numFmt, '#,##0;[Red]-#,##0')
  let formulaCount = 0
  for (const sheet of workbook.worksheets) sheet.eachRow(row => row.eachCell(cell => { if (cell.formula) formulaCount++ }))
  assert.equal(formulaCount, 0)
  const contextSheet = workbook.getWorksheet('Контекст')
  assert.ok(contextSheet.getRows(4, contextSheet.rowCount - 3).some(row => row.getCell(3).value instanceof Date))
  assert.ok(contextSheet.getRows(4, contextSheet.rowCount - 3).some(row => row.getCell(5).value === '09:15:00.125'))
})
