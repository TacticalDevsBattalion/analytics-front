import { useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { GitCompareArrows, RefreshCw } from 'lucide-react'
import { useLanguage } from '../../i18n/LanguageContext'
import { biApi } from '../../lib/biApi'
import type { AnalyticsComparisonRequest, AnalyticsHierarchy, AnalyticsMetadata, HierarchyOption, QueryRequest } from '../../lib/biTypes'
import type { FilterState } from '../../lib/types'
import { comparisonInheritedFilters } from '../../lib/biBuilder'
import { useCustomFilters } from '../../config/CustomFiltersContext'
import { formatWidgetValue } from './WidgetRenderer'
import { AreaGroups } from './AreaGroups'
import { analyzeMissionGroups, isRateMetric, missionParts, missionRows, normalizeDirection } from '../../lib/areaComparison'
import { WidgetRenderer } from './WidgetRenderer'
import { ExportControl } from './ExportControl'
import type { ExportDocument } from '../../lib/tableExport'
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
const FILTER_NAMES: Record<string, string> = { direction: 'Напрямок', unit: 'Зона відповідальності', category: 'Кафедра', asset: 'Засіб', group: 'Екіпаж', bbak: 'ББАК', rota: 'Рота', battalion: 'Батальйон', purpose: 'Мета вильоту', class_name: 'Клас цілі', result: 'Результат' }
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
  const [view, setView] = useState<'all' | 'pair'>('all')
  const comparison = useQuery({ queryKey: ['bi-comparison', request], queryFn: ({ signal }) => biApi.comparison(request!, signal), enabled: request !== null })
  const permissions = metadata.data?.permissions ?? []
  const has = (permission: string) => permissions.includes('*') || permissions.includes(permission)
  // "Own area" only matters for scoped users. Unrestricted users with raw peer
  // access compare every area at once; the server still applies their scope.
  const scopeType = ((metadata.data?.data_scope ?? metadata.data?.scope) as { scope_type?: string } | undefined)?.scope_type
  const fullAccess = (scopeType == null || scopeType === 'ALL') && has('comparison.view_peer_raw')
  const mode = fullAccess ? view : 'pair'
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
  // Built-in cards (average per position, weighted KPI) are not comparable metrics.
  const metricDefinitions = (metadata.data?.metrics ?? []).filter(metric => metric.kind !== 'builtin')
  const configuredDashboard = dashboards.data?.find(item => item.id === presetDashboardId) ?? dashboards.data?.[0]
  const configuredWidgets = configuredDashboard?.widgets.filter(widget => !['text', 'markdown'].includes(widget.visualization.type) && widget.query.metrics.length) ?? []
  const configuredWidget = configuredWidgets.find(widget => widget.id === presetWidgetId) ?? configuredWidgets[0]
  const selectableMetrics = configuredDashboard ? configuredWidget ? metricDefinitions.filter(metric => configuredWidget.query.metrics.some(reference => reference.key === metric.key)) : [] : metricDefinitions
  useEffect(() => {
    if (levels.length && !levels.some(item => item.key === level)) setLevel(levels[0].key)
  }, [permissions, level])
  useEffect(() => { if (!owns.some(option => option.id === own)) setOwn(owns[0]?.id ?? '') }, [level, category, department, hierarchy.data, metadata.data, own])
  useEffect(() => { if (!peers.some(option => option.id === peer)) setPeer(peers[0]?.id ?? '') }, [level, category, department, hierarchy.data, own, peer])
  // "All areas" may span every department; the detailed pair needs one context.
  useEffect(() => { if (category ? !categories.some(option => option.id === category) : mode === 'pair' && level === 'CREW') setCategory(mode === 'pair' ? categories[0]?.id ?? '' : '') }, [category, hierarchy.data, mode, level])
  useEffect(() => {
    if (configuredWidget) {
      setMetrics(configuredWidget.query.metrics.map(metric => metric.key))
      setDimension(configuredWidget.query.dimensions[0]?.field ?? '')
      setGranularity(configuredWidget.query.dimensions[0]?.granularity ?? 'day')
    } else if (configuredDashboard) setMetrics([])
    // Every metric by default (the API accepts up to 30), so one comparison shows everything.
    else if (metricDefinitions.length && !metrics.length) setMetrics(metricDefinitions.slice(0, 30).map(metric => metric.key))
  }, [configuredDashboard?.id, configuredWidget?.id, configuredWidget?.revision, metadata.data])
  useEffect(() => { if (!canBreakdown) setDimension('') }, [canBreakdown])
  const allowedMetrics = metrics.filter(key => selectableMetrics.some(metric => metric.key === key))
  const buildRequest = (): AnalyticsComparisonRequest | null => {
    if (!own || (canSelectPeer && (!peer || own === peer)) || !allowedMetrics.length) return null
    const query = configuredWidget?.query
    const inherit = configuredWidget?.inherit_global_filters !== false
    const inheritedFilters = inherit ? [...comparisonInheritedFilters(filters, metadata.data?.filter_fields ?? [], level), ...customFilters.queryFilters] : []
    return ({ level, own_id: own, ...(canSelectPeer ? { peer_id: peer } : {}), ...(department && level !== 'CATEGORY' ? { context_department_id: department } : {}), ...(category && level === 'CREW' ? { context_category: category } : {}), query: { metrics: allowedMetrics.map(key => ({ key })), dimensions: canBreakdown ? configuredWidget ? query?.dimensions ?? [] : dimension ? [{ field: dimension, ...(dimension === 'date' ? { granularity } : {}) }] : [] : [], date_range: configuredWidget?.date_mode === 'USE_FIXED_DATE' && query?.date_range ? query.date_range : { from: filters.date_from, to: filters.date_to }, filters: [...(inherit ? configuredDashboard?.global_filters ?? [] : []), ...(query?.filters ?? []), ...(configuredWidget?.fixed_filters ?? []), ...inheritedFilters], sort: query?.sort ?? [], top_n: query?.top_n ?? null, data_scope: 'USER_SCOPE' } })
  }
  // Recalculate as soon as the selection is complete or changes; no separate submit step.
  const draftRequest = mode === 'pair' ? buildRequest() : null
  const draftKey = JSON.stringify(draftRequest)
  useEffect(() => { setRequest(draftRequest) }, [draftKey])
  const areaField = level === 'CATEGORY' ? 'category' : level === 'BBAK' ? 'department_id' : 'team_id'
  const buildAreaRequest = (): QueryRequest | null => {
    if (mode !== 'all' || !allowedMetrics.length) return null
    const query = configuredWidget?.query
    const inherit = configuredWidget?.inherit_global_filters !== false
    // Department and purpose are rating groups here, not filters; the BBAK choice only highlights crews.
    // Flights are always loaded: they set the activity threshold for rating rates.
    const keys = [...allowedMetrics.slice(0, 30), ...(metricDefinitions.some(metric => metric.key === 'flights') && !allowedMetrics.slice(0, 30).includes('flights') ? ['flights'] : [])].slice(0, 30)
    return { metrics: keys.map(key => ({ key })), dimensions: [...(level === 'CATEGORY' ? [] : [{ field: areaField }]), { field: 'category' }, { field: 'purpose' }], date_range: configuredWidget?.date_mode === 'USE_FIXED_DATE' && query?.date_range ? query.date_range : { from: filters.date_from, to: filters.date_to }, filters: [...(inherit ? configuredDashboard?.global_filters ?? [] : []), ...(query?.filters ?? []), ...(configuredWidget?.fixed_filters ?? []), ...(inherit ? [...comparisonInheritedFilters(filters, metadata.data?.filter_fields ?? [], level), ...customFilters.queryFilters] : [])], data_scope: 'USER_SCOPE' }
  }
  const areaRequest = buildAreaRequest()
  // Per purpose: defines each area's missions. Totals: the values that are rated.
  const areas = useQuery({ queryKey: ['bi-comparison', 'areas', areaRequest], queryFn: ({ signal }) => biApi.query(areaRequest!, signal), enabled: areaRequest !== null })
  const totalsRequest = areaRequest ? { ...areaRequest, dimensions: areaRequest.dimensions.filter(item => item.field !== 'purpose') } : null
  const areaTotals = useQuery({ queryKey: ['bi-comparison', 'area-totals', totalsRequest], queryFn: ({ signal }) => biApi.query(totalsRequest!, signal), enabled: totalsRequest !== null })
  // A mission made of several purposes (free hunting + dynamic strike = strike) is
  // calculated by its own query: its rates cannot be added up from the purposes.
  const combinedMissions = useMemo(() => [...missionParts((areas.data?.rows ?? []).map(row => String(row.purpose ?? '')))].filter(([, parts]) => parts.length > 1), [areas.data])
  const missionQueries = useQueries({ queries: combinedMissions.map(([mission, parts]) => {
    const request = totalsRequest ? { ...totalsRequest, filters: [...(totalsRequest.filters ?? []), { field: 'purpose', operator: 'in' as const, value: parts }] } : null
    return { queryKey: ['bi-comparison', 'area-mission', mission, request], queryFn: ({ signal }: { signal: AbortSignal }) => biApi.query(request!, signal), enabled: request !== null }
  }) })
  const areasFetching = areas.isFetching || areaTotals.isFetching || missionQueries.some(query => query.isFetching)
  const areasError = areas.error ?? areaTotals.error ?? missionQueries.find(query => query.error)?.error ?? null
  const refetchAreas = () => { void areas.refetch(); void areaTotals.refetch(); missionQueries.forEach(query => void query.refetch()) }
  const missionData = missionQueries.every(query => query.data) ? missionQueries.map(query => query.data!) : null
  const missionVersion = missionQueries.map(query => query.dataUpdatedAt).join()
  const areaMetrics = useMemo(() => allowedMetrics.slice(0, 30).flatMap(key => { const definition = metricDefinitions.find(metric => metric.key === key); return definition ? [{ key, title: definition.title, format: definition.format, percent: definition.format?.type === 'percent' || definition.format?.type === 'percentage', rate: isRateMetric(definition), direction: normalizeDirection(definition.direction) }] : [] }), [JSON.stringify(allowedMetrics), metadata.data])
  const missionGroups = useMemo(() => {
    if (!areas.data || !areaTotals.data || !missionData) return null
    const values = (row: Record<string, unknown>) => Object.fromEntries(areaMetrics.map(metric => [metric.key, row[metric.key] as number | null]).concat([['flights', row.flights as number | null]]))
    // At department level the departments themselves are compared, in one block.
    const department = (row: Record<string, unknown>) => level === 'CATEGORY' ? '' : String(row.category ?? '')
    return analyzeMissionGroups(
      areaTotals.data.rows.filter(row => row[areaField] != null).map(row => ({ id: String(row[areaField]), category: department(row), values: values(row) })),
      missionRows(
        areas.data.rows.filter(row => row[areaField] != null).map(row => ({ id: String(row[areaField]), category: department(row), purpose: String(row.purpose ?? ''), values: values(row) })),
        new Map(combinedMissions.map(([mission], index) => [mission, missionData[index].rows.filter(row => row[areaField] != null).map(row => ({ id: String(row[areaField]), category: department(row), values: values(row) }))])),
      ),
      areaMetrics,
    )
  }, [areas.data, areaTotals.data, missionVersion, areaMetrics, areaField, level])
  const departmentLabel = (id: string) => categories.find(option => option.id === id)?.title ?? (id || tr('Кафедру не вказано', 'No department'))
  const areaLabel = (id: string) => (level === 'CREW' ? hierarchy.data?.teams.find(team => team.id === id) : allOptions.find(option => option.id === id))?.title ?? areas.data?.dimension_labels?.[id] ?? id
  // Crew context shown next to each crew: its BBAK(s) and department(s).
  const crewContext = useMemo(() => {
    const context = new Map<string, { departments: Set<string>; categories: Set<string> }>()
    const entry = (id: string) => context.get(id) ?? context.set(id, { departments: new Set(), categories: new Set() }).get(id)!
    for (const team of hierarchy.data?.teams ?? []) if (team.department_id) entry(team.id).departments.add(team.department_id)
    for (const crew of hierarchy.data?.crews ?? []) { if (crew.category) entry(crew.id).categories.add(crew.category); if (crew.department_id) entry(crew.id).departments.add(crew.department_id) }
    return context
  }, [hierarchy.data])
  const areaTags = level === 'CREW' ? (id: string) => [...(crewContext.get(id)?.departments ?? [])].map(item => departments.find(option => option.id === item)?.title ?? item) : undefined
  const highlighted = level === 'CREW' && department ? (id: string) => Boolean(crewContext.get(id)?.departments.has(department)) : undefined
  // Parameters written into downloaded files, so a saved comparison is self-explanatory.
  const usedRange = configuredWidget?.date_mode === 'USE_FIXED_DATE' && configuredWidget.query.date_range ? configuredWidget.query.date_range : { from: filters.date_from, to: filters.date_to }
  const appliedFilters = Object.entries(FILTER_NAMES).flatMap(([key, name]) => { const values = filters[key as keyof FilterState]; return Array.isArray(values) && values.length ? [`${name}: ${values.join(', ')}`] : [] }).concat(customFilters.queryFilters.length ? [`${tr('Власні фільтри', 'Custom filters')}: ${customFilters.queryFilters.length}`] : [])
  const exportMeta: Array<[string, string]> = [
    [tr('Період', 'Period'), `${usedRange.from}${filters.time_from ? ` ${filters.time_from}` : ''} — ${usedRange.to}${filters.time_to ? ` ${filters.time_to}` : ''}`],
    [tr('Рівень', 'Level'), levels.find(item => item.key === level)?.title ?? level],
    ...(level === 'CREW' || (level === 'BBAK' && mode === 'all') ? [[tr('Кафедра', 'Department'), category ? categories.find(item => item.id === category)?.title ?? category : tr('Усі', 'All')] as [string, string]] : []),
    ...(level === 'CREW' && department ? [[mode === 'all' ? tr('Підсвічений ББАК', 'Highlighted BBAK') : tr('ББАК', 'BBAK'), departments.find(item => item.id === department)?.title ?? department] as [string, string]] : []),
    ...(configuredDashboard ? [[tr('Набір показників', 'Metric preset'), `${configuredDashboard.name}${configuredWidget ? ` / ${configuredWidget.title}` : ''}`] as [string, string]] : []),
    [tr('Фільтри', 'Filters'), appliedFilters.join('; ') || tr('Без додаткових фільтрів', 'No extra filters')],
  ]
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
  const pairDocument = (): ExportDocument | null => {
    if (!result || !request) return null
    const dims = request.query.dimensions.map(item => ({ key: item.field, title: dimensions.find(dimension => dimension.field === item.field)?.title ?? item.field }))
    const ownTitle = owns.find(item => item.id === request.own_id)?.title ?? request.own_id, peerTitle = allOptions.find(item => item.id === request.peer_id)?.title ?? request.peer_id ?? tr('обрана сервером', 'server selected')
    return {
      title: `${tr('Порівняння', 'Comparison')}: ${ownTitle} ↔ ${peerTitle}`, createdAt: new Date().toISOString(),
      meta: [...exportMeta, [tr('Власна область', 'Own area'), ownTitle], [tr('Порівняно з', 'Compared with'), peerTitle], [tr('Точність', 'Precision'), String(result.precision ?? '')]],
      notes: [result.raw_visible ? tr('Абсолютні показники обох областей доступні.', 'Absolute values of both areas are available.') : tr('Абсолютні показники іншої області приховано сервером; показано лише різницю.', 'Absolute peer values are hidden by the server; only the difference is shown.')],
      tables: [{ name: tr('Порівняння', 'Comparison'), columns: [...dims, { key: 'metric', title: tr('Показник', 'Metric') }, ...(result.raw_visible ? [{ key: 'own', title: ownTitle, kind: 'number' as const }, { key: 'peer', title: peerTitle, kind: 'number' as const }] : []), { key: 'difference', title: tr('Різниця', 'Difference') }, { key: 'status', title: tr('Стан', 'Status') }],
        rows: displayRows.map(row => [...dims.map(item => row[item.key] == null ? null : rowValue(row[item.key])), metricDefinitions.find(item => item.key === row.metric)?.title ?? rowValue(row.metric), ...(result.raw_visible ? [typeof row.own === 'number' ? row.own : null, typeof row.peer === 'number' ? row.peer : null] : []), difference(row), row.status === 'zero_baseline' ? tr('База дорівнює нулю', 'Zero baseline') : row.status === 'no_data' ? tr('Немає даних', 'No data') : row.direction === 'higher' ? tr('Більше', 'Higher') : row.direction === 'lower' ? tr('Менше', 'Lower') : row.direction === 'equal' ? tr('Рівно', 'Equal') : '—']) }],
    }
  }
  if (metadata.isPending || hierarchy.isPending || catalog.isPending || dashboards.isPending) return <div className="bi-state" role="status">{tr('Завантаження можливостей порівняння…', 'Loading comparison options…')}</div>
  if (metadata.isError || hierarchy.isError || catalog.isError || dashboards.isError) return <div className="bi-error-banner" role="alert">{metadata.error?.message || hierarchy.error?.message || catalog.error?.message || dashboards.error?.message}</div>
  if (!levels.length) return <div className="bi-state">{tr('Для цього облікового запису немає доступних рівнів порівняння.', 'No comparison levels are available for this account.')}</div>
  return <section className="bi-page" aria-label={tr('Порівняння', 'Comparison')}>
    <div className="bi-toolbar"><div><h2><GitCompareArrows size={18} /> {configuredDashboard?.name ?? tr('Порівняння показників', 'Compare metrics')}</h2><p>{configuredDashboard?.description || tr('Спільні метрики, серверні права доступу та область даних.', 'Shared metrics with server access checks and data scopes.')}</p></div></div>
    {configuredDashboard?.widgets.filter(widget => ['text', 'markdown'].includes(widget.visualization.type)).map(widget => <WidgetRenderer definition={widget} key={widget.id} />)}
    {configuredDashboard && !configuredWidgets.length && <p className="bi-notice">{tr('Для цієї сторінки ще не налаштовано набори метрик. Додайте набір показників в адмініструванні → Налаштування порівняння.', 'No metric presets have been configured for this page. Add a widget in the Comparison builder.')}</p>}
    <form className="bi-comparison-form" onSubmit={event => { event.preventDefault(); void (mode === 'all' ? refetchAreas() : comparison.refetch()) }}>
      {Boolean(dashboards.data?.length) && <label>{tr('Конфігурація сторінки', 'Page configuration')}<select value={configuredDashboard?.id ?? ''} onChange={event => { setPresetDashboardId(event.target.value); setPresetWidgetId(''); setRequest(null) }}>{dashboards.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {configuredWidgets.length > 0 && <label>{tr('Набір показників', 'Metric preset')}<select value={configuredWidget?.id ?? ''} onChange={event => { setPresetWidgetId(event.target.value); setRequest(null) }}>{configuredWidgets.map(widget => <option value={widget.id} key={widget.id}>{widget.title}</option>)}</select></label>}
      {fullAccess && <div className="bi-comparison-mode" role="group" aria-label={tr('Вид порівняння', 'Comparison view')}><button type="button" className={mode === 'all' ? 'active' : ''} aria-pressed={mode === 'all'} onClick={() => setView('all')}>{tr('Усі області', 'All areas')}</button><button type="button" className={mode === 'pair' ? 'active' : ''} aria-pressed={mode === 'pair'} onClick={() => setView('pair')}>{tr('Дві області детально', 'Two areas in detail')}</button></div>}
      <label>{tr('Рівень', 'Level')}<select value={level} onChange={event => setLevel(event.target.value as Level)}>{levels.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}</select></label>
      {(level === 'CREW' || (level === 'BBAK' && mode === 'all')) && <label>{tr('Кафедра', 'Department')}<select value={category} onChange={event => setCategory(event.target.value)}><option value="">{mode === 'all' ? tr('Усі кафедри', 'All departments') : tr('Оберіть кафедру', 'Choose a department')}</option>{categories.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
      {level === 'CREW' && <label>{mode === 'all' ? tr('Підсвітити ББАК', 'Highlight BBAK') : tr('ББАК', 'BBAK')}<select value={department} onChange={event => setDepartment(event.target.value)}><option value="">{mode === 'all' ? tr('Не підсвічувати', 'No highlight') : tr('Усі дозволені ББАК', 'All permitted BBAKs')}</option>{departments.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
      {mode === 'pair' && <label>{tr('Власна область', 'Own area')}<select value={own} onChange={event => setOwn(event.target.value)}><option value="">{tr('Оберіть', 'Select')}</option>{owns.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
}
      {mode === 'pair' && (canSelectPeer ? <label>{tr('Порівняти з', 'Compare with')}<select value={peer} onChange={event => setPeer(event.target.value)}><option value="">{tr('Оберіть', 'Select')}</option>{peers.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label> : <p className="bi-notice">{tr('Область для порівняння обирає сервер.', 'The server selects the peer area.')}</p>)}
      <label>{tr('Метрики', 'Metrics')}<select multiple value={metrics} onChange={event => setMetrics([...event.target.selectedOptions].map(option => option.value))}>{selectableMetrics.map(metric => <option key={metric.key} value={metric.key}>{metric.title}</option>)}</select></label>
      {mode === 'pair' && canBreakdown && (configuredWidget ? <p className="bi-notice">{tr('Розрізи конфігурації', 'Configured dimensions')}: {configuredWidget.query.dimensions.map(item => `${dimensions.find(dimension => dimension.field === item.field)?.title ?? item.field}${item.granularity ? ` (${item.granularity})` : ''}`).join(', ') || tr('Загалом', 'Overall')}</p> : <label>{tr('Розріз', 'Dimension')}<select value={dimension} onChange={event => setDimension(event.target.value)}><option value="">{tr('Загалом', 'Overall')}</option>{dimensions.map(item => <option key={item.field} value={item.field}>{item.title}</option>)}</select></label>)}
      {mode === 'pair' && canBreakdown && !configuredWidget && dimension === 'date' && <label>{tr('Період', 'Period')}<select value={granularity} onChange={event => setGranularity(event.target.value)}><option value="day">{tr('День', 'Day')}</option><option value="week">{tr('Тиждень', 'Week')}</option><option value="month">{tr('Місяць', 'Month')}</option><option value="quarter">{tr('Квартал', 'Quarter')}</option></select></label>}
      <button type="submit" className="secondary" disabled={mode === 'all' ? areasFetching || !areaRequest : comparison.isFetching || !request}><RefreshCw size={14} className={(mode === 'all' ? areasFetching : comparison.isFetching) ? 'spin' : ''} /> {tr('Оновити', 'Refresh')}</button>
    </form>
    {mode === 'all' && <>{!missionGroups && !areasError && areaRequest && <p className="bi-state" role="status">{tr('Розрахунок порівняння…', 'Calculating comparison…')}</p>}{areasError && <div className="bi-error-banner" role="alert">{areasError.message} <button className="secondary" type="button" onClick={refetchAreas}><RefreshCw size={14} /> {tr('Повторити', 'Retry')}</button></div>}{missionGroups && <AreaGroups key={level} departments={category ? missionGroups.departments.filter(item => item.category === category) : missionGroups.departments} missions={missionGroups.missions} metrics={areaMetrics} label={areaLabel} departmentLevel={level === 'CATEGORY'} departmentLabel={departmentLabel} tags={areaTags} highlighted={highlighted} exportMeta={exportMeta} exportTitle={`${tr('Порівняння', 'Comparison')}: ${levels.find(item => item.key === level)?.title ?? level}`} />}</>}
    {mode === 'pair' && !owns.length && <p className="bi-notice">{tr('Немає власної області для цього рівня. Перевірте призначені права та область даних.', 'No own area is available at this level. Check your assigned permissions and data scope.')}</p>}
    {mode === 'pair' && request && comparison.isPending && <p className="bi-state" role="status">{tr('Розрахунок порівняння…', 'Calculating comparison…')}</p>}
    {mode === 'pair' && comparison.isError && <div className="bi-error-banner" role="alert">{comparison.error.message} <button className="secondary" type="button" onClick={() => void comparison.refetch()}><RefreshCw size={14} /> {tr('Повторити', 'Retry')}</button></div>}
    {mode === 'pair' && result && <>{displayRows.length > 0 && <div className="bi-export-row"><span>{tr('Завантажити це порівняння', 'Download this comparison')}</span><ExportControl document={pairDocument} fileName="analytics-pair-comparison" disabled={comparison.isFetching} /></div>}<p className="bi-notice">{result.raw_visible ? tr('Доступні абсолютні показники обох областей.', 'Absolute values are available for both areas.') : tr('Доступна лише дозволена сервером різниця. Абсолютні показники іншої області приховано.', 'Only the server permitted difference is available. Absolute peer values are hidden.')} {tr('Точність', 'Precision')}: {result.precision}</p>{!displayRows.length ? <p className="bi-state">{tr('Немає даних для порівняння.', 'No comparison data.')}</p> : <div className="bi-table-scroll"><table className="bi-table"><thead><tr>{request?.query.dimensions.map(item => <th key={item.field}>{dimensions.find(dimensionItem => dimensionItem.field === item.field)?.title ?? item.field}</th>)}<th>{tr('Метрика', 'Metric')}</th>{result.raw_visible && <><th>{tr('Власна область', 'Own area')}</th><th>{tr('Інша область', 'Peer area')}</th></>}<th>{tr('Різниця', 'Difference')}</th><th>{tr('Стан', 'Status')}</th></tr></thead><tbody>{displayRows.map((row, index) => {
      const metric = metricDefinitions.find(item => item.key === row.metric)
      return <tr key={index}>{request?.query.dimensions.map(item => <td key={item.field}>{rowValue(row[item.field])}</td>)}<td>{metric?.title ?? rowValue(row.metric)}</td>{result.raw_visible && <><td>{formatWidgetValue(row.own, metric?.format, locale)}</td><td>{formatWidgetValue(row.peer, metric?.format, locale)}</td></>}<td>{difference(row)}</td><td>{row.status === 'zero_baseline' ? tr('База дорівнює нулю', 'Zero baseline') : row.status === 'no_data' ? tr('Немає даних', 'No data') : row.direction === 'higher' ? '↑' : row.direction === 'lower' ? '↓' : row.direction === 'equal' ? '=' : '—'}</td></tr>
    })}</tbody></table></div>}</>}
  </section>
}
