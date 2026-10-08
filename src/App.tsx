import { ChevronDown, Download, LogOut, RefreshCcw, Search, SlidersHorizontal, X } from 'lucide-react'
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Sidebar, type PageId } from './components/Sidebar'
import { FilterBar } from './components/FilterBar'
import { ALL_COLUMNS, EventsTable, columnLabel, type ColumnKey } from './components/EventsTable'
import { api } from './lib/api'
import type { ComparisonFilterSettings, ComparisonRequest, EventRow, FilterOptions, FilterState, GeoFeatureCollection, IdTitleOption, SourceStatus } from './lib/types'
import { buildComparisonRequest } from './lib/comparisonSetup'
import { PwaInstallButton } from './components/PwaInstallButton'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { useLanguage } from './i18n/LanguageContext'
import { getFrontendConfig } from './config'
import { useAppConfiguration } from './config/AppConfigurationContext'
import { configuredFilterLabel, configurationLabel, getAppConfiguration, type AppConfiguration } from './config/appConfiguration'
import { useAuth } from './config/AuthContext'
import './components/Accounts.css'
import type { QueryFilter } from './lib/biTypes'
import { biApi } from './lib/biApi'

// Route-level code splitting: heavy pages (ECharts, MapLibre, admin UI) load on demand.
const MapPanel = lazy(() => import('./components/MapPanel').then(m => ({ default: m.MapPanel })))
const AdministrationPage = lazy(() => import('./components/AdministrationPage').then(m => ({ default: m.AdministrationPage })))
const ComparisonPage = lazy(() => import('./components/ComparisonPage').then(m => ({ default: m.ComparisonPage })))
const IntegratedAnalyticsPage = lazy(() => import('./components/analytics/IntegratedAnalyticsPage').then(m => ({ default: m.IntegratedAnalyticsPage })))
const BIComparison = lazy(() => import('./components/bi/BIComparison').then(m => ({ default: m.BIComparison })))

const isoLocal = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultFilters(): FilterState {
  const { calendar_anchor_hour } = getFrontendConfig().app.defaults
  const { date_range_days } = getAppConfiguration().defaults
  const end = new Date(); end.setHours(calendar_anchor_hour, 0, 0, 0)
  const start = new Date(end); start.setDate(end.getDate() - Math.max(date_range_days - 1, 0))
  return {
    date_from: isoLocal(start),
    date_to: isoLocal(end),
    direction: [],
    unit: [],
    category: [],
    asset: [],
    group: [],
    bbak: [],
    rota: [],
    battalion: [],
    purpose: [],
    class_name: [],
    result: [],
  }
}

function normalizeFilters(filters: Partial<FilterState>): FilterState {
  const base = defaultFilters()

  return {
    ...base,
    ...filters,
    direction: [...(filters.direction ?? [])],
    unit: [...(filters.unit ?? [])],
    category: [...(filters.category ?? [])],
    asset: [...(filters.asset ?? [])],
    group: [...(filters.group ?? [])],
    bbak: [...(filters.bbak ?? [])],
    rota: [...(filters.rota ?? [])],
    battalion: [...(filters.battalion ?? [])],
    purpose: [...(filters.purpose ?? [])],
    class_name: [...(filters.class_name ?? [])],
    result: [...(filters.result ?? [])],
  }
}

function defaultComparisonSettings(filters: FilterState): ComparisonFilterSettings {
  return {
    enabled: false,
    mode: getAppConfiguration().defaults.comparison_mode,
    dimension: getAppConfiguration().filters.organization_dimension,
    granularity: getAppConfiguration().defaults.comparison_granularity,
    reference: 'previous',
    reference_period: { date_from: filters.date_from, date_to: filters.date_to },
  }
}


const pageInfo: Record<
  PageId,
  {
    title: [string, string]
    subtitle: [string, string]
  }
