// Generic export of one or more tables to files a user can open elsewhere:
// Excel, CSV, JSON and a standalone HTML page (printable to PDF).

export type TableExportFormat = 'xlsx' | 'csv' | 'json' | 'html'
export type ExportCell = string | number | boolean | null
// Percent values are stored as shown in the UI (45.3 means 45.3%).
export type ExportColumn = { key: string; title: string; kind?: 'text' | 'number' | 'percent'; decimals?: number }
export type ExportTable = { name: string; title?: string; columns: ExportColumn[]; rows: ExportCell[][]; highlight?: boolean[] }
export type ExportDocument = {
  title: string
  createdAt: string
  // Parameters of the export: period, level, filters…
  meta: Array<[string, string]>
  notes?: string[]
  tables: ExportTable[]
}

const MIME: Record<TableExportFormat | 'xml', string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8', json: 'application/json;charset=utf-8', html: 'text/html;charset=utf-8', xml: 'application/xml;charset=utf-8',
}

function csvCell(value: ExportCell | undefined) {
  let text = value == null ? '' : String(value)
  // Prevent spreadsheet formula injection from labels.
  if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

// Tables follow each other, separated by an empty line and the table name.
export function tableExportCsv(document: ExportDocument): string {
  const lines: ExportCell[][] = [[document.title], ...document.meta.map(([key, value]) => [key, value])]
  for (const table of document.tables) lines.push([], [table.title ?? table.name], table.columns.map(column => column.title), ...table.rows)
  return '﻿' + lines.map(line => line.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export function tableExportJson(document: ExportDocument): string {
  return JSON.stringify({
    title: document.title, created_at: document.createdAt,
    parameters: Object.fromEntries(document.meta), notes: document.notes ?? [],
    tables: document.tables.map(table => ({
      name: table.name, title: table.title ?? table.name,
      columns: table.columns.map(({ key, title, kind = 'text' }) => ({ key, title, kind })),
      rows: table.rows.map(row => Object.fromEntries(table.columns.map((column, index) => [column.key, row[index] ?? null]))),
    })),
  }, null, 2)
}

const html = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

function displayCell(value: ExportCell, column: ExportColumn) {
  if (value == null || value === '') return '—'
  if (typeof value === 'number') {
    const decimals = column.decimals ?? (Number.isInteger(value) ? 0 : 2)
    const text = new Intl.NumberFormat('uk-UA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
    return column.kind === 'percent' ? `${text}%` : text
  }
  if (typeof value === 'boolean') return value ? 'так' : 'ні'
  return value
}

export function tableExportHtml(document: ExportDocument): string {
  const tables = document.tables.map(table => `<section><h2>${html(table.title ?? table.name)}</h2><div class="scroll"><table><thead><tr>${table.columns.map(column => `<th>${html(column.title)}</th>`).join('')}</tr></thead><tbody>${table.rows.map((row, index) => `<tr${table.highlight?.[index] ? ' class="hl"' : ''}>${table.columns.map((column, cell) => `<td${column.kind && column.kind !== 'text' ? ' class="n"' : ''}>${html(displayCell(row[cell] ?? null, column)).replaceAll('\n', '<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`).join('')
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${html(document.title)}</title><style>
body{font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#17324d;margin:24px;background:#fff}
h1{font-size:22px;margin:0 0 12px}h2{font-size:16px;margin:28px 0 8px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:0 0 12px}dt{color:#607285}dd{margin:0}
.notes{color:#607285;font-size:13px;margin:0;padding-left:18px}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:12px}
th,td{border:1px solid #d5dee7;padding:5px 8px;text-align:left;vertical-align:top}th{background:#17324d;color:#fff;font-weight:600}
td.n{text-align:right;white-space:nowrap}tbody tr:nth-child(even){background:#f5f8fa}tr.hl td{background:#fff4d6}
@media print{body{margin:0}h2{break-after:avoid}tr{break-inside:avoid}thead{display:table-header-group}}
</style></head><body><h1>${html(document.title)}</h1><dl><dt>Створено</dt><dd>${html(new Date(document.createdAt).toLocaleString('uk-UA'))}</dd>${document.meta.map(([key, value]) => `<dt>${html(key)}</dt><dd>${html(value)}</dd>`).join('')}</dl>${document.notes?.length ? `<ul class="notes">${document.notes.map(note => `<li>${html(note)}</li>`).join('')}</ul>` : ''}${tables}</body></html>`
}

// Excel sheet names: at most 31 characters, no []:*?/\ and unique.
function sheetName(name: string, used: Set<string>) {
  const base = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Аркуш'
  let candidate = base
  for (let index = 2; used.has(candidate.toLowerCase()); index++) candidate = `${base.slice(0, 28)} ${index}`
  used.add(candidate.toLowerCase())
  return candidate
}

export async function tableExportXlsx(document: ExportDocument): Promise<Uint8Array> {
  // ExcelJS is loaded only when a user requests this format.
  const module = await import('exceljs')
  const WorkbookClass = module.Workbook || module.default.Workbook
  const workbook = new WorkbookClass()
  workbook.creator = 'Analytics'
  workbook.title = document.title
  workbook.created = new Date(document.createdAt)
  const used = new Set<string>()
  const navy = 'FF17324D'
  const parameters = workbook.addWorksheet(sheetName('Параметри', used))
  parameters.columns = [{ width: 28 }, { width: 80 }]
  parameters.addRow([document.title]).font = { bold: true, size: 16, color: { argb: navy } }
  parameters.addRow(['Створено', new Date(document.createdAt).toLocaleString('uk-UA')])
  for (const [key, value] of document.meta) parameters.addRow([key, value])
  for (const note of document.notes ?? []) parameters.addRow(['', note])
  parameters.eachRow((row, index) => { if (index > 1) { row.getCell(1).font = { color: { argb: 'FF607285' } }; row.getCell(2).alignment = { wrapText: true, vertical: 'top' } } })
  for (const table of document.tables) {
    const sheet = workbook.addWorksheet(sheetName(table.name, used), { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
    sheet.columns = table.columns.map((column, index) => {
      const longest = Math.max(column.title.length, ...table.rows.slice(0, 200).map(row => String(row[index] ?? '').split('\n').reduce((max, line) => Math.max(max, line.length), 0)))
      return { width: Math.min(60, Math.max(10, longest + 2)) }
    })
    const header = sheet.addRow(table.columns.map(column => column.title))
    header.height = 32
    header.eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }; cell.alignment = { vertical: 'middle', wrapText: true } })
    table.rows.forEach((values, rowIndex) => {
      const row = sheet.addRow(table.columns.map((column, index) => {
        const value = values[index] ?? null
        return typeof value === 'number' && column.kind === 'percent' ? value / 100 : value
      }))
      table.columns.forEach((column, index) => {
        const cell = row.getCell(index + 1)
        cell.alignment = { vertical: 'top', wrapText: column.kind == null || column.kind === 'text' }
        if (typeof cell.value === 'number') cell.numFmt = column.kind === 'percent' ? `0.${'0'.repeat(column.decimals ?? 1)}%` : column.decimals === 0 || Number.isInteger(cell.value) && column.decimals == null ? '#,##0' : `#,##0.${'0'.repeat(column.decimals ?? 2)}`
        if (table.highlight?.[rowIndex]) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4D6' } }
      })
    })
    if (table.rows.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: table.rows.length + 1, column: table.columns.length } }
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer())
}

export function downloadFile(data: string | Uint8Array, fileName: string, format: TableExportFormat | 'xml') {
  const bytes = data instanceof Uint8Array ? new Uint8Array(data).buffer : data
  const url = URL.createObjectURL(new Blob([bytes], { type: MIME[format] }))
  const link = window.document.createElement('a')
  link.href = url
  link.download = fileName
  window.document.body.appendChild(link)
  try { link.click() } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000) }
}

export const exportFileName = (base: string, createdAt: string, format: string) => `${base}-${createdAt.slice(0, 10)}.${format}`

export async function downloadTableExport(document: ExportDocument, format: TableExportFormat, base: string) {
  const data = format === 'xlsx' ? await tableExportXlsx(document) : format === 'json' ? tableExportJson(document) : format === 'html' ? tableExportHtml(document) : tableExportCsv(document)
  downloadFile(data, exportFileName(base, document.createdAt, format), format)
}
