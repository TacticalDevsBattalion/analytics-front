import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GitCompareArrows, RefreshCw } from 'lucide-react'
import { useLanguage } from '../../i18n/LanguageContext'
import { biApi } from '../../lib/biApi'
import type { AnalyticsComparisonRequest, AnalyticsHierarchy, AnalyticsMetadata, HierarchyOption } from '../../lib/biTypes'
import type { FilterState } from '../../lib/types'
import { comparisonInheritedFilters } from '../../lib/biBuilder'
import { useCustomFilters } from '../../config/CustomFiltersContext'
import { formatWidgetValue } from './WidgetRenderer'
import { WidgetRenderer } from './WidgetRenderer'
import './bi.css'

type Level = AnalyticsComparisonRequest['level']
export type BIComparisonProps = { filters: FilterState }
function ownOptions(options: HierarchyOption[], level: Level, metadata: AnalyticsMetadata | undefined, hierarchy: AnalyticsHierarchy | undefined) {
  const scope = (metadata?.data_scope ?? metadata?.scope) as { scope_type?: string; scope_ids?: string[] } | undefined
  if (scope?.scope_type === 'NONE') return []
  if (level === 'CATEGORY') return options
  const canonicalLevel = level === 'BBAK' ? 'DEPARTMENT' : level === 'CREW' ? 'TEAM' : level
  if (!scope || scope.scope_type === 'ALL' || scope.scope_type === 'CUSTOM' || scope.scope_type === 'SELF') return options
  const ids = new Set(scope.scope_ids ?? [])
  return options.filter(option => {
    if (scope.scope_type === 'DEPARTMENT') return ids.has(canonicalLevel === 'DEPARTMENT' ? option.id : option.department_id ?? '')
    if (scope.scope_type === 'GROUP') {
      if (canonicalLevel === 'GROUP') return ids.has(option.id)
      if (canonicalLevel === 'TEAM') return ids.has(option.group_id ?? '')
      return hierarchy?.groups.some(group => ids.has(group.id) && group.department_id === option.id)
    }
    if (scope.scope_type === 'TEAM') {
      if (canonicalLevel === 'TEAM') return ids.has(option.id)
      return hierarchy?.teams.some(team => ids.has(team.id) && (canonicalLevel === 'GROUP' ? team.group_id : team.department_id) === option.id)
    }
    return false
  })
}
const rowValue = (value: unknown) => value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)