> = {
  dashboard: {
    title: ['Дашборд', 'Dashboard'],
    subtitle: [
      'Оперативний огляд за вибраними фільтрами',
      'Overview for the selected filters',
    ],
  },
  statistics: {
    title: ['Статистика', 'Statistics'],
    subtitle: [
      'Підсумки та зрізи за поточною вибіркою',
      'Summaries and breakdowns for the current selection',
    ],
  },
  comparison: {
    title: ['Порівняння', 'Comparison'],
    subtitle: [
      'Порівняння періодів і підрозділів та експорт підсумків',
      'Compare periods and units, and export summaries',
    ],
  },
  map: {
    title: ['Карта', 'Map'],
    subtitle: [
      'Карта без відображення точних координат у Viewer-режимі',
      'Map view for the current selection',
    ],
  },
  table: {
    title: ['Таблиця', 'Table'],
    subtitle: ['Детальний перегляд записів', 'Detailed record view'],
  },
  personal: {
    title: ['Мій дашборд', 'My dashboard'],
    subtitle: ['Системні віджети та власна аналітика', 'System widgets and your own analytics'],
  },
  dictionaries: {
    title: ['Довідники', 'Dictionaries'],
    subtitle: [
      'Перегляд доступних значень фільтрів',
      'Available filter values',
    ],
  },
  settings: {
    title: ['Налаштування', 'Settings'],
    subtitle: [
      'Персональні параметри інтерфейсу',
      'Personal interface settings',
    ],
  },
  administration: {
    title: ['Адміністрування', 'Administration'],
    subtitle: ['Спільні налаштування застосунку, чернетки та історія змін', 'Shared application settings, drafts and change history'],
  },
}

function pageFromHash(): PageId {
  const rawHash = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  const raw = (rawHash === 'saved' ? 'personal' : rawHash) as PageId
  const config = getAppConfiguration()
  const defaultPage = config.appearance.default_page as PageId
  return pageInfo[raw] && (raw === 'administration' || raw === 'personal' || config.appearance.menu.includes(raw)) ? raw : (pageInfo[defaultPage] ? defaultPage : 'dashboard')
}

function aggregate(rows: EventRow[], key: keyof EventRow) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const value = String(row[key] ?? '—')
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

function matchesSearch(row: EventRow, term: string) {
  if (!term.trim()) return true
  const q = term.trim().toLowerCase()
  return [row.id, row.timestamp, row.direction, row.unit, row.category, row.asset, row.group, row.purpose, row.class_name, row.result, row.grid_ref]
    .some((v) => String(v).toLowerCase().includes(q))
}

function csvEscape(value: unknown) {
  const raw = String(value ?? '')
  const s = /^[=+\-@\t\r]/.test(raw) ? "'"+raw : raw
  return `"${s.replaceAll('"', '""')}"`
}

