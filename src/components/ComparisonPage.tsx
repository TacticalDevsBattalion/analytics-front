import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Download, Layers, RefreshCcw, Search } from 'lucide-react'
import { useMemo, useState, type KeyboardEvent } from 'react'
import { FilterBar } from './FilterBar'
import { useLanguage } from '../i18n/LanguageContext'
import { api } from '../lib/api'
import { comparisonMetricRows, comparisonReference, metricDifference, temporalGroups, temporalMetricCells, type ComparisonMetricRow } from '../lib/comparison'
import { comparisonDetailRows, comparisonDetailValue, type ComparisonDetailRow } from '../lib/comparisonDetails'
import { buildComparisonReport } from '../lib/comparisonReport'
import { downloadComparisonReport } from '../lib/comparisonExport'
import type { ComparisonFilterSettings, ComparisonPeriod, ComparisonRequest, ComparisonResponse, ComparisonSelection, FilterOptions, FilterState } from '../lib/types'
import { useAppConfiguration } from '../config/AppConfigurationContext'
import { configuredFilterLabel, configurationLabel, type AppConfiguration } from '../config/appConfiguration'
import './ComparisonPage.css'

type Translate = (uk: string, en: string) => string
type View = 'overview' | 'periods' | 'classification'
type ExportFormat = 'csv' | 'xml' | 'xlsx'
type Props = { filters: FilterState; options?: FilterOptions; settings: ComparisonFilterSettings; request: ComparisonRequest | null; onApply: (filters: FilterState, settings: ComparisonFilterSettings) => void }
const SERIES_COLORS = ['#78b6ef', '#c1a6eb', '#82c9ca', '#d7b78a', '#9ba9e2', '#a7c6a0', '#ccadc0', '#a8bec8']

function keyboardView(event: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')]
  const index = tabs.indexOf(event.target as HTMLButtonElement)
  if (index < 0) return
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
  event.preventDefault()
  tabs[next].focus()
  tabs[next].click()
}

function periodLabel(period: Pick<ComparisonPeriod, 'date_from' | 'date_to' | 'time_from' | 'time_to'>) {
  return `${period.date_from}${period.time_from ? ` ${period.time_from}` : ''} — ${period.date_to}${period.time_to ? ` ${period.time_to}` : ''}`
}

function metricLabel(row: ComparisonMetricRow, tr: Translate) {
  const names: Record<string, [string, string]> = { flights: ['Вильоти', 'Flights'], effective: ['Результативні', 'Effective'], detected: ['Виявлено', 'Detected'], affected: ['Уражено', 'Affected'], destroyed: ['Знищено', 'Destroyed'], efficiency: ['Ефективність', 'Efficiency'], avg_flights_per_position: ['Вильотів на позицію за добу', 'Flights per position per day'], weighted_efficiency: ['Зважений KPI', 'Weighted KPI'] }
  const context = row.context === 'ОС' ? tr('ОС', 'Personnel') : row.context === 'Загалом' ? tr('Загалом', 'Overall') : row.context || (row.secondary ? tr('Додатковий показник', 'Additional metric') : '')
  return `${names[row.metricKey] ? tr(...names[row.metricKey]) : row.label}${context ? ` · ${context}` : ''}`
}

function selectionLabel(selection: ComparisonSelection, result: ComparisonResponse, config: AppConfiguration, tr: Translate) {
  if (result.mode === 'periods') return selection.id === 'current' ? tr('Поточний період', 'Current period') : tr('Період для порівняння', 'Comparison period')
  const raw = selection.filters[result.dimension]?.[0] || selection.group_id || selection.label
  return configurationLabel(config, result.dimension, raw, selection.label)
}

function groupLabel(result: ComparisonResponse, group: { id: string; label: string }, config: AppConfiguration, tr: Translate) {
  const selection = result.selections.find(item => item.group_id === group.id)
  return selection ? selectionLabel(selection, result, config, tr) : group.label
}

function periodCaution(result: ComparisonResponse, selection: ComparisonSelection, currentPeriod?: ComparisonPeriod) {
  const current = currentPeriod || result.periods?.find(period => period.id === selection.period_id)
  const reference = comparisonReference(result, selection)
  const previous = result.periods?.find(period => period.id === reference?.period_id)
  return Boolean(current?.is_partial || current?.is_current || previous?.is_partial || previous?.is_current)
}

