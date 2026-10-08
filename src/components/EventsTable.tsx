import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { EventRow } from '../lib/types'
import { useLanguage } from '../i18n/LanguageContext'
import { useAppConfiguration } from '../config/AppConfigurationContext'
import { configuredFilterLabel, configurationLabel, getAppConfiguration, type AppConfiguration } from '../config/appConfiguration'

export type ColumnKey =
  | 'timestamp'
  | 'grid_ref'
  | 'direction'
  | 'unit'
  | 'category'
  | 'asset'
  | 'group'
  | 'purpose'
  | 'class_name'
  | 'result'

export const ALL_COLUMNS: Array<{ key: ColumnKey; label: string }> = [
  { key: 'timestamp', label: 'Дата і час' },
  { key: 'grid_ref', label: 'Grid ID' },
  { key: 'direction', label: 'Напрямок' },
  { key: 'unit', label: 'Зона Відповідальності' },
  { key: 'category', label: 'Кафедра' },
  { key: 'asset', label: 'Засіб' },
  { key: 'group', label: 'Екіпаж' },
  { key: 'purpose', label: 'Мета вильоту' },
  { key: 'class_name', label: 'Клас цілі' },
  { key: 'result', label: 'Результат' },
]

export function columnLabel(
  key: ColumnKey,
  tr: (uk: string, en: string) => string,
  config: AppConfiguration = getAppConfiguration(),
) {
  const labels: Record<ColumnKey, [string, string]> = {
    timestamp: ['Дата і час', 'Date & time'],
    grid_ref: ['Grid ID', 'Grid ID'],
    direction: ['Напрямок', 'Direction'],
    unit: ['Зона Відповідальності', 'Unit'],
    category: ['Кафедра', 'Type'],
    asset: ['Засіб', 'Asset'],
    group: ['Екіпаж', 'Group'],
    purpose: ['Мета вильоту', 'Purpose'],
    class_name: ['Клас цілі', 'Category'],
    result: ['Результат', 'Result'],
  }

  return configuredFilterLabel(config, key, tr(...labels[key]))
}

type Props = {
  rows?: EventRow[]
  visibleColumns?: ColumnKey[]
  pageSize?: number
  selectedId?: string | null
  onSelect?: (row: EventRow) => void
}

export function EventsTable({
  rows = [],
  visibleColumns,
  pageSize,
  selectedId,
  onSelect,
}: Props) {
  const { tr, locale } = useLanguage()
  const { config } = useAppConfiguration()
  const effectivePageSize = pageSize ?? config.tables.page_size
  const orderedColumns = (visibleColumns ?? config.tables.columns as ColumnKey[]).flatMap(key => ALL_COLUMNS.find(column => column.key === key) ?? [])
  const [sortKey, setSortKey] = useState<ColumnKey>('timestamp')
  const [desc, setDesc] = useState(true)
  const [page, setPage] = useState(1)

  const sorted = useMemo(() => {
    const out = [...rows].sort((a, b) =>
      String(a[sortKey] ?? '').localeCompare(
        String(b[sortKey] ?? ''),
        locale,
      ),
    )

    return desc ? out.reverse() : out
  }, [rows, sortKey, desc, locale])

  const pageCount = Math.max(1, Math.ceil(sorted.length / effectivePageSize))
  const safePage = Math.min(page, pageCount)
  const pageRows = sorted.slice(
    (safePage - 1) * effectivePageSize,
    safePage * effectivePageSize,
  )

  const sort = (key: ColumnKey) => {
    if (sortKey === key) {
      setDesc((x) => !x)
    } else {
      setSortKey(key)
      setDesc(false)
    }

    setPage(1)
  }

  function cell(row: EventRow, key: ColumnKey) {
    if (key === 'timestamp') return row.timestamp.replace('T', ' ')

    if (key === 'result') {
      return (
        <span
          className={`result ${
            row.result === 'Позитивний'
              ? 'ok'
              : row.result === 'Негативний'
                ? 'bad'
                : 'warn'
          }`}
        >
          {configurationLabel(config, 'result', row.result)}
        </span>
      )
    }

    if (key === 'grid_ref') {
      return <code className="grid_ref-code">{row.grid_ref}</code>
    }

    return configurationLabel(config, key, String(row[key] ?? '—'))
  }

  return (
    <>
      <div className="table-scroll">
        <table className="events-table">
          <thead>
            <tr>
              {orderedColumns.map((c) => (
                <th key={c.key}>
                  <button
                    type="button"
                    className="th-button"
                    onClick={() => sort(c.key)}
                  >
                    {columnLabel(c.key, tr, config)}
                    {sortKey === c.key ? (
                      desc ? (
                        <ChevronDown size={13} />
                      ) : (
                        <ChevronUp size={13} />
                      )
                    ) : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {pageRows.map((row) => (
              <tr
                key={row.id}
                className={selectedId === row.id ? 'selected-row' : ''}
                onClick={() => onSelect?.(row)}
              >
                {orderedColumns.map((c) => (
                  <td key={c.key}>{cell(row, c.key)}</td>
                ))}
              </tr>
            ))}

            {!pageRows.length && (
              <tr>
                <td
                  colSpan={orderedColumns.length || 1}
                  className="empty-cell"
                >
                  {tr(
                    'За цими умовами записів немає.',
                    'No records match these filters.',
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sorted.length > effectivePageSize && (
        <div className="pagination">
          <span>
            {(safePage - 1) * effectivePageSize + 1}–
            {Math.min(safePage * effectivePageSize, sorted.length)}{' '}
            {tr('з', 'of')} {sorted.length}
          </span>

          <div>
            <button
              type="button"
              aria-label={tr('Попередня сторінка', 'Previous page')}
              disabled={safePage <= 1}
              onClick={() => setPage(Math.max(1, safePage - 1))}
            >
              <ChevronLeft size={16} />
            </button>

            <strong>
              {safePage} / {pageCount}
            </strong>

            <button
              type="button"
              aria-label={tr('Наступна сторінка', 'Next page')}
              disabled={safePage >= pageCount}
              onClick={() =>
                setPage(Math.min(pageCount, safePage + 1))
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