function exportCsv(rows: EventRow[], columnKeys: ColumnKey[], config: AppConfiguration) {
  const columns = columnKeys.flatMap(key => ALL_COLUMNS.find(column => column.key === key) ?? [])
  const header = columns.map((c) => csvEscape(configuredFilterLabel(config, c.key, c.label))).join(',')
  const body = rows.map((row) => columns.map((c) => csvEscape(c.key === 'timestamp' ? row.timestamp.replace('T', ' ') : configurationLabel(config, c.key, String(row[c.key])))).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${header}\n${body}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `analytics-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}


export default function App() {
  const { tr } = useLanguage()
  const { config, publishedConfig, isPreview, clearPreview } = useAppConfiguration()
  const auth = useAuth()
  const queryClient = useQueryClient()
  const comparisonFetching = useIsFetching({ queryKey: ['comparison'] })
  const [page, setPage] = useState<PageId>(pageFromHash())
  const [statisticsSection, setStatisticsSection] = useState(() => new URLSearchParams(window.location.hash.split('?')[1]).get('section') ?? 'overview')
  const [drillFilters, setDrillFilters] = useState<QueryFilter[]>([])
  const [filters, setFilters] = useState<FilterState>(defaultFilters())
  const [comparisonTab, setComparisonTab] = useState<'areas' | 'periods' | 'units_over_time'>('areas')
  const [comparisonSettings, setComparisonSettings] = useState<ComparisonFilterSettings>(() => defaultComparisonSettings(filters))
  const [appliedComparisonRequest, setAppliedComparisonRequest] = useState<ComparisonRequest | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const appConfig = getFrontendConfig().app
  const uiConfig = getFrontendConfig().ui
  const [density, setDensityState] = useState<'comfortable' | 'compact'>(() => localStorage.getItem('analytics-ui-density') === 'compact' ? 'compact' : 'comfortable')
  const setDensity = (value: 'comfortable' | 'compact') => {
    localStorage.setItem('analytics-ui-density', value); setDensityState(value)
  }
  const queryFilters = filters

  const filterKey = useMemo(
    () => JSON.stringify(queryFilters),
    [queryFilters],
  )
  const kpiKey = useMemo(() => JSON.stringify(publishedConfig.kpi), [publishedConfig.kpi])
  const hasKpiPreviewChanges = isPreview && JSON.stringify(config.kpi) !== kpiKey

  const source = useQuery({ queryKey: ['source-status'], queryFn: api.sourceStatus, refetchInterval: appConfig.query.source_status_refetch_ms })
  const biMetadata = useQuery({ queryKey: ['bi-metadata'], queryFn: ({ signal }) => biApi.metadata(signal), retry: false, refetchInterval: 30000 })
  const previousBiAccess = useRef<string | null>(null)
  const previousBiConfiguration = useRef<string | null>(null)
  useEffect(() => {
    if (!biMetadata.data) return
    const signature = JSON.stringify([biMetadata.data.access_revision, biMetadata.data.permissions, biMetadata.data.data_scope])
    const configuration = JSON.stringify([biMetadata.data.configuration_revision])
    const accessChanged = previousBiAccess.current !== null && previousBiAccess.current !== signature
    const configurationChanged = previousBiConfiguration.current !== null && previousBiConfiguration.current !== configuration
    previousBiAccess.current = signature
    previousBiConfiguration.current = configuration
    if (accessChanged || configurationChanged) {
      // Refresh administrative definitions without discarding the active form when
      // another user's access changes. Revoking our own access still clears all data.
      const sensitive = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== 'bi-metadata' && query.queryKey[0] !== 'source-status' && (accessChanged || query.queryKey[0] !== 'bi-admin') }
      void queryClient.cancelQueries(sensitive).then(() => queryClient.resetQueries(sensitive))
      if (!accessChanged) void queryClient.invalidateQueries({ queryKey: ['bi-admin'] })
    }
  }, [biMetadata.data, queryClient])
  const permissions = biMetadata.data?.permissions
  const permitted = (permission: string) => !permissions || permissions.includes('*') || permissions.includes(permission)
  const pagePermission: Partial<Record<PageId, string>> = { dashboard: 'dashboard.view', statistics: 'statistics.view', personal: 'personal_dashboard.view', comparison: 'comparison.view', map: 'dashboard.view', table: 'statistics.view', dictionaries: 'metric.view', administration: auth.enabled ? 'analytics.admin' : undefined }
  const pageAllowed = !pagePermission[page] || permitted(pagePermission[page]!)
  const needsOptions = ['dashboard', 'statistics', 'personal', 'comparison', 'map', 'table', 'dictionaries'].includes(page)
  const needsEvents = ['map', 'table'].includes(page) && pageAllowed
  const needsMap = page === 'map' && pageAllowed

  const options = useQuery({ queryKey: ['options'], queryFn: api.options, enabled: needsOptions })
  const events = useQuery({ queryKey: ['events', filterKey], queryFn: () => api.events(queryFilters), enabled: needsEvents })
  const mapData = useQuery({ queryKey: ['map', filterKey], queryFn: () => api.map(queryFilters), enabled: needsMap })
  const integratedFetching = useIsFetching({ queryKey: ['integrated-query'] })
  const biComparisonFetching = useIsFetching({ queryKey: ['bi-comparison'] })
  const busy = events.isFetching || mapData.isFetching || comparisonFetching > 0 || integratedFetching > 0 || biComparisonFetching > 0

  useEffect(() => {
    const onHash = () => { setPage(pageFromHash()); setStatisticsSection(new URLSearchParams(window.location.hash.split('?')[1]).get('section') ?? 'overview') }
    window.addEventListener('hashchange', onHash)
    if (!window.location.hash) window.history.replaceState(null, '', `#/${getAppConfiguration().appearance.default_page}`)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.density = density
  }, [density])
  useEffect(() => {
    setComparisonSettings(current => current.enabled ? current : { ...current, mode: config.defaults.comparison_mode, dimension: config.filters.organization_dimension, granularity: config.defaults.comparison_granularity })
  }, [config.defaults.comparison_mode, config.defaults.comparison_granularity, config.filters.organization_dimension])
  useEffect(() => {
    if (page === 'administration' && auth.enabled && auth.user?.role !== 'administrator' && biMetadata.isSuccess && !permissions?.includes('analytics.admin')) {
      const next = config.appearance.default_page as PageId
      setPage(next); window.location.hash = `/${next}`; return
    }
    if (page !== 'administration' && page !== 'personal' && !config.appearance.menu.includes(page)) {
      const next = config.appearance.default_page as PageId
      setPage(next)
      window.location.hash = `/${next}`
    }
  }, [config.appearance.menu, config.appearance.default_page, page, auth.enabled, auth.user?.role, permissions, biMetadata.isSuccess])

  const navigate = (next: PageId) => {
    setDrillFilters([])
    if (next === 'comparison') {
      setFilters(normalizeFilters(queryFilters))
      setComparisonSettings(current => ({ ...current, enabled: true }))
      setAppliedComparisonRequest(null)
    }
    window.location.hash = `/${next}`
    setPage(next)
  }
  const applyAnalyticsFilters = (nextFilters: FilterState, nextSettings: ComparisonFilterSettings) => {
    const nextRequest = buildComparisonRequest(nextSettings, nextFilters)
    setFilters(normalizeFilters(nextFilters))
    setComparisonSettings(nextSettings)
    setAppliedComparisonRequest(nextRequest)
    if (nextSettings.enabled || page === 'comparison') {
      const nextPage = nextSettings.enabled ? 'comparison' : 'statistics'
      window.location.hash = `/${nextPage}`
      setPage(nextPage)
    }
  }
  const analyticsComparisonSettings = { ...comparisonSettings, enabled: false }
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['integrated-query'] })
    void queryClient.invalidateQueries({ queryKey: ['bi-dashboard-query'] })
    void queryClient.invalidateQueries({ queryKey: ['bi-comparison'] })
    if (needsEvents) events.refetch()
    if (needsMap) mapData.refetch()
    if (page === 'comparison') queryClient.invalidateQueries({ queryKey: ['comparison'] })
  }
  const rows = useMemo(() => (events.data || []).filter((row) => matchesSearch(row, searchTerm)), [events.data, searchTerm])
  const info = pageInfo[page]
  const analyticsError = events.error || mapData.error
  const analyticsErrorMessage = analyticsError instanceof Error
    ? analyticsError.message
    : analyticsError
      ? String(analyticsError)
      : ''

  return (
    <div className="app-shell">
      <Sidebar active={page} onNavigate={navigate} permissions={permissions} />
      <main className={`main-area${page === 'comparison' ? ' main-area--comparison' : ''}`}>
        <header className="topbar">
          <div><h1>{tr(...info.title)}</h1><p>{tr(...info.subtitle)}</p></div>
          <div className="top-actions">
            <div className={'data-status' + (source.data?.connected === false ? ' data-status--bad' : '')} role="status" title={source.data?.connected === false ? source.data.message : undefined}><span className={source.data?.connected === false ? 'online-dot offline' : 'online-dot'} /><span className="data-status__text">{busy ? tr('Оновлення…', 'Updating…') : (source.data?.connected === false ? tr('Джерело недоступне', 'Source unavailable') : tr('Дані актуальні', 'Up to date'))}</span><span className="demo-chip">{uiConfig.source_labels[source.data?.source || ''] || source.data?.source || '—'}</span></div>
          <LanguageSwitcher />
            <PwaInstallButton />
            <label className="search"><Search size={17} /><input type="search" aria-label={tr('Пошук у поточній вибірці', 'Search current selection')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={tr('Пошук у поточній вибірці...', 'Search current selection...')} />{searchTerm && <button type="button" title={tr('Очистити', 'Clear')} aria-label={tr('Очистити пошук', 'Clear search')} onClick={() => setSearchTerm('')}><X size={14} /></button>}</label>
            <button className="icon-button" title={tr('Оновити дані', 'Refresh data')} aria-label={tr('Оновити дані', 'Refresh data')} onClick={refresh}><RefreshCcw className={busy ? 'spin' : ''} size={18} /></button>
            <AccountProfile onSettings={() => navigate('personal')} onLogout={async () => { clearPreview(); await auth.logout() }} />
          </div>
        </header>
        {source.data?.connected === false && <div className="refresh-row refresh-row--bad" role="alert"><span className="online-dot offline" />{`${tr('Джерело недоступне', 'Data source unavailable')}: ${source.data.message}`}</div>}
        {isPreview && <div className="configuration-preview-banner" role="status"><span>{tr('Попередній перегляд чернетки. Зміни ще не опубліковано.', 'Draft preview. Changes have not been published yet.')}{hasKpiPreviewChanges && <small>{tr(' Аналітика використовує опубліковані формули. Розрахунок чернетки доступний в адмініструванні → Розрахунок KPI.', ' Analytics uses published formulas. Calculate the draft in Administration → KPI calculation.')}</small>}</span><button className="secondary" onClick={() => navigate('administration')}>{tr('До налаштувань', 'Back to settings')}</button><button className="secondary" onClick={clearPreview}>{tr('Завершити перегляд', 'End preview')}</button></div>}
        {analyticsErrorMessage && (page === 'map' || page === 'table') && (
          <div className="api-error-banner">
            <strong>{tr('Помилка завантаження аналітики', 'Analytics loading error')}</strong>
            <span>{analyticsErrorMessage}</span>
          </div>
        )}

        {!pageAllowed && <article className="panel settings-card" role="status">{tr('Адміністратор ще не надав доступ до цього розділу.', 'Your administrator has not granted access to this page.')}</article>}
        <Suspense fallback={<div className="page-loading" role="status" aria-busy="true">…</div>}>
        {pageAllowed && ['dashboard', 'statistics', 'personal'].includes(page) && <IntegratedAnalyticsPage key={page} page={page as 'dashboard' | 'statistics' | 'personal'} filters={filters} inheritedFilters={drillFilters} onClearInheritedFilters={() => setDrillFilters([])} section={statisticsSection} onSectionChange={section => { setStatisticsSection(section); window.history.replaceState(null, '', `#/statistics?section=${encodeURIComponent(section)}`) }} filterBar={<FilterBar filters={filters} options={options.data} onChange={next => { setFilters(next); setDrillFilters([]) }} mode={page === 'statistics' ? 'detailed' : 'general'} customFilters />} onNavigate={(next, nextFilters, section, extra) => { setFilters(normalizeFilters(nextFilters)); setDrillFilters(extra ?? []); setStatisticsSection(section ?? 'overview'); setPage(next); window.location.hash = `/${next}${next === 'statistics' ? `?section=${encodeURIComponent(section ?? 'overview')}` : ''}` }} />}
        {pageAllowed && page === 'comparison' && <><nav className="ia-sections" aria-label="Вид порівняння">{([['areas', 'Кафедри / ББАК / екіпажі'], ['periods', 'Періоди'], ['units_over_time', 'Підрозділи в часі']] as const).map(([key, label]) => <button key={key} className={`secondary${comparisonTab === key ? ' active' : ''}`} onClick={() => { setComparisonTab(key); if (key !== 'areas') setComparisonSettings(current => ({ ...current, enabled: true, mode: key })); setAppliedComparisonRequest(null) }}>{label}</button>)}</nav>{comparisonTab === 'areas' ? <><FilterBar filters={filters} options={options.data} onChange={setFilters} mode="detailed" customFilters /><BIComparison filters={filters} /></> : <ComparisonPage filters={filters} options={options.data} settings={{ ...comparisonSettings, enabled: true, mode: comparisonTab }} request={appliedComparisonRequest} onApply={applyAnalyticsFilters} />}</>}
        {pageAllowed && page === 'map' && <MapPage filters={filters} setFilters={setFilters} options={options.data} rows={rows} geojson={mapData.data} />}
        {pageAllowed && page === 'table' && <TablePage filters={filters} setFilters={setFilters} options={options.data} rows={rows} />}
        {pageAllowed && page === 'dictionaries' && <DictionariesPage options={options.data} />}
        {page === 'settings' && <SettingsPage density={density} setDensity={setDensity} source={source.data} />}
        {pageAllowed && page === 'administration' && <AdministrationPage onPreview={() => navigate(config.appearance.default_page as PageId)} />}
        </Suspense>
      </main>
    </div>
  )
}