function filterRows(filters: FilterState, options: FilterOptions | undefined, config: AppConfiguration, tr: Translate) {
  const fields: Array<[keyof FilterState, string]> = [['direction', tr('Напрямок', 'Direction')], ['unit', tr('Зона відповідальності', 'Responsibility zone')], ['category', tr('Кафедра', 'Device type')], ['asset', tr('Засіб', 'Asset')], ['group', tr('Екіпаж', 'Crew')], ['bbak', tr('ББАК', 'BBAK')], ['rota', tr('Рота', 'Company')], ['battalion', tr('Батальйон', 'Battalion')], ['purpose', tr('Мета вильоту', 'Flight purpose')], ['class_name', tr('Клас цілі', 'Target class')], ['result', tr('Результат', 'Result')]]
  return fields.flatMap(([key, fallback]) => {
    const values = filters[key]
    if (!Array.isArray(values) || !values.length) return []
    const choices = key === 'bbak' || key === 'battalion' ? options?.[key] : undefined
    return [[configuredFilterLabel(config, key, fallback), values.map(value => configurationLabel(config, key, value, choices?.find(choice => String(choice.id) === value)?.title || value)).join('; ')] as [string, string]]
  })
}

function PeriodBadges({ period }: { period?: ComparisonPeriod }) {
  const { tr } = useLanguage()
  if (!period) return null
  return <span className="cmp-period-badges">{(period.is_partial || period.is_current) && <span>{tr('Неповний період', 'Incomplete period')}</span>}{period.is_future && <span>{tr('Майбутній період', 'Future period')}</span>}</span>
}

function MetricValue({ value, reference, unit, showChange = true, noReference = false, caution = false }: { value?: number | null; reference?: number | null; unit?: string | null; showChange?: boolean; noReference?: boolean; caution?: boolean }) {
  const { tr, locale } = useLanguage()
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const signed = (amount: number) => `${amount > 0 ? '+' : ''}${number.format(amount)}`
  const difference = metricDifference(value, reference)
  const present = value != null && Number.isFinite(value)
  return <div className="cmp-value"><strong>{present ? `${number.format(value)}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}` : '—'}</strong>{showChange && <span className="cmp-change" title={noReference ? tr('Немає попереднього періоду.', 'No preceding period.') : difference.relative == null ? tr('Відносна зміна недоступна: нульова база або відсутні дані.', 'Relative change is unavailable: zero reference or missing data.') : `${tr('Відносна зміна', 'Relative change')}: ${signed(difference.relative)}%`}>{noReference ? '—' : difference.absolute == null ? '—' : `${signed(difference.absolute)}${unit === '%' ? ` ${tr('в.п.', 'pp')}` : unit ? ` ${unit}` : ''}`}{!noReference && difference.absolute != null && <small>{tr('до бази', 'vs reference')}</small>}</span>}{caution && showChange && !noReference && difference.absolute != null && <small className="cmp-caution-value">{tr('Зміна за неповний період', 'Change for an incomplete period')}</small>}</div>
}

function rowValue(row: ComparisonMetricRow, selection: ComparisonSelection) { return row.metrics[selection.id]?.value }
function rowUnit(row: ComparisonMetricRow, selection: ComparisonSelection) { return row.metrics[selection.id]?.unit ?? row.unit }
function rowReference(row: ComparisonMetricRow, selection: ComparisonSelection, result: ComparisonResponse) {
  const reference = comparisonReference(result, selection)
  return reference && rowUnit(row, selection) === rowUnit(row, reference) ? rowValue(row, reference) : undefined
}

function SnapshotDetails({ result, sourceLabel }: { result: ComparisonResponse; sourceLabel: string }) {
  const { tr, locale } = useLanguage()
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const rules = result.kpi_configuration?.purpose_rules
  return <details className="cmp-snapshot"><summary>{tr('Джерело та правила цього розрахунку', 'Source and rules used in this calculation')}</summary><dl><div><dt>{tr('Джерело', 'Source')}</dt><dd>{sourceLabel}</dd></div><div><dt>{tr('Версія правил KPI', 'KPI rules revision')}</dt><dd>{result.configuration_revision ?? tr('Не надана', 'Not provided')}</dd></div><div><dt>{tr('Відбиток правил', 'Rules fingerprint')}</dt><dd className="cmp-fingerprint">{result.kpi_fingerprint || tr('Не наданий', 'Not provided')}</dd></div></dl>{rules ? <><p className="cmp-note">{tr('Ці правила повернуті разом із показниками й увійдуть до звіту. Без власного правила діє ознака успішності джерела, частка 100% та коефіцієнт 1.', 'These rules were returned with the metrics and will be included in the report. Unconfigured purposes use source success, 100% usefulness, and coefficient 1.')}</p>{rules.length > 0 && <div className="cmp-rules-list">{rules.map(rule => <article key={rule.purpose}><strong>{rule.purpose}</strong><span>{tr('Частка', 'Usefulness')}: {number.format(rule.usefulness_percent)}% · {tr('Коефіцієнт', 'Coefficient')}: {number.format(rule.coefficient)}</span><small>{rule.success_mode === 'results' ? `${tr('Успішні результати', 'Successful outcomes')}: ${rule.successful_results.join('; ')}` : tr('Чинна ознака успішності джерела', 'Source success flag')}</small></article>)}</div>}</> : <p className="cmp-note">{tr('Джерело не надало повний набір правил для цієї відповіді.', 'The source did not provide the complete rules for this response.')}</p>}</details>
}

