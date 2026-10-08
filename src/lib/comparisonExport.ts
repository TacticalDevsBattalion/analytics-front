import type { Workbook, Worksheet } from 'exceljs'
import { reportMetricTitle, reportStatusLabel, type ComparisonReport, type ReportRow } from './comparisonReport'

export type ComparisonExportFormat = 'csv' | 'xml' | 'xlsx'
export const COMPARISON_CSV_COLUMNS = [
  'record_type', 'report_title', 'created_at', 'source', 'source_label', 'mode', 'dimension', 'granularity', 'configuration_revision', 'kpi_fingerprint',
  'selection_id', 'selection_label', 'group_id', 'period_id', 'date_from', 'time_from', 'date_to', 'time_to', 'is_partial', 'is_current', 'is_future',
  'filters_display', 'filters_json', 'reference_selection_id', 'reference_selection_label', 'reference_period',
  'metric_key', 'metric_variant', 'metric_label', 'metric_context', 'unit', 'scope', 'depth', 'category', 'purpose', 'path_keys_json', 'path_labels_json',
  'value', 'value_status', 'reference_value', 'reference_status', 'absolute_difference', 'difference_unit', 'relative_change_percent', 'difference_status',
  'numerator', 'denominator', 'kpi_rules_available', 'reference_explanation',
  'rule_purpose', 'rule_success_mode', 'rule_successful_results_json', 'rule_usefulness_percent', 'rule_coefficient',
  'kpi_formula', 'kpi_default_rule',
] as const

const csvLabels: Record<typeof COMPARISON_CSV_COLUMNS[number], [string, string]> = {
  record_type: ['Тип рядка', 'Record type'], report_title: ['Назва звіту', 'Report title'], created_at: ['Створено, UTC', 'Created, UTC'],
  source: ['Код джерела', 'Source code'], source_label: ['Джерело даних', 'Data source'], mode: ['Режим порівняння', 'Comparison mode'], dimension: ['Групування', 'Dimension'], granularity: ['Крок періоду', 'Period granularity'],
  configuration_revision: ['Версія розрахунку', 'Calculation revision'], kpi_fingerprint: ['Відбиток правил KPI', 'KPI fingerprint'],
  selection_id: ['ID вибірки', 'Selection ID'], selection_label: ['Вибірка', 'Selection'], group_id: ['ID підрозділу', 'Group ID'], period_id: ['ID періоду', 'Period ID'],
  date_from: ['Дата початку', 'Start date'], time_from: ['Час початку', 'Start time'], date_to: ['Дата кінця', 'End date'], time_to: ['Час кінця', 'End time'],
  is_partial: ['Частковий період', 'Partial period'], is_current: ['Поточний період', 'Current period'], is_future: ['Майбутній період', 'Future period'],
  filters_display: ['Застосовані фільтри', 'Applied filters'], filters_json: ['Сирі фільтри JSON', 'Raw filters JSON'], reference_selection_id: ['ID базової вибірки', 'Reference selection ID'], reference_selection_label: ['Базова вибірка', 'Reference selection'], reference_period: ['Базовий період', 'Reference period'],
  metric_key: ['Ключ показника', 'Metric key'], metric_variant: ['Варіант показника', 'Metric variant'], metric_label: ['Показник', 'Metric'], metric_context: ['Контекст показника', 'Metric context'],
  unit: ['Одиниця', 'Unit'], scope: ['Рівень розрізу', 'Breakdown scope'], depth: ['Глибина розрізу', 'Breakdown depth'], category: ['Кафедра', 'Device type'], purpose: ['Мета / шлях', 'Purpose / path'], path_keys_json: ['Ключі шляху JSON', 'Path keys JSON'], path_labels_json: ['Підписи шляху JSON', 'Path labels JSON'],
  value: ['Значення', 'Value'], value_status: ['Стан даних', 'Value status'], reference_value: ['Базове значення', 'Reference value'], reference_status: ['Стан базових даних', 'Reference value status'],
  absolute_difference: ['Абсолютна різниця', 'Absolute difference'], difference_unit: ['Одиниця різниці', 'Difference unit'], relative_change_percent: ['Відносна зміна, %', 'Relative change, %'], difference_status: ['Стан різниці', 'Difference status'],
  numerator: ['Корисні бали / чисельник', 'Useful points / numerator'], denominator: ['Зважені вильоти / знаменник', 'Weighted flights / denominator'],
  kpi_rules_available: ['Знімок правил KPI доступний', 'Applied KPI rules available'], reference_explanation: ['Правило бази порівняння', 'Reference explanation'],
  rule_purpose: ['Окрема мета правила KPI', 'Individual rule purpose'], rule_success_mode: ['Критерій успіху правила', 'Rule success criterion'], rule_successful_results_json: ['Успішні головні результати JSON', 'Successful main results JSON'], rule_usefulness_percent: ['Корисна дія правила, %', 'Rule usefulness, %'], rule_coefficient: ['Коефіцієнт правила', 'Rule coefficient'],
  kpi_formula: ['Формула зваженого KPI', 'Weighted KPI formula'], kpi_default_rule: ['Типове правило KPI', 'Default KPI rule'],
}