function AccountProfile({ onSettings, onLogout }: { onSettings: () => void; onLogout: () => Promise<void> }) {
  const { tr } = useLanguage()
  const auth = useAuth()
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); ref.current?.querySelector<HTMLButtonElement>('button')?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const name = auth.user?.display_name || tr('Користувач', 'User')
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toLocaleUpperCase()
  return <div className="account-profile-wrap" ref={ref}><button className="account-profile-button account-profile" type="button" aria-label={tr('Меню облікового запису', 'Account menu')} aria-expanded={open} onClick={() => setOpen(!open)}><span className="account-avatar">{initials}</span><span className="account-profile-name"><strong>{name}</strong><small>{auth.user?.role === 'administrator' ? tr('Адміністратор', 'Administrator') : tr('Особистий дашборд', 'Personal dashboard')}</small></span><ChevronDown size={15} /></button>{open && <div className="account-profile-menu"><small>{auth.user?.username || tr('Доступ ще не налаштовано', 'Account access has not been configured')}</small><button type="button" onClick={() => { setOpen(false); onSettings() }}><SlidersHorizontal size={15} />{tr('Мій дашборд', 'My dashboard')}</button>{auth.user && <button type="button" disabled={busy} onClick={() => { setBusy(true); setError(''); void onLogout().catch(reason => setError(reason instanceof Error ? reason.message : tr('Не вдалося вийти.', 'Could not sign out.'))).finally(() => setBusy(false)) }}><LogOut size={15} />{busy ? tr('Вихід…', 'Signing out…') : tr('Вийти', 'Sign out')}</button>}{error && <small className="account-error" role="alert">{error}</small>}</div>}</div>
}