function SelectedMetricOverview({ result, row, selections, period }: { result: ComparisonResponse; row: ComparisonMetricRow; selections: ComparisonSelection[]; period?: ComparisonPeriod }) {
  const { tr } = useLanguage()
  const { config } = useAppConfiguration()
  const units = new Set(selections.map(selection => rowUnit(row, selection) || ''))
  const sameUnits = units.size <= 1
  const maximum = Math.max(0, ...selections.map(selection => Math.abs(rowValue(row, selection) ?? 0)).filter(Number.isFinite))
  return <div className="cmp-overview"><div className="cmp-view-heading"><h3>{metricLabel(row, tr)}</h3><span>{period ? periodLabel(period) : tr('Однаковий показник для кожної вибірки', 'The same metric for each selection')}</span></div>{!sameUnits && <p className="cmp-warning">{tr('У джерелі різні одиниці виміру. Значення показані окремо без спільної шкали.', 'The source uses different units. Values are shown separately without a shared scale.')}</p>}<div className="cmp-unit-cards">{selections.map((selection, index) => {
    const value = rowValue(row, selection), reference = comparisonReference(result, selection)
    const isBaseline = result.mode !== 'units_over_time' && selection.id === result.baseline_id
    return <article key={selection.id}><div className="cmp-card-title"><span className="cmp-series-dot" style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} /><h4>{selectionLabel(selection, result, config, tr)}</h4>{isBaseline && <small className="cmp-reference-badge">{tr('База', 'Reference')}</small>}</div>{result.mode === 'periods' && <p>{periodLabel(selection.filters)}</p>}<MetricValue value={value} reference={rowReference(row, selection, result)} unit={rowUnit(row, selection)} showChange={!isBaseline} noReference={!reference} caution={periodCaution(result, selection, period)} />{sameUnits && <div className="cmp-bar" aria-hidden="true"><span style={{ width: value != null && Number.isFinite(value) && maximum > 0 ? `${100 * Math.abs(value) / maximum}%` : '0%', background: SERIES_COLORS[index % SERIES_COLORS.length] }} /></div>}{value == null && <p className="cmp-missing">{tr('Джерело не надало значення', 'No value was provided by the source')}</p>}</article>
  })}</div></div>
}

function AllMetrics({ result, rows, selections, period }: { result: ComparisonResponse; rows: ComparisonMetricRow[]; selections: ComparisonSelection[]; period?: ComparisonPeriod }) {
  const { tr } = useLanguage()
  const { config } = useAppConfiguration()
  return <details className="cmp-all-metrics"><summary>{tr('Усі показники вибраного періоду', 'All metrics for the selected period')} <small>{rows.length}</small></summary><div className="cmp-full-metric-grid">{selections.map(selection => <article key={selection.id}><h4>{selectionLabel(selection, result, config, tr)}</h4><dl>{rows.map(row => <div key={row.key}><dt>{metricLabel(row, tr)}</dt><dd><MetricValue value={rowValue(row, selection)} reference={rowReference(row, selection, result)} unit={rowUnit(row, selection)} showChange={result.mode === 'units_over_time' || selection.id !== result.baseline_id} noReference={!comparisonReference(result, selection)} caution={periodCaution(result, selection, period)} /></dd></div>)}</dl></article>)}</div></details>
}