export function BIComparison({ filters }: BIComparisonProps) {
  const { tr, locale } = useLanguage()
  const customFilters = useCustomFilters()
  const metadata = useQuery({ queryKey: ['bi-metadata'], queryFn: ({ signal }) => biApi.metadata(signal) })
  const catalog = useQuery({ queryKey: ['analytics-catalog'], queryFn: ({ signal }) => biApi.catalog(signal) })
  const hierarchy = useQuery({ queryKey: ['bi-hierarchy'], queryFn: ({ signal }) => biApi.hierarchy(signal) })
  const dashboards = useQuery({ queryKey: ['bi-dashboards', 'COMPARISON'], queryFn: ({ signal }) => biApi.dashboards('COMPARISON', signal) })
  const [presetDashboardId, setPresetDashboardId] = useState('')
  const [presetWidgetId, setPresetWidgetId] = useState('')
  const [level, setLevel] = useState<Level>('CATEGORY')
  const [category, setCategory] = useState('')
  const [department, setDepartment] = useState('')
    const [own, setOwn] = useState('')
  const [peer, setPeer] = useState('')
  const [metrics, setMetrics] = useState<string[]>([])
  const [dimension, setDimension] = useState('')
  const [granularity, setGranularity] = useState('day')
  const [request, setRequest] = useState<AnalyticsComparisonRequest | null>(null)
  const comparison = useQuery({ queryKey: ['bi-comparison', request], queryFn: ({ signal }) => biApi.comparison(request!, signal), enabled: request !== null })
  const permissions = metadata.data?.permissions ?? []
  const has = (permission: string) => permissions.includes('*') || permissions.includes(permission)
  const canSelectPeer = has('comparison.select_peer')
  const canBreakdown = has('comparison.view_breakdown')
  const levels: Array<{ key: Level; title: string }> = [
    { key: 'CATEGORY' as const, title: tr('Кафедри', 'Departments'), permission: 'comparison.category' },
    { key: 'BBAK' as const, title: tr('ББАК', 'BBAK'), permission: 'comparison.department' },
    { key: 'CREW' as const, title: tr('Екіпажі', 'Crews'), permission: 'comparison.team' },
  ].filter(item => has(item.permission) || (item.key === 'CREW' && has('comparison.crew')) || (item.key === 'BBAK' && has('comparison.unit')))
  const departments = hierarchy.data?.departments ?? []
  const categories = hierarchy.data?.categories ?? []
  const crews = (hierarchy.data?.crews ?? hierarchy.data?.teams ?? []).filter(item => item.category === category && (!department || item.department_id === department))
  const allOptions = level === 'CATEGORY' ? categories : level === 'BBAK' ? departments : crews
  const owns = ownOptions(allOptions, level, metadata.data, hierarchy.data)
  const peers = allOptions.filter(option => option.id !== own)
  const dimensions = (catalog.data?.dimensions ?? []).map(item => ({ field: item.field ?? item.key, title: item.label ?? item.title ?? 'Розріз' }))
  const metricDefinitions = metadata.data?.metrics ?? []
  const configuredDashboard = dashboards.data?.find(item => item.id === presetDashboardId) ?? dashboards.data?.[0]
  const configuredWidgets = configuredDashboard?.widgets.filter(widget => !['text', 'markdown'].includes(widget.visualization.type) && widget.query.metrics.length) ?? []
  const configuredWidget = configuredWidgets.find(widget => widget.id === presetWidgetId) ?? configuredWidgets[0]
  const selectableMetrics = configuredDashboard ? configuredWidget ? metricDefinitions.filter(metric => configuredWidget.query.metrics.some(reference => reference.key === metric.key)) : [] : metricDefinitions
  useEffect(() => {
    if (levels.length && !levels.some(item => item.key === level)) setLevel(levels[0].key)
  }, [permissions, level])
  useEffect(() => { if (!owns.some(option => option.id === own)) setOwn(owns[0]?.id ?? '') }, [level, category, department, hierarchy.data, metadata.data, own])
  useEffect(() => { if (!peers.some(option => option.id === peer)) setPeer(peers[0]?.id ?? '') }, [level, category, department, hierarchy.data, own, peer])
  useEffect(() => { if (!categories.some(option => option.id === category)) setCategory(categories[0]?.id ?? '') }, [category, hierarchy.data])
  useEffect(() => {
    if (configuredWidget) {
      setMetrics(configuredWidget.query.metrics.map(metric => metric.key))
      setDimension(configuredWidget.query.dimensions[0]?.field ?? '')
      setGranularity(configuredWidget.query.dimensions[0]?.granularity ?? 'day')
    } else if (configuredDashboard) setMetrics([])
    else if (metricDefinitions.length && !metrics.length) setMetrics(metricDefinitions.slice(0, 2).map(metric => metric.key))
  }, [configuredDashboard?.id, configuredWidget?.id, configuredWidget?.revision, metadata.data])
  useEffect(() => { if (!canBreakdown) setDimension('') }, [canBreakdown])
  const allowedMetrics = metrics.filter(key => selectableMetrics.some(metric => metric.key === key))
  const submit = () => {
    if (!own || (canSelectPeer && (!peer || own === peer)) || !allowedMetrics.length) return
    const query = configuredWidget?.query
    const inherit = configuredWidget?.inherit_global_filters !== false
    const inheritedFilters = inherit ? [...comparisonInheritedFilters(filters, metadata.data?.filter_fields ?? [], level), ...customFilters.queryFilters] : []
    setRequest({ level, own_id: own, ...(canSelectPeer ? { peer_id: peer } : {}), ...(department && level !== 'CATEGORY' ? { context_department_id: department } : {}), ...(category && level === 'CREW' ? { context_category: category } : {}), query: { metrics: allowedMetrics.map(key => ({ key })), dimensions: canBreakdown ? configuredWidget ? query?.dimensions ?? [] : dimension ? [{ field: dimension, ...(dimension === 'date' ? { granularity } : {}) }] : [] : [], date_range: configuredWidget?.date_mode === 'USE_FIXED_DATE' && query?.date_range ? query.date_range : { from: filters.date_from, to: filters.date_to }, filters: [...(inherit ? configuredDashboard?.global_filters ?? [] : []), ...(query?.filters ?? []), ...(configuredWidget?.fixed_filters ?? []), ...inheritedFilters], sort: query?.sort ?? [], top_n: query?.top_n ?? null, data_scope: 'USER_SCOPE' } })
  }
  const result = comparison.data
  const displayRows = useMemo(() => result?.rows ?? [], [result])
  const difference = (row: Record<string, unknown>) => {
    const range = row.difference_range as { from?: number; to?: number } | undefined
    const unit = row.difference_type === 'percentage_points' ? tr('п.п.', 'pp') : '%'
    if (range?.from != null && range?.to != null) return `${formatWidgetValue(range.from, { decimals: 0 }, locale)}–${formatWidgetValue(range.to, { decimals: 0 }, locale)} ${unit}`
    const value = row.difference_type === 'percentage_points' ? row.difference_pp : row.difference_percent
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
    return `${value > 0 ? '+' : ''}${formatWidgetValue(value, { decimals: result?.precision === 'EXACT' ? 2 : 0 }, locale)} ${unit}`
  }
  if (metadata.isPending || hierarchy.isPending || catalog.isPending || dashboards.isPending) return <div className="bi-state" role="status">{tr('Завантаження можливостей порівняння…', 'Loading comparison options…')}</div>
  if (metadata.isError || hierarchy.isError || catalog.isError || dashboards.isError) return <div className="bi-error-banner" role="alert">{metadata.error?.message || hierarchy.error?.message || catalog.error?.message || dashboards.error?.message}</div>
  if (!levels.length) return <div className="bi-state">{tr('Для цього облікового запису немає доступних рівнів порівняння.', 'No comparison levels are available for this account.')}</div>
  return <section className="bi-page" aria-label={tr('Порівняння', 'Comparison')}>
    <div className="bi-toolbar"><div><h2><GitCompareArrows size={18} /> {configuredDashboard?.name ?? tr('Порівняння показників', 'Compare metrics')}</h2><p>{configuredDashboard?.description || tr('Спільні метрики, серверні права доступу та область даних.', 'Shared metrics with server access checks and data scopes.')}</p></div></div>
    {configuredDashboard?.widgets.filter(widget => ['text', 'markdown'].includes(widget.visualization.type)).map(widget => <WidgetRenderer definition={widget} key={widget.id} />)}
    {configuredDashboard && !configuredWidgets.length && <p className="bi-notice">{tr('Для цієї сторінки ще не налаштовано набори метрик. Додайте набір показників в адмініструванні → Налаштування порівняння.', 'No metric presets have been configured for this page. Add a widget in the Comparison builder.')}</p>}
    <form className="bi-comparison-form" onSubmit={event => { event.preventDefault(); submit() }}>
      {Boolean(dashboards.data?.length) && <label>{tr('Конфігурація сторінки', 'Page configuration')}<select value={configuredDashboard?.id ?? ''} onChange={event => { setPresetDashboardId(event.target.value); setPresetWidgetId(''); setRequest(null) }}>{dashboards.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {configuredWidgets.length > 0 && <label>{tr('Набір показників', 'Metric preset')}<select value={configuredWidget?.id ?? ''} onChange={event => { setPresetWidgetId(event.target.value); setRequest(null) }}>{configuredWidgets.map(widget => <option value={widget.id} key={widget.id}>{widget.title}</option>)}</select></label>}
      <label>{tr('Рівень', 'Level')}<select value={level} onChange={event => setLevel(event.target.value as Level)}>{levels.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}</select></label>
      {level === 'CREW' && <label>{tr('Кафедра', 'Department')}<select value={category} onChange={event => setCategory(event.target.value)}><option value="">Оберіть кафедру</option>{categories.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
      {level === 'CREW' && <label>{tr('ББАК', 'BBAK')}<select value={department} onChange={event => setDepartment(event.target.value)}><option value="">Усі дозволені ББАК</option>{departments.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
      <label>{tr('Власна область', 'Own area')}<select value={own} onChange={event => setOwn(event.target.value)}><option value="">{tr('Оберіть', 'Select')}</option>{owns.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      {canSelectPeer ? <label>{tr('Порівняти з', 'Compare with')}<select value={peer} onChange={event => setPeer(event.target.value)}><option value="">{tr('Оберіть', 'Select')}</option>{peers.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label> : <p className="bi-notice">{tr('Область для порівняння обирає сервер.', 'The server selects the peer area.')}</p>}
      <label>{tr('Метрики', 'Metrics')}<select multiple value={metrics} onChange={event => setMetrics([...event.target.selectedOptions].map(option => option.value))}>{selectableMetrics.map(metric => <option key={metric.key} value={metric.key}>{metric.title}</option>)}</select></label>
      {canBreakdown && (configuredWidget ? <p className="bi-notice">{tr('Розрізи конфігурації', 'Configured dimensions')}: {configuredWidget.query.dimensions.map(item => `${dimensions.find(dimension => dimension.field === item.field)?.title ?? item.field}${item.granularity ? ` (${item.granularity})` : ''}`).join(', ') || tr('Загалом', 'Overall')}</p> : <label>{tr('Розріз', 'Dimension')}<select value={dimension} onChange={event => setDimension(event.target.value)}><option value="">{tr('Загалом', 'Overall')}</option>{dimensions.map(item => <option key={item.field} value={item.field}>{item.title}</option>)}</select></label>)}
      {canBreakdown && !configuredWidget && dimension === 'date' && <label>{tr('Період', 'Period')}<select value={granularity} onChange={event => setGranularity(event.target.value)}><option value="day">{tr('День', 'Day')}</option><option value="week">{tr('Тиждень', 'Week')}</option><option value="month">{tr('Місяць', 'Month')}</option><option value="quarter">{tr('Квартал', 'Quarter')}</option></select></label>}
      <button type="submit" className="secondary" disabled={comparison.isFetching || !own || (canSelectPeer && (!peer || own === peer)) || !allowedMetrics.length}>{tr('Порівняти', 'Compare')}</button>
    </form>
    {!owns.length && <p className="bi-notice">{tr('Немає власної області для цього рівня. Перевірте призначені права та область даних.', 'No own area is available at this level. Check your assigned permissions and data scope.')}</p>}
    {request && comparison.isPending && <p className="bi-state" role="status">{tr('Розрахунок порівняння…', 'Calculating comparison…')}</p>}
    {comparison.isError && <div className="bi-error-banner" role="alert">{comparison.error.message} <button className="secondary" type="button" onClick={() => void comparison.refetch()}><RefreshCw size={14} /> {tr('Повторити', 'Retry')}</button></div>}
    {result && <><p className="bi-notice">{result.raw_visible ? tr('Доступні абсолютні показники обох областей.', 'Absolute values are available for both areas.') : tr('Доступна лише дозволена сервером різниця. Абсолютні показники іншої області приховано.', 'Only the server permitted difference is available. Absolute peer values are hidden.')} {tr('Точність', 'Precision')}: {result.precision}</p>{!displayRows.length ? <p className="bi-state">{tr('Немає даних для порівняння.', 'No comparison data.')}</p> : <div className="bi-table-scroll"><table className="bi-table"><thead><tr>{request?.query.dimensions.map(item => <th key={item.field}>{dimensions.find(dimensionItem => dimensionItem.field === item.field)?.title ?? item.field}</th>)}<th>{tr('Метрика', 'Metric')}</th>{result.raw_visible && <><th>{tr('Власна область', 'Own area')}</th><th>{tr('Інша область', 'Peer area')}</th></>}<th>{tr('Різниця', 'Difference')}</th><th>{tr('Стан', 'Status')}</th></tr></thead><tbody>{displayRows.map((row, index) => {
      const metric = metricDefinitions.find(item => item.key === row.metric)
      return <tr key={index}>{request?.query.dimensions.map(item => <td key={item.field}>{rowValue(row[item.field])}</td>)}<td>{metric?.title ?? rowValue(row.metric)}</td>{result.raw_visible && <><td>{formatWidgetValue(row.own, metric?.format, locale)}</td><td>{formatWidgetValue(row.peer, metric?.format, locale)}</td></>}<td>{difference(row)}</td><td>{row.status === 'zero_baseline' ? tr('База дорівнює нулю', 'Zero baseline') : row.status === 'no_data' ? tr('Немає даних', 'No data') : row.direction === 'higher' ? '↑' : row.direction === 'lower' ? '↓' : row.direction === 'equal' ? '=' : '—'}</td></tr>
    })}</tbody></table></div>}</>}
  </section>
}