function Breakdown({ title, data }: { title: string; data: [string, number][] }) {
  const { tr } = useLanguage()
  const max = Math.max(...data.map((x) => x[1]), 1)
  return <article className="panel breakdown-card"><div className="panel-head"><div><h2>{title}</h2><p>{tr('Поточна вибірка', 'Current selection')}</p></div></div><div className="breakdown-list">{data.slice(0, 8).map(([label, count]) => <div className="breakdown-row" key={label}><div className="breakdown-meta"><span>{label}</span><strong>{count}</strong></div><div className="progress-track"><span style={{ width: `${(count / max) * 100}%` }} /></div></div>)}</div></article>
}

function MapPage({ filters, setFilters, options, rows, geojson }: { filters: FilterState; setFilters: (f: FilterState) => void; options?: FilterOptions; rows: EventRow[]; geojson?: GeoFeatureCollection }) {
  const { tr } = useLanguage()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = rows.find((x) => x.id === selectedId) || null
  return <>
    <FilterBar
      filters={filters}
      options={options}
      onChange={setFilters}
      mode="general"
    />
    <section className="map-page-grid">
      <article className="panel full-map-panel"><div className="panel-head"><div><h2>{tr('Карта всієї вибірки', 'Selection map')}</h2><p>{tr('Точні координати у Viewer-режимі не відображаються', 'Current map selection')}</p></div><span className="badge">{tr('Кластери', 'Clusters')}</span></div><MapPanel geojson={geojson} rows={rows} selectedId={selectedId} onSelect={setSelectedId} /></article>
      <aside className="map-side-stack">
        <article className="panel"><div className="panel-head"><div><h2>{selected ? tr('Вибрана подія', 'Selected event') : tr('Підсумок', 'Summary')}</h2><p>{selected ? selected.id : tr('Видимі дані', 'Visible data')}</p></div>{selected && <button className="icon-button" onClick={() => setSelectedId(null)}><X size={16} /></button>}</div>
          {selected ? <div className="event-detail"><div className="grid-ref-card"><span>Grid ID</span><code>{selected.grid_ref}</code></div><Detail label={tr('Дата', 'Date')} value={selected.timestamp.replace('T',' ')} /><Detail label={tr('Підрозділ', 'Unit')} value={selected.unit} /><Detail label={tr('Тип / засіб', 'Type / asset')} value={`${selected.category} / ${selected.asset}`} /><Detail label={tr('Мета', 'Purpose')} value={selected.purpose} /><Detail label={tr('Результат', 'Result')} value={selected.result} /></div>
          : <div className="side-summary"><div><span>{tr('Подій', 'Events')}</span><strong>{rows.length}</strong></div><div><span>{tr('Позитивні', 'Positive')}</span><strong>{rows.filter((x) => x.result === 'Позитивний').length}</strong></div><div><span>{tr('Підрозділів', 'Units')}</span><strong>{new Set(rows.map((x) => x.unit)).size}</strong></div><div><span>{tr('Типів', 'Types')}</span><strong>{new Set(rows.map((x) => x.category)).size}</strong></div></div>}
        </article>
        <Breakdown title={tr('Точки за підрозділами', 'Points by unit')} data={aggregate(rows, 'unit')} />
      </aside>
    </section>
  </>
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="detail-row"><span>{label}</span><strong>{value}</strong></div> }