function TemporalChart({ result, row }: { result: ComparisonResponse; row: ComparisonMetricRow }) {
  const { tr, locale } = useLanguage()
  const { config } = useAppConfiguration()
  const matrix = temporalMetricCells(result, row), groups = temporalGroups(result)
  const values = matrix.flatMap(item => item.cells.map(cell => cell.value)).filter((value): value is number => value != null && Number.isFinite(value))
  if (!values.length || matrix.length < 2 || new Set(result.selections.map(selection => rowUnit(row, selection) || '')).size > 1) return null
  const low = Math.min(0, ...values), high = Math.max(...values, low + 1)
  const width = 800, height = 220, left = 58, top = 16, bottom = 40
  const x = (index: number) => left + index * (width - left - 20) / Math.max(1, matrix.length - 1)
  const y = (value: number) => top + (high - value) * (height - top - bottom) / (high - low)
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const incomplete = result.periods?.some(period => period.is_partial || period.is_current || period.is_future)
  return <div className="cmp-trend"><div className="cmp-trend-heading"><h3>{tr('Динаміка показника', 'Metric over time')}</h3>{incomplete && <span className="cmp-chart-warning">{tr('Є неповні періоди — враховуйте різну тривалість', 'Incomplete periods are present — account for different durations')}</span>}</div><svg role="img" aria-label={`${tr('Динаміка', 'Trend')}: ${metricLabel(row, tr)}`} viewBox={`0 0 ${width} ${height}`}>{[0, .5, 1].map(fraction => { const value = low + fraction * (high - low); return <g key={fraction}><line x1={left} y1={y(value)} x2={width - 20} y2={y(value)} stroke="#294356" strokeDasharray="3 5" /><text x={left - 9} y={y(value) + 4} textAnchor="end">{number.format(value)}{row.unit === '%' ? '%' : ''}</text></g> })}{groups.map((group, groupIndex) => {
    const segments: Array<Array<[number, number]>> = []
    let segment: Array<[number, number]> = []
    matrix.forEach((item, index) => { const value = item.cells.find(cell => cell.groupId === group.id)?.value; if (value == null) { if (segment.length) segments.push(segment); segment = [] } else segment.push([x(index), y(value)]) })
    if (segment.length) segments.push(segment)
    return <g key={group.id}>{segments.map((points, index) => <polyline key={index} points={points.map(point => point.join(',')).join(' ')} fill="none" stroke={SERIES_COLORS[groupIndex % SERIES_COLORS.length]} strokeWidth="2.5" />)}{matrix.map((item, index) => { const value = item.cells.find(cell => cell.groupId === group.id)?.value; return value == null ? null : <circle key={item.period.id} cx={x(index)} cy={y(value)} r={item.period.is_partial || item.period.is_current ? 4.5 : 3} fill={SERIES_COLORS[groupIndex % SERIES_COLORS.length]}><title>{`${groupLabel(result, group, config, tr)} · ${periodLabel(item.period)}: ${number.format(value)}${row.unit === '%' ? '%' : ''}`}</title></circle> })}</g>
  })}{matrix.map((item, index) => index === 0 || index === matrix.length - 1 || matrix.length <= 6 ? <text key={item.period.id} x={x(index)} y={height - 13} textAnchor={index === 0 ? 'start' : index === matrix.length - 1 ? 'end' : 'middle'}>{item.period.date_from}</text> : null)}</svg><div className="cmp-chart-legend">{groups.map((group, index) => <span key={group.id}><i style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} />{groupLabel(result, group, config, tr)}</span>)}</div></div>
}

function TemporalView({ result, row }: { result: ComparisonResponse; row: ComparisonMetricRow }) {
  const { tr } = useLanguage()
  const { config } = useAppConfiguration()
  const [showChanges, setShowChanges] = useState(false)
  const matrix = temporalMetricCells(result, row), groups = temporalGroups(result)
  const cellValue = (cell: (typeof matrix)[number]['cells'][number], period: ComparisonPeriod) => <MetricValue value={cell.value} reference={cell.selection ? rowReference(row, cell.selection, result) : undefined} unit={cell.selection ? rowUnit(row, cell.selection) : row.unit} showChange={showChanges} noReference={!cell.selection || !comparisonReference(result, cell.selection)} caution={cell.selection ? periodCaution(result, cell.selection, period) : false} />
  return <div className="cmp-temporal"><TemporalChart result={result} row={row} /><div className="cmp-temporal-heading"><h3>{tr('Значення за кожен період', 'Values for each period')}</h3><label><input type="checkbox" checked={showChanges} onChange={event => setShowChanges(event.target.checked)} />{tr('Показувати зміни до попереднього періоду', 'Show changes versus the preceding period')}</label></div><div className="cmp-desktop-periods cmp-data-scroll" role="region" tabIndex={0} aria-label={tr('Показники підрозділів за періодами', 'Unit metrics over time')}><table className="cmp-data-table"><thead><tr><th scope="col">{tr('Період', 'Period')}</th>{groups.map(group => <th scope="col" key={group.id}>{groupLabel(result, group, config, tr)}</th>)}</tr></thead><tbody>{matrix.map(({ period, cells }) => <tr key={period.id}><th scope="row">{periodLabel(period)}<PeriodBadges period={period} /></th>{cells.map(cell => <td key={cell.groupId}>{cellValue(cell, period)}</td>)}</tr>)}</tbody></table></div><div className="cmp-mobile-periods">{matrix.map(({ period, cells }) => <article key={period.id}><h4>{periodLabel(period)}</h4><PeriodBadges period={period} /><div>{cells.map(cell => <section key={cell.groupId}><h5>{groupLabel(result, groups.find(group => group.id === cell.groupId) || { id: cell.groupId, label: cell.groupId }, config, tr)}</h5>{cellValue(cell, period)}</section>)}</div></article>)}</div></div>
}