export function comparisonCsvHeaders(language: 'uk' | 'en' = 'uk'): string[] {
  return COMPARISON_CSV_COLUMNS.map(key => `${csvLabels[key][language === 'uk' ? 0 : 1]} (${key})`)
}

function csvCell(value: string | number | boolean | null | undefined) {
  let text = value == null ? '' : String(value)
  if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export function comparisonReportCsv(report: ComparisonReport): string {
  const rows = report.rows.map(row => {
    const selection = report.selections.find(item => item.id === row.selectionId)!
    return [
      'metric', report.title, report.createdAt, report.source, report.sourceLabel, report.mode, report.dimension, report.granularity, report.configurationRevision, report.fingerprint,
      selection.id, selection.label, selection.groupId, selection.periodId, selection.dateFrom, selection.timeFrom, selection.dateTo, selection.timeTo, selection.isPartial, selection.isCurrent, selection.isFuture,
      selection.filters.map(filter => `${filter.label}: ${filter.labels.join('; ')}`).join(' | '), JSON.stringify(selection.rawFilters), selection.referenceId, selection.referenceLabel, selection.referencePeriod,
      row.metricKey, row.metricId, row.metricLabel, row.metricContext, row.unit, row.scope, row.depth, row.category, row.purpose, JSON.stringify(row.pathKeys), JSON.stringify(row.pathLabels),
      row.value, row.valueStatus, row.referenceValue, row.referenceValueStatus, row.absoluteDifference, row.differenceUnit, row.relativeDifference, row.differenceStatus,
      row.numerator, row.denominator, report.kpiRules != null, report.referenceExplanation, '', '', '', null, null, '', '',
    ]
  })
  // Independent rule records retain the raw-purpose criteria without assigning
  // one individual rule to a canonical group containing several raw purposes.
  const ruleRecords: Array<Record<string, string | number | boolean | null>> = (report.kpiRules || []).map(rule => ({
    record_type: 'kpi_rule', rule_purpose: rule.purpose, rule_success_mode: rule.success_mode,
    rule_successful_results_json: JSON.stringify(rule.successful_results), rule_usefulness_percent: rule.usefulness_percent, rule_coefficient: rule.coefficient,
  }))
  ruleRecords.unshift({ record_type: 'kpi_context', kpi_formula: report.kpiFormula, kpi_default_rule: report.kpiDefaultRule })
  for (const rule of ruleRecords) {
    const record = { report_title: report.title, created_at: report.createdAt, source: report.source, source_label: report.sourceLabel, mode: report.mode, dimension: report.dimension, granularity: report.granularity, configuration_revision: report.configurationRevision, kpi_fingerprint: report.fingerprint, kpi_rules_available: report.kpiRules != null, reference_explanation: report.referenceExplanation, ...rule } as Record<string, string | number | boolean | null>
    rows.push(COMPARISON_CSV_COLUMNS.map(key => record[key] ?? null))
  }
  return '\uFEFF' + [comparisonCsvHeaders(report.language), ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

function xmlText(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}
function xmlElement(name: string, value: unknown, attributes: Record<string, unknown> = {}): string {
  const attrs = Object.entries(attributes).map(([key, item]) => ` ${key}="${xmlText(item)}"`).join('')
  return value == null ? `<${name}${attrs}/>` : `<${name}${attrs}>${xmlText(value)}</${name}>`
}
function xmlValue(row: ReportRow): string {
  return xmlElement('value', row.value, { status: row.valueStatus, unit: row.unit }) +
    xmlElement('reference-value', row.referenceValue, { selection: row.referenceId, status: row.referenceValueStatus }) +
    `<differences status="${row.differenceStatus}">${xmlElement('absolute', row.absoluteDifference, { unit: row.differenceUnit })}${xmlElement('relative', row.relativeDifference, { unit: '%' })}</differences>` +
    `<weights>${xmlElement('numerator', row.numerator)}${xmlElement('denominator', row.denominator)}</weights>`
}

export function comparisonReportXml(report: ComparisonReport): string {
  const metadata = Object.entries({ title: report.title, created: report.createdAt, source: report.source, 'source-label': report.sourceLabel, mode: report.mode, dimension: report.dimension, granularity: report.granularity, 'configuration-revision': report.configurationRevision, 'kpi-fingerprint': report.fingerprint, 'kpi-formula': report.kpiFormula, 'kpi-default-rule': report.kpiDefaultRule, 'reference-explanation': report.referenceExplanation }).map(([key, value]) => xmlElement(key, value)).join('')
  const rules = (report.kpiRules || []).map(rule => `<rule purpose="${xmlText(rule.purpose)}" success-mode="${rule.success_mode}" usefulness-percent="${rule.usefulness_percent}" coefficient="${rule.coefficient}"><successful-results>${rule.successful_results.map(value => xmlElement('result', value)).join('')}</successful-results></rule>`).join('')
  const periods = report.periods.map(period => `<period id="${xmlText(period.id)}" partial="${period.is_partial}" current="${!!period.is_current}" future="${!!period.is_future}">${xmlElement('label', period.label)}${xmlElement('date-from', period.date_from)}${xmlElement('time-from', period.time_from)}${xmlElement('date-to', period.date_to)}${xmlElement('time-to', period.time_to)}</period>`).join('')
  const selections = report.selections.map(selection => {
    const selectedRows = report.rows.filter(row => row.selectionId === selection.id)
    const metrics = report.metrics.map(metric => {
      const primary = selectedRows.find(row => row.metricId === metric.id && row.depth === 0)!
      const descendants = selectedRows.filter(row => row.metricId === metric.id && row.depth > 0)
      const tree = (parent: string[]): string => descendants.filter(row => row.pathKeys.length === parent.length + 1 && row.pathKeys.slice(0, -1).every((key, index) => key === parent[index])).map(row => `<item key="${xmlText(row.pathKeys.at(-1))}" scope="${row.scope}" depth="${row.depth}" label="${xmlText(row.pathLabels.at(-1))}" raw-label="${xmlText(row.rawPathLabels.at(-1))}">${xmlValue(row)}${tree(row.pathKeys)}</item>`).join('')
      return `<metric key="${xmlText(metric.key)}" variant="${xmlText(metric.id)}" label="${xmlText(metric.label)}" context="${xmlText(metric.context)}" secondary="${metric.secondary}">${xmlValue(primary)}<breakdowns>${tree([])}</breakdowns></metric>`
    }).join('')
    const filters = selection.filters.map(filter => `<filter key="${xmlText(filter.key)}" label="${xmlText(filter.label)}">${filter.rawValues.map((value, index) => xmlElement('value', filter.labels[index], { raw: value })).join('')}</filter>`).join('')
    return `<selection id="${xmlText(selection.id)}" group-id="${xmlText(selection.groupId)}" period-id="${xmlText(selection.periodId)}" reference-id="${xmlText(selection.referenceId)}" partial="${selection.isPartial}" current="${selection.isCurrent}" future="${selection.isFuture}">${xmlElement('label', selection.label)}${xmlElement('raw-label', selection.rawLabel)}${xmlElement('date-from', selection.dateFrom)}${xmlElement('time-from', selection.timeFrom || null)}${xmlElement('date-to', selection.dateTo)}${xmlElement('time-to', selection.timeTo || null)}<filters>${filters}</filters>${xmlElement('raw-filters-json', JSON.stringify(selection.rawFilters))}<metrics>${metrics}</metrics></selection>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<comparison-report version="1" language="${report.language}"><metadata>${metadata}<notes>${report.notes.map(value => xmlElement('note', value)).join('')}</notes></metadata><kpi-rules available="${report.kpiRules != null}">${rules}</kpi-rules><periods>${periods}</periods><selections>${selections}</selections></comparison-report>\n`
}

const palette = { navy: 'FF17324D', blue: 'FF215B85', light: 'FFEAF1F7', alternate: 'FFF5F8FA', white: 'FFFFFFFF', gray: 'FF607285', green: 'FF16724A', red: 'FFB64646' }
const percentageFormat = '0.0%;[Red]-0.0%'
const pointsFormat = '0.0" в.п.";[Red]-0.0" в.п."'
function quantityFormat(value: number | null | undefined): string {
  return value != null && Number.isInteger(value) ? '#,##0;[Red]-#,##0' : '#,##0.00;[Red]-#,##0.00'
}
const preciseFormat = '#,##0.0000;[Red]-#,##0.0000'

function sheetBase(workbook: Workbook, name: string, frozenRows = 1, frozenColumns = 0): Worksheet {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', xSplit: frozenColumns, ySplit: frozenRows, showGridLines: false }],
    properties: { defaultRowHeight: 20, tabColor: { argb: palette.blue } },
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  sheet.headerFooter.oddFooter = '&LAnalytics&C&P / &N'
  sheet.properties.outlineProperties = { summaryBelow: false, summaryRight: false }
  return sheet
}

function header(sheet: Worksheet, rowNumber: number, values: string[]) {
  const row = sheet.getRow(rowNumber)
  row.values = values
  row.height = 34
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.navy } }
    cell.font = { name: 'Calibri', bold: true, color: { argb: palette.white }, size: 10 }
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
}

function title(sheet: Worksheet, text: string, lastColumn: number) {
  sheet.mergeCells(1, 1, 1, Math.max(lastColumn, 2))
  const cell = sheet.getCell(1, 1)
  cell.value = text
  cell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: palette.navy } }
  cell.alignment = { vertical: 'middle' }
  sheet.getRow(1).height = 34
}

function styleData(sheet: Worksheet, fromRow: number, lastColumn: number) {
  for (let rowNumber = fromRow; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    for (let column = 1; column <= lastColumn; column++) {
      const cell = row.getCell(column)
      if (cell.font?.bold) continue
      cell.font = { name: 'Calibri', size: 10, color: { argb: palette.navy } }
      cell.alignment = { vertical: 'top', wrapText: true }
      if ((rowNumber - fromRow) % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.alternate } }
      if (!sheet.getColumn(column).hidden && typeof cell.value === 'string') {
        const characters = Math.max(8, (sheet.getColumn(column).width || 12) * 1.1)
        const lines = cell.value.split('\n').reduce((count, text) => count + Math.max(1, Math.ceil(text.length / characters)), 0)
        row.height = Math.min(409, Math.max(row.height || 20, lines * 14 + 8))
      }
    }
  }
}