function TablePage({ filters, setFilters, options, rows }: { filters: FilterState; setFilters: (f: FilterState) => void; options?: FilterOptions; rows: EventRow[] }) {
  const { tr } = useLanguage()
  const { config } = useAppConfiguration()
  const [showColumns, setShowColumns] = useState(false)
  const [columns, setColumns] = useState<ColumnKey[]>(config.tables.columns as ColumnKey[])
  useEffect(() => { setColumns(config.tables.columns as ColumnKey[]) }, [config.tables.columns])
  const [selected, setSelected] = useState<EventRow | null>(null)
  const toggle = (key: ColumnKey) => setColumns((prev) => prev.includes(key) ? (prev.length > 1 ? prev.filter((x) => x !== key) : prev) : [...prev, key])
  return <>
    <FilterBar
      filters={filters}
      options={options}
      onChange={setFilters}
      mode="general"
    />
    <section className="table-toolbar">
      <div><strong>{rows.length}</strong><span> {tr('записів у вибірці', 'records in selection')}</span></div>
      <div className="toolbar-actions relative-actions"><button className="secondary" onClick={() => setShowColumns((x) => !x)}><SlidersHorizontal size={15} /> {tr('Колонки', 'Columns')}</button><button className="secondary" onClick={() => exportCsv(rows, columns, config)}><Download size={15} /> {tr('Експорт CSV', 'Export CSV')}</button>
        {showColumns && <div className="column-menu"><div className="column-menu-head"><strong>{tr('Колонки', 'Columns')}</strong><button onClick={() => setShowColumns(false)}><X size={15}/></button></div>{ALL_COLUMNS.map((c) => <label key={c.key}><input type="checkbox" checked={columns.includes(c.key)} onChange={() => toggle(c.key)} />{columnLabel(c.key, tr, config)}</label>)}</div>}
      </div>
    </section>
    <section className="panel table-page-panel"><EventsTable rows={rows} visibleColumns={columns} pageSize={config.tables.page_size} selectedId={selected?.id} onSelect={setSelected} /></section>
    {selected && <div className="selection-bar"><div><span>{tr('Вибрано', 'Selected')}:</span><strong>{selected.id}</strong><code>{selected.grid_ref}</code></div><button onClick={() => setSelected(null)}><X size={16}/></button></div>}
  </>
}