function ClassificationView({ result, row, selections, period }: { result: ComparisonResponse; row: ComparisonMetricRow; selections: ComparisonSelection[]; period?: ComparisonPeriod }) {
  const { tr } = useLanguage()
  const { config } = useAppConfiguration()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set()), [search, setSearch] = useState('')
  const allRows = useMemo(() => comparisonDetailRows(result, row.key), [result, row.key])
  const rowLabel = (detail: ComparisonDetailRow) => configurationLabel(config, detail.depth ? 'purpose' : 'category', detail.label)
  const hasChildren = new Set(allRows.flatMap(detail => detail.parentKey ? [detail.parentKey] : []))
  const relevant = new Set(allRows.filter(detail => selections.some(selection => detail.metrics[selection.id] != null || Boolean(comparisonReference(result, selection) && detail.metrics[comparisonReference(result, selection)!.id] != null))).map(detail => detail.key))
  for (const key of relevant) { let parent = allRows.find(detail => detail.key === key)?.parentKey; while (parent) { relevant.add(parent); parent = allRows.find(detail => detail.key === parent)?.parentKey } }
  const needle = search.trim().toLocaleLowerCase('uk-UA')
  const ownMatch = (detail: ComparisonDetailRow) => `${detail.pathLabels.join(' ')} ${detail.pathLabels.map((label, index) => configurationLabel(config, index ? 'purpose' : 'category', label)).join(' ')}`.toLocaleLowerCase('uk-UA').includes(needle)
  const matches = (detail: ComparisonDetailRow): boolean => ownMatch(detail) || allRows.some(child => child.parentKey === detail.key && relevant.has(child.key) && matches(child))
  const children = (parentKey?: string): ComparisonDetailRow[] => allRows.filter(detail => detail.parentKey === parentKey && relevant.has(detail.key) && (!needle || matches(detail))).flatMap(detail => [detail, ...(expanded.has(detail.key) || needle ? children(detail.key) : [])])
  const visible = children()
  const detailTitle = (detail: ComparisonDetailRow) => hasChildren.has(detail.key) ? <button type="button" className="cmp-detail-toggle" aria-expanded={Boolean(needle) || expanded.has(detail.key)} aria-label={`${tr('Деталізація', 'Breakdown')}: ${rowLabel(detail)}`} onClick={() => setExpanded(current => { const next = new Set(current); if (next.has(detail.key)) next.delete(detail.key); else next.add(detail.key); return next })}><ChevronDown size={15} /><span>{rowLabel(detail)}</span></button> : <span>{rowLabel(detail)}</span>
  const detailValue = (detail: ComparisonDetailRow, selection: ComparisonSelection) => {
    const reference = comparisonReference(result, selection), unit = detail.metrics[selection.id]?.unit ?? row.unit
    const compatible = reference && unit === (detail.metrics[reference.id]?.unit ?? row.unit)
    return <MetricValue value={comparisonDetailValue(detail, selection.id)} reference={compatible ? comparisonDetailValue(detail, reference.id) : undefined} unit={unit} showChange={result.mode === 'units_over_time' || selection.id !== result.baseline_id} noReference={!reference} caution={periodCaution(result, selection, period)} />
  }
  return <div className="cmp-classification"><div className="cmp-view-heading"><h3>{configuredFilterLabel(config, 'category', tr('Кафедри', 'Device types'))} {allRows.some(detail => detail.depth > 0) ? `→ ${configuredFilterLabel(config, 'purpose', tr('Мети вильотів', 'Flight purposes'))}` : ''}</h3><span>{metricLabel(row, tr)}</span></div><div className="cmp-detail-tools"><label><Search size={15} /><input aria-label={tr('Пошук кафедри або мети', 'Search device type or purpose')} value={search} onChange={event => setSearch(event.target.value)} placeholder={tr('Знайти кафедру або мету', 'Find a device type or purpose')} /></label><button type="button" onClick={() => setExpanded(new Set(hasChildren))}>{tr('Розкрити всі', 'Expand all')}</button><button type="button" onClick={() => { setExpanded(new Set()); setSearch('') }}>{tr('Згорнути всі', 'Collapse all')}</button></div><p className="cmp-note">{row.unit === '%' ? tr('Відсотки кафедр та мет надані джерелом для їхнього обсягу роботи. Загальний KPI не є простим середнім відсотків.', 'Device type and purpose percentages are supplied by the source for their workload. The overall KPI is not a simple average of percentages.') : tr('Натисніть кафедру, щоб відкрити мети, які надані джерелом. Значення показані окремо для кожної вибірки.', 'Expand a device type to see purposes supplied by the source. Values are shown separately for each selection.')}</p>{!visible.length ? <p className="cmp-empty-detail">{needle ? tr('За цим пошуком немає кафедр або мет.', 'No device types or purposes match your search.') : tr('Деталізація для цього показника та періоду недоступна.', 'The breakdown is unavailable for this metric and period.')}</p> : <><div className="cmp-desktop-details cmp-data-scroll" role="region" tabIndex={0} aria-label={tr('Деталізація кафедр і мет', 'Device type and purpose breakdown')}><table className="cmp-data-table cmp-detail-table"><thead><tr><th scope="col">{tr('Кафедра / мета', 'Device type / purpose')}</th>{selections.map(selection => <th scope="col" key={selection.id}>{selectionLabel(selection, result, config, tr)}{selection.id === result.baseline_id && result.mode !== 'units_over_time' && <small>{tr('База', 'Reference')}</small>}</th>)}</tr></thead><tbody>{visible.map(detail => <tr key={detail.key} className={detail.depth ? 'cmp-purpose-row' : 'cmp-department-row'}><th scope="row" style={{ paddingLeft: `${14 + detail.depth * 20}px` }}>{detailTitle(detail)}</th>{selections.map(selection => <td key={selection.id}>{detailValue(detail, selection)}</td>)}</tr>)}</tbody></table></div><div className="cmp-mobile-details">{visible.map(detail => <article key={detail.key} className={detail.depth ? 'cmp-purpose-card' : ''}><h4>{detailTitle(detail)}</h4><div>{selections.map(selection => <section key={selection.id}><h5>{selectionLabel(selection, result, config, tr)}</h5>{detailValue(detail, selection)}</section>)}</div></article>)}</div></>}</div>
}

