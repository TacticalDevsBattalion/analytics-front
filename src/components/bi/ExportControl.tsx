import { useState } from 'react'
import { Download } from 'lucide-react'
import { useLanguage } from '../../i18n/LanguageContext'
import { downloadTableExport, type ExportDocument, type TableExportFormat } from '../../lib/tableExport'

type Props = { document: () => ExportDocument | null; fileName: string; disabled?: boolean }

// Format choice + download button for a table-based export.
export function ExportControl({ document, fileName, disabled }: Props) {
  const { tr } = useLanguage()
  const [format, setFormat] = useState<TableExportFormat>('xlsx')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run() {
    const content = document()
    if (!content) return
    setBusy(true); setError('')
    try { await downloadTableExport(content, format, fileName) }
    catch (reason) { setError(`${tr('Не вдалося створити файл', 'The file could not be created')}${reason instanceof Error ? `: ${reason.message}` : ''}`) }
    finally { setBusy(false) }
  }
  return <div className="bi-export">
    <select aria-label={tr('Формат файлу', 'File format')} value={format} disabled={busy || disabled} onChange={event => { setFormat(event.target.value as TableExportFormat); setError('') }}>
      <option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV</option><option value="html">{tr('HTML (друк / PDF)', 'HTML (print / PDF)')}</option><option value="json">JSON</option>
    </select>
    <button type="button" className="secondary" disabled={busy || disabled} onClick={() => void run()}><Download size={14} /> {busy ? tr('Створення…', 'Creating…') : tr('Завантажити', 'Download')}</button>
    {error && <span className="bi-export-error" role="alert">{error}</span>}
  </div>
}