function DictionariesPage({ options }: { options?: FilterOptions }) {
  const { tr } = useLanguage()
  const { config } = useAppConfiguration()
  if (!options) return <section className="panel service-page">{tr('Завантаження довідників...', 'Loading dictionaries...')}</section>
  const groups: Array<[keyof FilterOptions, string]> = [
    ['direction', tr('Напрямки', 'Directions')],
    ['unit', tr('Зони відповідальності', 'Responsibility zones')],
    ['category', tr('Кафедри', 'Departments')],
    ['asset', tr('Засоби', 'Assets')],
    ['group', tr('Екіпажі', 'Crews')],
    ['bbak', tr('ББАК', 'BBAK')],
    ['rota', tr('Роти екіпажів', 'Crew companies')],
    ['purpose', tr('Мета', 'Purpose')],
    ['class_name', tr('Категорії', 'Categories')],
    ['result', tr('Результати', 'Results')],
  ]
  return <section className="dictionary-grid">{groups.map(([key,fallbackLabel]) => {
    const label = configuredFilterLabel(config, key, fallbackLabel)
    const values = options[key] ?? []
    const labelOf = (value: string | IdTitleOption) => typeof value === 'string' ? configurationLabel(config, key, value) : configurationLabel(config, key, String(value.id), value.title)
    const keyOf = (value: string | IdTitleOption) => typeof value === 'string' ? value : String(value.id)
    return <article className="panel dictionary-card" key={key}><div className="panel-head"><div><h2>{label}</h2><p>{values.length} {tr('значень', 'values')}</p></div></div><div className="tag-list">{values.map((x) => <span key={keyOf(x)}>{labelOf(x)}</span>)}</div></article>
  })}</section>
}