export function ComparisonPage({ filters, options, settings, request, onApply }: Props) {
  const { tr, language } = useLanguage()
  const { config, publishedConfig } = useAppConfiguration()
  const kpiKey = useMemo(() => JSON.stringify(publishedConfig.kpi), [publishedConfig.kpi])
  const [view, setView] = useState<View>('overview'), [metricKey, setMetricKey] = useState('flights'), [periodId, setPeriodId] = useState('')
  const [exportFormat, setExportFormat] = useState<ExportFormat>('xlsx'), [exportBusy, setExportBusy] = useState(false), [exportError, setExportError] = useState('')
  const comparison = useQuery({ queryKey: ['comparison', request, kpiKey], queryFn: ({ signal }) => api.comparison(request!, signal), enabled: request != null })
  const source = useQuery({ queryKey: ['source-status'], queryFn: api.sourceStatus, enabled: Boolean(request) })
  const result = comparison.data
  const metricRows = useMemo(() => result ? comparisonMetricRows(result) : [], [result])
  const detailedRows = useMemo(() => result ? metricRows.filter(row => !row.secondary && comparisonDetailRows(result, row.key).length > 0) : [], [result, metricRows])
  const activeView = result?.mode !== 'units_over_time' && view === 'periods' ? 'overview' : view
  const availableRows = activeView === 'classification' ? detailedRows : metricRows
  const selectedMetric = availableRows.find(row => row.key === metricKey) || availableRows[0]
  const selectedPeriod = result?.periods?.find(period => period.id === periodId) || [...(result?.periods || [])].reverse().find(period => !period.is_future) || result?.periods?.at(-1)
  const currentSelections = result?.mode === 'units_over_time' ? result.selections.filter(selection => selection.period_id === selectedPeriod?.id) : result?.selections || []
  const baseline = result?.selections.find(selection => selection.id === result.baseline_id)
  const modeLabel = (mode: ComparisonRequest['mode']) => mode === 'periods' ? tr('Порівняння періодів', 'Period comparison') : mode === 'units' ? tr('Порівняння підрозділів', 'Unit comparison') : tr('Підрозділи за періодами', 'Units over time')
  const sourceLabel = result?.source ? ({ clickhouse: 'ClickHouse', mock: tr('Демо', 'Demo'), database: 'PostgreSQL', external: tr('Зовнішнє джерело', 'External source') })[result.source] : source.data?.label || tr('Не надане', 'Not provided')
  const reportRange = result?.mode === 'units_over_time' && result.periods?.length ? `${result.periods[0].date_from} — ${result.periods.at(-1)!.date_to}` : result?.selections.map(selection => periodLabel(selection.filters)).filter((value, index, all) => all.indexOf(value) === index).join(' ↔ ')
  const contextSelections = result?.mode === 'units_over_time' ? temporalGroups(result).map(group => result.selections.find(selection => selection.group_id === group.id)!).filter(Boolean) : result?.selections || []
  const rulesMismatch = Boolean(result?.kpi_fingerprint && result.selections.some(selection => selection.metrics.some(metric => metric.calculation_fingerprint && metric.calculation_fingerprint !== result.kpi_fingerprint)))
  const partialReference = result && currentSelections.some(selection => { const reference = comparisonReference(result, selection); const period = result.periods?.find(item => item.id === reference?.period_id); return period?.is_partial || period?.is_current })

  async function exportReport() {
    if (!result || comparison.isFetching || comparison.isError || exportBusy || rulesMismatch) return
    setExportBusy(true)
    setExportError('')
    try { const report = buildComparisonReport(result, { config, options, sourceLabel, language }); await downloadComparisonReport(report, exportFormat) }
    catch (reason) { setExportError(reason instanceof Error ? `${tr('Не вдалося створити звіт', 'The report could not be created')}: ${reason.message}` : tr('Не вдалося створити звіт. Спробуйте ще раз.', 'The report could not be created. Try again.')) }
    finally { setExportBusy(false) }
  }

  return <div className="comparison-page comparison-page--refined"><FilterBar filters={filters} options={options} comparison={{ settings, onApply }} onChange={() => {}} initiallyOpen={!request} /><section className="panel cmp-results" aria-busy={comparison.isFetching}>
    <div className="cmp-results-heading"><div><h2>{tr('Результати порівняння', 'Comparison results')}</h2><p>{request ? modeLabel(request.mode) : tr('Налаштуйте порівняння у фільтрах', 'Set up the comparison in filters')}</p></div><div className="cmp-result-actions"><button type="button" disabled={!request || comparison.isFetching} onClick={() => { setExportError(''); void comparison.refetch() }}><RefreshCcw className={comparison.isFetching ? 'spin' : ''} size={15} />{tr('Оновити', 'Refresh')}</button><label><span className="comparison-sr-only">{tr('Формат звіту', 'Report format')}</span><select aria-label={tr('Формат звіту', 'Report format')} value={exportFormat} disabled={exportBusy || !result} onChange={event => { setExportFormat(event.target.value as ExportFormat); setExportError('') }}><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV</option><option value="xml">XML</option></select></label><button type="button" className="cmp-export-button" disabled={!result || !metricRows.length || comparison.isFetching || comparison.isError || exportBusy || rulesMismatch} onClick={() => void exportReport()}><Download size={15} />{exportBusy ? tr('Створення звіту…', 'Creating report…') : tr('Завантажити звіт', 'Download report')}</button></div></div>
    <p className="cmp-export-hint">{tr('Звіт містить усі показники, підрозділи, періоди та розрізи порівняння, незалежно від відкритого виду.', 'The report includes all comparison metrics, units, periods, and breakdowns, regardless of the selected view.')}</p>
    {exportError && <div className="cmp-error" role="alert">{exportError}</div>}
    {!request && <div className="comparison-state" role="status"><Layers size={24} /><strong>{tr('Оберіть фільтри, позначте «Порівняти» та натисніть «Застосувати».', 'Choose filters, check Compare, then click Apply.')}</strong></div>}
    {request && comparison.isPending && <div className="comparison-state" role="status"><RefreshCcw className="spin" size={24} /><strong>{tr('Завантаження порівняння…', 'Loading comparison…')}</strong></div>}
    {request && comparison.isError && <div className="cmp-error" role="alert"><strong>{tr('Не вдалося завантажити порівняння', 'Comparison could not be loaded')}</strong><span>{comparison.error instanceof Error ? comparison.error.message : tr('Джерело даних недоступне.', 'The data source is unavailable.')}</span><button type="button" disabled={comparison.isFetching} onClick={() => void comparison.refetch()}>{tr('Спробувати ще раз', 'Try again')}</button></div>}
    {request && !comparison.isPending && !comparison.isError && (!result || !metricRows.length) && <div className="comparison-state" role="status"><strong>{tr('Немає показників для порівняння', 'No metrics available to compare')}</strong></div>}
    {request && result && metricRows.length > 0 && !comparison.isError && <>
      {comparison.isFetching && <p className="cmp-updating" role="status">{tr('Оновлення показників…', 'Updating metrics…')}</p>}
      <div className="cmp-context"><div className="cmp-context-grid"><article><span>{tr('Період звіту', 'Report period')}</span><strong>{reportRange}</strong></article><article><span>{result.mode === 'periods' ? tr('Вибірки', 'Selections') : tr('Підрозділи', 'Units')}</span><strong>{contextSelections.map(selection => selectionLabel(selection, result, config, tr)).join(' · ')}</strong></article><article><span>{tr('База для змін', 'Change reference')}</span><strong>{result.mode === 'units_over_time' ? tr('Попередній період того самого підрозділу', 'The preceding period for the same unit') : baseline ? selectionLabel(baseline, result, config, tr) : tr('Не надана', 'Not provided')}</strong></article></div><div className="cmp-context-meta"><span>{sourceLabel}</span>{result.configuration_revision != null && <span>{tr('Правила KPI', 'KPI rules')}: {tr('версія', 'revision')} {result.configuration_revision}</span>}<details><summary>{tr('Застосовані фільтри', 'Applied filters')}</summary><div className="cmp-filter-context">{contextSelections.map(selection => <article key={selection.id}><h4>{selectionLabel(selection, result, config, tr)}</h4><dl>{filterRows(selection.filters, options, config, tr).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{!filterRows(selection.filters, options, config, tr).length && <p>{tr('Усі значення довідників', 'All dictionary values')}</p>}</article>)}</div></details></div></div>
      {rulesMismatch && <div className="cmp-error" role="alert">{tr('Версії правил у відповіді не збігаються. Оновіть порівняння перед переглядом або експортом.', 'Rules versions in the response do not match. Refresh the comparison before viewing or exporting.')}</div>}
      <div className="cmp-view-tabs" onKeyDown={keyboardView} role="tablist" aria-label={tr('Вид результатів порівняння', 'Comparison results view')}><button type="button" role="tab" id="cmp-tab-overview" tabIndex={activeView === 'overview' ? 0 : -1} aria-selected={activeView === 'overview'} aria-controls="cmp-view-content" onClick={() => setView('overview')}>{tr('Зведення', 'Overview')}</button>{result.mode === 'units_over_time' && <button type="button" role="tab" id="cmp-tab-periods" tabIndex={activeView === 'periods' ? 0 : -1} aria-selected={activeView === 'periods'} aria-controls="cmp-view-content" onClick={() => setView('periods')}>{tr('За періодами', 'By period')}</button>}<button type="button" role="tab" id="cmp-tab-classification" tabIndex={activeView === 'classification' ? 0 : -1} aria-selected={activeView === 'classification'} aria-controls="cmp-view-content" onClick={() => setView('classification')}>{tr('Кафедри та мети', 'Device types and purposes')}</button></div>
      <div className="cmp-view-controls"><label><span>{tr('Показник', 'Metric')}</span><select aria-label={tr('Показник порівняння', 'Comparison metric')} value={selectedMetric?.key || ''} disabled={!availableRows.length} onChange={event => setMetricKey(event.target.value)}>{availableRows.map(row => <option key={row.key} value={row.key}>{metricLabel(row, tr)}</option>)}</select></label>{result.mode === 'units_over_time' && activeView !== 'periods' && <label><span>{tr('Період деталізації', 'Detail period')}</span><select aria-label={tr('Період деталізації', 'Detail period')} value={selectedPeriod?.id || ''} onChange={event => setPeriodId(event.target.value)}>{result.periods?.map(period => <option key={period.id} value={period.id}>{periodLabel(period)}{period.is_partial || period.is_current ? ` · ${tr('неповний', 'incomplete')}` : ''}{period.is_future ? ` · ${tr('майбутній', 'future')}` : ''}</option>)}</select></label>}</div>
      {activeView !== 'periods' && (selectedPeriod?.is_partial || selectedPeriod?.is_current || selectedPeriod?.is_future || partialReference) && <div className="cmp-warning" role="note"><strong>{selectedPeriod?.is_future ? tr('Вибрано майбутній період.', 'A future period is selected.') : tr('Порівняння містить неповний період.', 'The comparison includes an incomplete period.')}</strong> {tr('Неповний період охоплює лише частину календарного періоду. Поточні дані можуть оновлюватися. Знак різниці показує лише зміну значення.', 'An incomplete period covers only part of a calendar period. Current data may still update. The difference sign only indicates a change in value.')}</div>}
      <div className="cmp-view-content" id="cmp-view-content" role="tabpanel" aria-labelledby={`cmp-tab-${activeView}`}>{!selectedMetric ? <p className="cmp-empty-detail">{tr('Джерело не надало деталізації показників за кафедрами та метами.', 'The source did not provide device type and purpose breakdowns.')}</p> : activeView === 'overview' ? <><SelectedMetricOverview result={result} row={selectedMetric} selections={currentSelections} period={selectedPeriod} /><AllMetrics result={result} rows={metricRows} selections={currentSelections} period={selectedPeriod} /></> : activeView === 'periods' ? <TemporalView result={result} row={selectedMetric} /> : <ClassificationView key={`${selectedMetric.key}:${selectedPeriod?.id || ''}`} result={result} row={selectedMetric} selections={currentSelections} period={selectedPeriod} />}</div>
      <p className="cmp-footnote">{tr('«—» означає відсутні дані або відсутню базу. Перший період не має попередньої бази. Різниця відсотків — у відсоткових пунктах (в.п.). Значення періодів і відсотки не підсумовуються.', '“—” indicates missing data or no reference. The first period has no preceding reference. Percentage differences use percentage points (pp). Period values and percentages are not summed.')}</p><SnapshotDetails result={result} sourceLabel={sourceLabel} />
    </>}
  </section></div>
}

export default ComparisonPage