function dateOnly(value: string): Date | string { const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(date.getTime()) ? date : value }
function percentageValue(value: number | null, unit: string): number | null { return value != null && unit === '%' ? value / 100 : value }

export async function comparisonReportXlsx(report: ComparisonReport): Promise<Uint8Array> {
  // ExcelJS's browser bundle is loaded only when a user requests this format.
  const module = await import('exceljs')
  const WorkbookClass = module.Workbook || module.default.Workbook
  const workbook = new WorkbookClass()
  workbook.creator = 'Analytics'
  workbook.title = report.title
  workbook.subject = 'Comparison of complete source metrics and their breakdowns'
  workbook.created = new Date(report.createdAt)
  workbook.modified = new Date(report.createdAt)
  workbook.company = report.sourceLabel
  const tr = (uk: string, en: string) => report.language === 'uk' ? uk : en

  const summary = sheetBase(workbook, 'Зведення', 8, 2)
  const summaryColumns = 2 + report.selections.length
  title(summary, report.title, summaryColumns)
  summary.mergeCells(2, 1, 2, summaryColumns)
  const modeLabels = { periods: tr('Порівняння періодів', 'Period comparison'), units: tr('Порівняння підрозділів', 'Unit comparison'), units_over_time: tr('Підрозділи за періодами', 'Units over time') }
  const granularityLabels: Record<string, string> = { day: tr('Дні', 'Days'), week: tr('Тижні', 'Weeks'), month: tr('Місяці', 'Months'), quarter: tr('Квартали', 'Quarters') }
  summary.getCell(2, 1).value = `${report.sourceLabel} · ${report.createdAt} · ${modeLabels[report.mode]}${report.granularity ? ` · ${granularityLabels[report.granularity] || report.granularity}` : ''}`
  summary.mergeCells(3, 1, 3, summaryColumns)
  summary.getCell(3, 1).value = report.referenceExplanation
  summary.mergeCells(4, 1, 4, summaryColumns)
  summary.getCell(4, 1).value = `${report.notes[1]} ${report.notes[3]} ${report.notes[5]}`
  summary.getColumn(1).width = 36; summary.getColumn(2).width = 20
  const summaryHeaders = [tr('Показник', 'Metric'), tr('Одиниця', 'Unit')]
  for (const [index, selection] of report.selections.entries()) {
    const start = 3 + index
    summary.getCell(5, start).value = selection.label
    summary.getCell(5, start).font = { bold: true, color: { argb: palette.white } }
    summary.getCell(5, start).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.blue } }
    const flags = [selection.isPartial ? tr('Неповний', 'Partial') : '', selection.isCurrent ? tr('Поточний', 'Current') : '', selection.isFuture ? tr('Майбутній', 'Future') : ''].filter(Boolean)
    summary.getCell(6, start).value = selection.periodLabel + (flags.length ? `\n${flags.join(' · ')}` : '')
    summary.getCell(7, start).value = selection.referenceId ? `${tr('База', 'Reference')}: ${selection.referenceLabel} · ${selection.referencePeriod}` : tr('Немає попередньої бази', 'No preceding reference')
    summary.getColumn(start).width = 23
    summaryHeaders.push(selection.label)
  }
  summary.getRow(5).height = Math.max(30, ...report.selections.map(selection => Math.ceil(selection.label.length / 25) * 14 + 8))
  summary.getRow(5).alignment = { wrapText: true, vertical: 'middle' }
  for (const rowNumber of [2, 3, 4, 6, 7]) {
    summary.getRow(rowNumber).height = rowNumber === 7 ? 68 : rowNumber === 6 ? 64 : rowNumber === 4 ? 42 : 24
    summary.getRow(rowNumber).alignment = { wrapText: true, vertical: 'top' }
  }
  summary.getRow(6).height = Math.max(64, ...report.selections.map((_, index) => String(summary.getCell(6, 3 + index).value).split('\n').reduce((lines, text) => lines + Math.ceil(text.length / 25), 0) * 14 + 8))
  header(summary, 8, summaryHeaders)
  const addMatrix = (kind: 'value' | 'absolute' | 'relative') => {
    for (const definition of report.metrics) {
      const unit = kind === 'relative' ? '%' : kind === 'absolute' && definition.unit === '%' ? tr('в.п.', 'pp') : definition.unit
      const reportRows = report.selections.map(selection => report.rows.find(row => row.selectionId === selection.id && row.metricId === definition.id && row.depth === 0)!)
      const values = reportRows.map(item => kind === 'relative' ? item.relativeDifference == null ? null : item.relativeDifference / 100 : kind === 'absolute' ? item.absoluteDifference : percentageValue(item.value, item.unit))
      const row = summary.addRow([reportMetricTitle(definition), unit, ...values])
      row.height = 36
      for (const [index, item] of reportRows.entries()) row.getCell(3 + index).numFmt = kind === 'relative' || kind === 'value' && item.unit === '%' ? percentageFormat : kind === 'absolute' && item.unit === '%' ? pointsFormat : quantityFormat(kind === 'absolute' ? item.absoluteDifference : item.value)
    }
  }
  addMatrix('value')
  const mainEnd = summary.rowCount
  for (const [kind, heading] of [['absolute', tr('Абсолютна різниця проти бази', 'Absolute difference from reference')], ['relative', tr('Відносна зміна проти бази, %', 'Relative change from reference, %')]] as const) {
    summary.addRow([])
    const headingRow = summary.addRow([heading]).number
    summary.mergeCells(headingRow, 1, headingRow, summaryColumns)
    summary.getCell(headingRow, 1).font = { bold: true, size: 13, color: { argb: palette.navy } }
    header(summary, summary.addRow([]).number, summaryHeaders)
    addMatrix(kind)
  }
  styleData(summary, 9, summaryColumns)
  // Keep the filter on the value matrix so headings and change matrices remain visible.
  summary.autoFilter = { from: { row: 8, column: 1 }, to: { row: mainEnd, column: summaryColumns } }
  summary.pageSetup.printTitlesRow = '1:8'
  if (report.selections.length > 8) summary.pageSetup.fitToWidth = 0

  const detail = sheetBase(workbook, 'Деталізація', 3, 2)
  const detailHeaders = [tr('Вибірка', 'Selection'), tr('Період', 'Period'), tr('Показник', 'Metric'), tr('Контекст', 'Context'), tr('Рівень', 'Level'), tr('Кафедра', 'Device type'), tr('Мета / шлях', 'Purpose / path'), tr('Значення', 'Value'), tr('Одиниця', 'Unit'), tr('Стан даних', 'Value status'), tr('Базова вибірка', 'Reference selection'), tr('Базовий період', 'Reference period'), tr('Базове значення', 'Reference value'), tr('Абсолютна Δ', 'Absolute Δ'), tr('Одиниця Δ', 'Δ unit'), tr('Відносна Δ, %', 'Relative Δ, %'), tr('Стан різниці', 'Difference status'), tr('Корисні бали / чисельник', 'Useful points / numerator'), tr('Зважені вильоти / знаменник', 'Weighted flights / denominator'), 'selection_id', 'period_id', 'reference_id', 'metric_key', 'metric_variant', 'path_keys_json', 'raw_path_labels_json']
  title(detail, tr('Усі показники та вкладені розрізи', 'All metrics and nested breakdowns'), detailHeaders.length)
  detail.mergeCells(2, 1, 2, detailHeaders.length); detail.getCell(2, 1).value = report.notes[2]
  header(detail, 3, detailHeaders)
  for (const item of report.rows) {
    const selection = report.selections.find(selection => selection.id === item.selectionId)!
    const row = detail.addRow([selection.label, selection.periodLabel, item.metricLabel, item.metricContext, item.scope, item.category, item.purpose, percentageValue(item.value, item.unit), item.unit, reportStatusLabel(item.valueStatus, report.language), selection.referenceLabel, selection.referencePeriod, percentageValue(item.referenceValue, item.unit), item.absoluteDifference, item.differenceUnit, item.relativeDifference == null ? null : item.relativeDifference / 100, reportStatusLabel(item.differenceStatus, report.language), item.numerator, item.denominator, selection.id, selection.periodId, selection.referenceId, item.metricKey, item.metricId, JSON.stringify(item.pathKeys), JSON.stringify(item.rawPathLabels)])
    row.height = item.depth > 1 ? 34 : 30
    row.getCell(8).numFmt = item.unit === '%' ? percentageFormat : quantityFormat(item.value)
    row.getCell(13).numFmt = item.unit === '%' ? percentageFormat : quantityFormat(item.referenceValue)
    row.getCell(14).numFmt = item.unit === '%' ? pointsFormat : quantityFormat(item.absoluteDifference)
    row.getCell(16).numFmt = percentageFormat
    row.getCell(18).numFmt = preciseFormat; row.getCell(19).numFmt = preciseFormat
  }
  for (let column = 1; column <= detailHeaders.length; column++) detail.getColumn(column).width = [2, 7, 10, 12, 17, 25, 26].includes(column) ? 38 : [8, 13, 14, 16, 18, 19].includes(column) ? 18 : 25
  for (let column = 20; column <= 26; column++) detail.getColumn(column).hidden = true
  styleData(detail, 4, detailHeaders.length)
  detail.autoFilter = { from: { row: 3, column: 1 }, to: { row: detail.rowCount, column: detailHeaders.length } }
  detail.pageSetup.printTitlesRow = '1:3'

  const context = sheetBase(workbook, 'Контекст', 3, 1)
  title(context, tr('Контекст і застосовані фільтри', 'Context and applied filters'), 5)
  context.mergeCells(2, 1, 2, 5); context.getCell(2, 1).value = report.referenceExplanation
  header(context, 3, [tr('Вибірка / розділ', 'Selection / section'), tr('Поле', 'Field'), tr('Значення / підпис', 'Value / label'), tr('Сире значення / ID', 'Raw value / ID'), tr('Примітка', 'Note')])
  const addContext = (section: string, field: string, value: string | number | boolean | Date | null, raw = '', note = '') => context.addRow([section, field, value, raw, note])
  for (const [field, value] of Object.entries({ [tr('Джерело', 'Source')]: report.sourceLabel, source: report.source, [tr('Режим', 'Mode')]: report.mode, [tr('Групування', 'Dimension')]: report.dimension, [tr('Крок періоду', 'Granularity')]: report.granularity, [tr('Версія розрахунку', 'Calculation revision')]: report.configurationRevision, [tr('Відбиток правил KPI', 'KPI fingerprint')]: report.fingerprint })) addContext(tr('Звіт', 'Report'), field, value)
  const created = addContext(tr('Звіт', 'Report'), tr('Створено (UTC)', 'Created (UTC)'), new Date(report.createdAt)); created.getCell(3).numFmt = 'yyyy-mm-dd hh:mm:ss'
  for (const selection of report.selections) {
    addContext(selection.label, 'selection_id', selection.id)
    addContext(selection.label, 'group_id', selection.groupId)
    addContext(selection.label, 'period_id', selection.periodId)
    const from = addContext(selection.label, tr('Початок', 'Start'), dateOnly(selection.dateFrom), selection.dateFrom, selection.timeFrom || tr('Повна доба', 'Full day')); from.getCell(3).numFmt = 'yyyy-mm-dd'
    const to = addContext(selection.label, tr('Кінець', 'End'), dateOnly(selection.dateTo), selection.dateTo, selection.timeTo || tr('Повна доба', 'Full day')); to.getCell(3).numFmt = 'yyyy-mm-dd'
    addContext(selection.label, tr('Частковий період', 'Partial period'), selection.isPartial)
    addContext(selection.label, tr('Поточний період', 'Current period'), selection.isCurrent)
    addContext(selection.label, tr('Майбутній період', 'Future period'), selection.isFuture)
    addContext(selection.label, tr('Базова вибірка', 'Reference selection'), selection.referenceLabel, selection.referenceId, selection.referencePeriod)
    if (!selection.filters.length) addContext(selection.label, tr('Фільтри', 'Filters'), tr('Усі значення', 'All values'))
    for (const filter of selection.filters) for (const [index, value] of filter.rawValues.entries()) addContext(selection.label, filter.label, filter.labels[index], value, filter.key)
    addContext(selection.label, tr('Повний запит', 'Complete query'), JSON.stringify(selection.rawFilters))
  }
  for (const note of report.notes) addContext(tr('Примітки', 'Notes'), '', note)
  const contextWidths = [30, 30, 60, 40, 55]; contextWidths.forEach((width, index) => { context.getColumn(index + 1).width = width })
  styleData(context, 4, 5)
  for (let row = 4; row <= context.rowCount; row++) context.getRow(row).height = Math.max(context.getRow(row).height || 20, 34)
  context.autoFilter = { from: { row: 3, column: 1 }, to: { row: context.rowCount, column: 5 } }
  context.pageSetup.printTitlesRow = '1:3'

  const rules = sheetBase(workbook, 'Правила KPI', 6, 1)
  title(rules, tr('Правила, використані під час розрахунку', 'Rules used by this calculation'), 6)
  rules.mergeCells(2, 1, 2, 6); rules.getCell(2, 1).value = `${tr('Версія', 'Revision')}: ${report.configurationRevision ?? '—'} · ${report.fingerprint || '—'}`
  rules.mergeCells(3, 1, 3, 6); rules.getCell(3, 1).value = report.kpiFormula
  rules.mergeCells(4, 1, 4, 6); rules.getCell(4, 1).value = report.kpiDefaultRule
  rules.mergeCells(5, 1, 5, 6); rules.getCell(5, 1).value = report.kpiRules == null ? tr('Джерело не надало знімок правил для цього звіту. Поточні налаштування не підставляються.', 'The source did not provide the applied rule snapshot. Current settings are not substituted.') : tr('Правила наведені зі знімка відповіді, а не з поточних налаштувань. Критерій вибраних результатів застосовується до головного результату вильоту.', 'Rules come from the response snapshot, not current settings. Selected-result criteria use the main flight result.')
  for (const row of [3, 4, 5]) { rules.getRow(row).height = 42; rules.getRow(row).alignment = { wrapText: true, vertical: 'top' } }
  header(rules, 6, [tr('Мета вильоту', 'Flight purpose'), tr('Критерій успіху', 'Success criterion'), tr('Результативні результати', 'Successful results'), tr('Корисна дія, %', 'Usefulness, %'), tr('Коефіцієнт', 'Coefficient'), tr('Сире значення мети', 'Raw purpose')])
  for (const rule of report.kpiRules || []) {
    const row = rules.addRow([rule.purpose, rule.success_mode === 'source' ? tr('Із джерела', 'Source flag') : tr('Вибрані головні результати', 'Selected main results'), rule.successful_results.join('; '), rule.usefulness_percent / 100, rule.coefficient, rule.purpose])
    row.height = 32; row.getCell(4).numFmt = percentageFormat; row.getCell(5).numFmt = quantityFormat(rule.coefficient)
  }
  if (report.kpiRules?.length === 0) {
    const emptyRow = rules.addRow([tr('Окремі правила не задані — застосовано типові значення.', 'No individual rules; defaults apply.')])
    rules.mergeCells(emptyRow.number, 1, emptyRow.number, 6)
    emptyRow.height = 34
  }
  ;[35, 30, 50, 22, 20, 35].forEach((width, index) => { rules.getColumn(index + 1).width = width })
  styleData(rules, 7, 6)
  rules.autoFilter = { from: { row: 6, column: 1 }, to: { row: Math.max(rules.rowCount, 6), column: 6 } }
  rules.pageSetup.printTitlesRow = '1:6'
  const buffer = await workbook.xlsx.writeBuffer()
  return new Uint8Array(buffer)
}

export async function downloadComparisonReport(report: ComparisonReport, format: ComparisonExportFormat): Promise<void> {
  const data = format === 'xlsx' ? await comparisonReportXlsx(report) : format === 'xml' ? comparisonReportXml(report) : comparisonReportCsv(report)
  const mime = format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : format === 'xml' ? 'application/xml;charset=utf-8' : 'text/csv;charset=utf-8'
  const bytes = data instanceof Uint8Array ? new Uint8Array(data).buffer : data
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  const link = document.createElement('a')
  link.href = url; link.download = `analytics-comparison-${report.mode}-${report.createdAt.slice(0, 10)}.${format}`
  document.body.appendChild(link)
  try { link.click() } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000) }
}