function SettingsPage({ density, setDensity, source }: { density: 'comfortable' | 'compact'; setDensity: (v: 'comfortable' | 'compact') => void; source?: SourceStatus }) {
  const { tr } = useLanguage()
  const animationsKey = getFrontendConfig().app.storage.animations_key
  const defaultAnimations = getFrontendConfig().app.defaults.animations
  const [animations, setAnimations] = useState(() => {
    const stored = localStorage.getItem(animationsKey)
    return stored == null ? defaultAnimations : stored !== 'off'
  })
  const [probe, setProbe] = useState<string>('')
  const [probing, setProbing] = useState(false)
  useEffect(() => { localStorage.setItem(animationsKey, animations ? 'on' : 'off'); document.documentElement.dataset.animations = animations ? 'on' : 'off' }, [animations, animationsKey])
  const runProbe = async () => {
    setProbing(true)
    try {
      const status = await api.sourceStatus()
      setProbe(status.connected ? tr('ClickHouse доступний', 'ClickHouse is available') : `${tr('Помилка', 'Error')}: ${status.message}`)
    } catch (e) {
      setProbe(e instanceof Error ? `${tr('Помилка', 'Error')}: ${e.message}` : tr('Помилка ClickHouse', 'ClickHouse error'))
    } finally {
      setProbing(false)
    }
  }
  return <section className="settings-grid"><article className="panel settings-card"><h2>{tr('Джерело даних', 'Data source')}</h2><p>{tr('FastAPI читає аналітичні дані напряму з ClickHouse. PostgreSQL лишається контуром отримання та первинної обробки.', 'FastAPI reads analytics directly from ClickHouse. PostgreSQL remains the ingestion and primary-processing layer.')}</p><div className="source-status-card"><div><span className={source?.connected === false ? 'source-dot bad' : 'source-dot'} /><strong>{source?.label || tr('Перевірка...', 'Checking...')}</strong></div><small>{source?.upstream || source?.message || '—'}</small>{source?.upstream && <code>{source.message}</code>}</div><div className="settings-probe-row"><button className="secondary" onClick={runProbe} disabled={probing}>{probing ? tr('Перевірка...', 'Checking...') : tr('Перевірити ClickHouse', 'Check ClickHouse')}</button><small>{probe}</small></div></article><article className="panel settings-card"><h2>{tr('Щільність інтерфейсу', 'Interface density')}</h2><p>{tr('Впливає на висоту рядків та відступи.', 'Controls row height and spacing.')}</p><div className="segmented"><button className={density === 'comfortable' ? 'active' : ''} onClick={() => setDensity('comfortable')}>{tr('Комфортна', 'Comfortable')}</button><button className={density === 'compact' ? 'active' : ''} onClick={() => setDensity('compact')}>{tr('Компактна', 'Compact')}</button></div></article><article className="panel settings-card"><h2>{tr('Мова інтерфейсу', 'Interface language')}</h2><p>{tr('Мова інтерфейсу та підписів на карті змінюється одночасно.', 'The interface and map-label language change together.')}</p><LanguageSwitcher /></article><article className="panel settings-card"><h2>{tr('Анімації', 'Animations')}</h2><p>{tr('Вмикає плавні переходи для карти та елементів UI.', 'Enables smooth transitions for the map and UI elements.')}</p><label className="switch-row"><span>{animations ? tr('Увімкнено', 'Enabled') : tr('Вимкнено', 'Disabled')}</span><input type="checkbox" checked={animations} onChange={(e) => setAnimations(e.target.checked)} /></label></article></section>
}
