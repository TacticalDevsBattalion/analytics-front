import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Palette, Pencil, Plus, RefreshCw, Save, X } from 'lucide-react'
import { biApi } from '../../lib/biApi'
import { accountApi } from '../../lib/accountApi'
import { dashboardGlobalFilters, nextWidgetLayout } from '../../lib/biBuilder'
import { datumFilters, drillFilterState, mergeCrossFilters, visibleWidget } from '../../lib/integratedAnalytics'
import { personalDashboardCapabilities, personalWidgetPayload, semanticLabel } from '../../lib/semanticCatalog'
import type { AnalyticsCatalog, DashboardDefinition, PersonalDashboard, QueryFilter, WidgetDefinition, WidgetLayout } from '../../lib/biTypes'
import type { FilterState } from '../../lib/types'
import { getFrontendConfig } from '../../config'
import { useAuth } from '../../config/AuthContext'
import { useCustomFilters } from '../../config/CustomFiltersContext'
import { useLanguage } from '../../i18n/LanguageContext'
import type { PageId } from '../Sidebar'
import { DashboardGrid } from '../bi/DashboardGrid'
import { WidgetRenderer } from '../bi/WidgetRenderer'
import { BuiltInWidget } from './BuiltInWidget'
import { SemanticWidgetEditor } from './SemanticWidgetEditor'
import { PersonalAppearanceEditor } from './PersonalAppearanceEditor'
import './integratedAnalytics.css'

type Props = { page: 'dashboard' | 'statistics' | 'personal'; filters: FilterState; filterBar: ReactNode; inheritedFilters?: QueryFilter[]; onClearInheritedFilters?: () => void; section?: string; onSectionChange?: (section: string) => void; onNavigate: (page: PageId, filters: FilterState, section?: string, extraFilters?: QueryFilter[]) => void }
const sectionFallback = [{ key: 'overview', label: 'Огляд' }, { key: 'effectiveness', label: 'Результативність' }, { key: 'targets', label: 'Результати за цілями' }, { key: 'losses', label: 'Втрати' }, { key: 'resources', label: 'Ресурси' }]
function newWidget(dashboard: DashboardDefinition, catalog: AnalyticsCatalog): WidgetDefinition {
  return { id: crypto.randomUUID().replaceAll('-', ''), revision: 0, dashboard_id: dashboard.id, title: 'Новий віджет', widget_type: 'chart', layout: nextWidgetLayout(dashboard.widgets), query: { metrics: catalog.metrics.slice(0, 1).map(metric => ({ key: metric.key })), dimensions: [], filters: [], data_scope: 'USER_SCOPE' }, visualization: { type: 'number', legend: { show: true }, labels: { show: false }, tooltip: { show: true } }, data_scope: 'USER_SCOPE', inherit_global_filters: true, date_mode: 'INHERIT_GLOBAL_DATE', widget_kind: dashboard.is_system ? 'SYSTEM_WIDGET' : 'USER_WIDGET', movable: true, resizable: true, removable: true, interaction: { click_action: 'NONE' }, visibility: { conditions: [] } }
}
export function IntegratedAnalyticsPage({ page, filters, filterBar, inheritedFilters = [], onClearInheritedFilters, section = 'overview', onSectionChange, onNavigate }: Props) {
  const { tr } = useLanguage(), auth = useAuth(), client = useQueryClient()
  const custom = useCustomFilters()
  const personal = page === 'personal'
  const catalog = useQuery({ queryKey: ['analytics-catalog'], queryFn: ({ signal }) => biApi.catalog(signal), retry: false })
  const metadata = useQuery({ queryKey: ['bi-metadata'], queryFn: ({ signal }) => biApi.metadata(signal), retry: false })
  const definition = useQuery({ queryKey: ['integrated-definition', page, auth.user?.id], queryFn: async ({ signal }) => personal ? biApi.personalDashboard(signal) : biApi.page(page, signal), retry: false })
  const snapshot = personal ? definition.data as PersonalDashboard | undefined : undefined
  const base = personal ? snapshot?.dashboard : definition.data as DashboardDefinition | undefined
  const [draft, setDraft] = useState<DashboardDefinition | null>(null), [editing, setEditing] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [editor, setEditor] = useState<WidgetDefinition | null>(null), [appearanceOpen, setAppearanceOpen] = useState(false), [crossFilters, setCrossFilters] = useState<QueryFilter[]>([])
  const migrationStarted = useRef(false)
  const active = draft ?? base
  const permissions = metadata.data?.permissions ?? []
  const has = (permission: string) => permissions.includes('*') || permissions.includes(permission)
  const personalCapabilities = personalDashboardCapabilities(base?.layout_mode, permissions)
  const canEdit = personal ? personalCapabilities.layout : has(`${page}.admin_edit`)
  const canConfigure = personal ? personalCapabilities.configure : canEdit
  const canCreate = personal ? personalCapabilities.create : canEdit
  const canEditWidget = (widget: WidgetDefinition) => !personal || (widget.widget_kind === 'USER_WIDGET' && widget.owner_id === auth.user?.id && personalCapabilities.edit)
  const canDeleteWidget = (widget: WidgetDefinition) => widget.removable !== false && !widget.mandatory && !widget.is_locked && (!personal || (widget.widget_kind === 'SYSTEM_WIDGET' ? personalCapabilities.hide : widget.owner_id === auth.user?.id && personalCapabilities.remove))
  const dates = useMemo(() => ({ from: filters.date_from, to: filters.date_to }), [filters.date_from, filters.date_to])
  const globalFilters = useMemo(() => [...dashboardGlobalFilters(filters, metadata.data?.filter_fields ?? []), ...custom.queryFilters, ...inheritedFilters, ...crossFilters], [filters, metadata.data, custom.queryFilters, inheritedFilters, crossFilters])
  const query = useQuery({ queryKey: ['integrated-query', page, base?.revision, snapshot?.revision, dates, filters.time_from, filters.time_to, globalFilters], queryFn: ({ signal }) => personal ? biApi.personalQuery({ date_range: dates, filters: globalFilters, time_from: filters.time_from, time_to: filters.time_to }, signal) : biApi.pageQuery(page, { date_range: dates, filters: globalFilters, time_from: filters.time_from, time_to: filters.time_to }, signal), enabled: Boolean(base && metadata.data), retry: false })
  const options = useQuery({ queryKey: ['catalog-options', dates], queryFn: ({ signal }) => biApi.catalogOptions(dates, signal), enabled: Boolean(catalog.data && editing), retry: false })
  const resolvedCatalog = useMemo(() => catalog.data ? { ...catalog.data, filters: catalog.data.filters.map(field => ({ ...field, values: (options.data?.options?.[field.key] ?? options.data?.[field.key] ?? field.values) as typeof field.values })) } : undefined, [catalog.data, options.data])
  useEffect(() => { setDraft(null); setEditing(false); setEditor(null); setAppearanceOpen(false); setCrossFilters([]); setError(''); setNotice(''); migrationStarted.current = false }, [page, auth.user?.id])
  useEffect(() => { if (personal) { setDraft(null); setEditing(false); setEditor(null) } }, [personal, base?.layout_mode])
  useEffect(() => {
    if (!personal || !snapshot || snapshot.migrated || !auth.user || migrationStarted.current) return
    migrationStarted.current = true
    void (async () => {
      const legacy = await accountApi.dashboard(auth.user!.id)
      const key = `${getFrontendConfig().app.storage.saved_views_key}:${auth.user!.id}`
      let savedViews: Array<{ id: string; name: string; filters: unknown; target: string }> = []
      try { const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '[]'); if (Array.isArray(raw)) savedViews = raw.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.filters === 'object' && item.filters).map(item => ({ id: item.id, name: item.name, filters: item.filters, target: item.target ?? 'dashboard' })) } catch { /* Preserve malformed legacy storage without blocking the new dashboard. */ }
      const migrated = await biApi.migratePersonalDashboard({ legacy_preferences: legacy.preferences, saved_views: savedViews })
      client.setQueryData(['integrated-definition', page, auth.user?.id], migrated)
      setNotice('Ваші особисті налаштування та збережені перегляди перенесено.')
    })().catch(reason => { migrationStarted.current = false; setError(reason instanceof Error ? reason.message : String(reason)) })
  }, [personal, snapshot?.migrated, snapshot?.revision, auth.user?.id, client, page])
  const applyLayouts = (layouts: Record<string, WidgetLayout>) => setDraft(current => ({ ...(current ?? base!), widgets: (current ?? base!).widgets.map(widget => layouts[widget.id] ? { ...widget, layout: layouts[widget.id] } : widget) }))
  const reload = async () => { await client.invalidateQueries({ queryKey: ['integrated-definition', page] }); await client.invalidateQueries({ queryKey: ['integrated-query', page] }) }
  const save = async () => {
    if (!draft || !base || saving) return
    setSaving(true); setError('')
    try {
      if (personal) {
        for (const widget of base.widgets.filter(item => personalCapabilities.remove && item.widget_kind === 'USER_WIDGET' && item.owner_id === auth.user?.id && !draft.widgets.some(next => next.id === item.id))) await biApi.removePersonalWidget(widget)
        for (const widget of draft.widgets.filter(item => item.widget_kind === 'USER_WIDGET' && (base.widgets.some(old => old.id === item.id) ? personalCapabilities.edit : personalCapabilities.create))) {
          const old = base.widgets.find(item => item.id === widget.id)
          if (!old || JSON.stringify({ ...old, layout: null }) !== JSON.stringify({ ...widget, layout: null })) await biApi.personalWidget(personalWidgetPayload(widget))
        }
        const latest = await biApi.personalDashboard()
        if (canEdit) await biApi.savePersonalDashboard({ expected_revision: latest.revision, ...(personalCapabilities.hide ? { hidden_widget_ids: [...new Set([...(snapshot?.hidden_widget_ids ?? []).filter(id => !draft.widgets.some(widget => widget.id === id)), ...base.widgets.filter(widget => widget.widget_kind === 'SYSTEM_WIDGET' && !draft.widgets.some(item => item.id === widget.id)).map(widget => widget.id)])] } : {}), overrides: draft.widgets.filter(widget => !widget.is_locked && (widget.movable !== false || widget.resizable !== false)).map(widget => ({ widget_id: widget.id, layout: widget.layout })) })
      } else await biApi.savePage(page, draft)
      setDraft(null); setEditing(false); setNotice('Зміни збережено.'); await reload()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); if (personal) { setDraft(null); await reload() } }
    finally { setSaving(false) }
  }
  const interact = (widget: WidgetDefinition, row: Record<string, unknown>, selection?: QueryFilter[]) => {
    if (editing || !catalog.data) return
    const action = widget.interaction
    if (!action || action.click_action === 'NONE') return
    const selected = selection ?? datumFilters(widget, row, catalog.data)
    if (action.click_action === 'CROSS_FILTER') { if (selected.length) setCrossFilters(current => mergeCrossFilters(current, selected)); return }
    const widgetFilters = [...(widget.query.filters ?? []), ...(widget.fixed_filters ?? []), ...selected]
    const passed = action.pass_filters === false ? [] : [...inheritedFilters, ...crossFilters]
    const targetFilters = action.pass_filters === false ? { ...filters, direction: [], unit: [], category: [], asset: [], group: [], bbak: [], rota: [], battalion: [], purpose: [], class_name: [], result: [] } : filters
    const resultFilters = drillFilterState(targetFilters, widgetFilters)
    if (action.pass_date === false) { const date = new Date(); resultFilters.date_from = new Date(date.getFullYear(), date.getMonth(), 1).toLocaleDateString('sv-SE'); resultFilters.date_to = date.toLocaleDateString('sv-SE') }
    onNavigate((action.target_page ?? 'STATISTICS').toLowerCase() as PageId, resultFilters, action.target_section ?? 'overview', [...passed, ...widgetFilters])
  }
  const allWidgets = active?.widgets ?? []
  const visible = allWidgets.filter(widget => editing || visibleWidget(widget, globalFilters))
  const sections = catalog.data?.sections ?? sectionFallback
  const sectionWidgets = page === 'statistics' ? visible.filter(widget => (widget.section ?? 'overview') === section) : visible
  const startY = page === 'statistics' && sectionWidgets.length ? Math.min(...sectionWidgets.map(widget => widget.layout.y)) : 0
  const renderedWidgets = sectionWidgets.map(widget => ({ ...widget, layout: { ...widget.layout, y: widget.layout.y - startY } })).sort((left, right) => left.layout.y - right.layout.y || left.layout.x - right.layout.x || left.id.localeCompare(right.id))
  const appearance = snapshot?.appearance
  const backgroundColors: Record<string, string> = { default: 'transparent', navy: '#112338', graphite: '#20252d', forest: '#102b25', gradient: 'linear-gradient(135deg,#112338,#163b41)' }
  const style = personal && appearance ? { '--ia-widget-opacity': appearance.widget_opacity ?? 1, '--ia-card-radius': `${appearance.card_radius ?? 10}px`, '--ia-accent': appearance.accent ?? '#59b8dd', '--ia-shadow': appearance.shadow === false ? 'none' : '0 6px 18px #0003', '--bi-grid-gap': `${appearance.grid_spacing ?? 12}px` } as CSSProperties : undefined
  if (definition.isPending || catalog.isPending) return <section className="ia-page">{filterBar}<div className="bi-state" role="status">Завантаження віджетів…</div></section>
  if (definition.isError || catalog.isError) return <section className="ia-page">{filterBar}<div className="bi-error-banner" role="alert">{definition.error?.message ?? catalog.error?.message}<button className="secondary" onClick={() => { void definition.refetch(); void catalog.refetch() }}>Повторити</button></div></section>
  return <section className="ia-page" style={style} data-density={appearance?.density}>
    {personal && appearance && <div className="ia-page-background" style={{ opacity: appearance.background_opacity ?? 1, background: appearance.background === 'image' ? undefined : backgroundColors[appearance.background] ?? appearance.background, backgroundImage: appearance.background === 'image' && appearance.background_url ? `url(${JSON.stringify(appearance.background_url)})` : undefined }} />}
    {filterBar}<div className="ia-toolbar"><small>{editing ? personal && base?.layout_mode === 'LAYOUT_EDITABLE' ? 'Можна переміщувати віджети та змінювати їхній розмір. Збереження застосує зміни.' : 'Перетягуйте віджети, змінюйте розмір і налаштування. Збереження застосує зміни.' : personal ? 'Системні віджети та ваші особисті доповнення' : ''}</small><div className="ia-toolbar-actions"><button className="secondary" disabled={query.isFetching || saving} onClick={() => void query.refetch()}><RefreshCw size={14} />{tr('Оновити', 'Refresh')}</button>{personal && personalCapabilities.appearance && <button className="secondary" disabled={saving} onClick={() => setAppearanceOpen(true)}><Palette size={14} />Вигляд</button>}{canConfigure && !editing && <button className="secondary" onClick={() => { setDraft(structuredClone(base!)); setEditing(true); setNotice('') }}><Pencil size={14} />Редагувати {page === 'statistics' ? 'статистику' : 'дашборд'}</button>}{editing && <>{page === 'dashboard' && canEdit && <label className="bia-field"><span>Персоналізація користувачами</span><select value={draft?.layout_mode ?? base?.layout_mode} disabled={saving} onChange={event => setDraft(current => ({ ...current!, layout_mode: event.target.value as DashboardDefinition['layout_mode'] }))}>{[['LOCKED', 'Без змін структури'], ['LAYOUT_EDITABLE', 'Переміщення та розмір'], ['CUSTOMIZABLE', 'Власні віджети й налаштування'], ['FREE', 'Повна персоналізація']].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}{personal && personalCapabilities.hide && (snapshot?.available_widgets ?? []).some(widget => !allWidgets.some(item => item.id === widget.id)) && <select className="bi-dashboard-select" aria-label="Повернути системний віджет" value="" disabled={saving} onChange={event => { const widget = snapshot?.available_widgets?.find(item => item.id === event.target.value); if (widget) setDraft(current => ({ ...current!, widgets: [...current!.widgets, { ...widget, layout: nextWidgetLayout(current!.widgets) }] })) }}><option value="">Повернути прихований віджет…</option>{snapshot?.available_widgets?.filter(widget => !allWidgets.some(item => item.id === widget.id)).map(widget => <option value={widget.id} key={widget.id}>{widget.title}</option>)}</select>}{canCreate && <button className="secondary" disabled={saving} onClick={() => { const widget = newWidget(active!, catalog.data!); setEditor({ ...widget, section: page === 'statistics' ? section : undefined, widget_kind: personal ? 'USER_WIDGET' : 'SYSTEM_WIDGET', owner_id: personal ? auth.user?.id : undefined }) }}><Plus size={14} />Додати віджет</button>}<button className="primary" disabled={saving || !draft} onClick={() => void save()}><Save size={14} />{saving ? 'Збереження…' : 'Зберегти'}</button><button className="secondary" disabled={saving} onClick={() => { setDraft(null); setEditing(false); setError('') }}><X size={14} />Скасувати</button></>}</div></div>
    {page === 'statistics' && <nav className="ia-sections" aria-label="Розділи статистики">{sections.map(item => <button className={`secondary${section === item.key ? ' active' : ''}`} key={item.key} onClick={() => onSectionChange?.(item.key)}>{item.label}</button>)}</nav>}
    {(inheritedFilters.length > 0 || crossFilters.length > 0) && <div className="ia-chips" aria-label="Активні перехресні фільтри">{[...inheritedFilters, ...crossFilters].map((filter, index) => <button key={`${filter.field}:${index}`} onClick={() => { if (inheritedFilters.includes(filter)) onClearInheritedFilters?.(); else setCrossFilters(current => current.filter(item => item !== filter)) }}>{semanticLabel(catalog.data!.filters.find(field => (field.field ?? field.key) === filter.field) ?? { label: 'Фільтр' })}: {Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value ?? '')} {!inheritedFilters.includes(filter) && '×'}</button>)}{crossFilters.length > 0 && <button onClick={() => setCrossFilters([])}>Очистити вибір</button>}</div>}
    {notice && <p className="bi-notice" role="status">{notice}</p>}{error && <div className="bi-error-banner" role="alert">{error}<button className="secondary" onClick={() => void reload()}>Оновити збережену версію</button></div>}
    <DashboardGrid widgets={renderedWidgets} editable={editing && canEdit && !saving} manageWidgets={editing && !saving} gap={appearance?.grid_spacing ?? 12} rowHeight={58} frameless={widget => widget.builtin === 'summary'} canManageWidget={widget => canCreate || canEditWidget(widget) || canDeleteWidget(widget)} canEditWidget={canEditWidget} canDeleteWidget={canDeleteWidget} onLayoutsChange={layouts => applyLayouts(Object.fromEntries(Object.entries(layouts).map(([id, layout]) => [id, { ...layout, y: layout.y + startY }])))} onEdit={widget => setEditor(allWidgets.find(item => item.id === widget.id) ?? widget)} onDuplicate={canCreate ? widget => { const copy = structuredClone(widget); setEditor({ ...copy, id: crypto.randomUUID().replaceAll('-', ''), title: `${widget.title} (копія)`, revision: 0, layout: nextWidgetLayout(allWidgets), ...(personal ? { owner_id: auth.user?.id, widget_kind: 'USER_WIDGET' } : {}) }) } : undefined} onDelete={widget => { if (canDeleteWidget(widget)) setDraft(current => ({ ...current!, widgets: current!.widgets.filter(item => item.id !== widget.id) })); else setError('Цей віджет обов’язковий або у вас немає права його видаляти.') }} renderWidget={widget => { const result = query.data?.results.find(item => item.widget_id === widget.id); return <WidgetRenderer definition={widget} result={result?.data} loading={query.isPending} error={query.error?.message ?? (result?.status === 'error' ? result.error : undefined)} onRetry={() => void query.refetch()} onDatumClick={row => interact(widget, row)} builtinRenderer={widget.builtin && result?.data ? () => <BuiltInWidget definition={widget} result={result.data!} onDrill={!editing && widget.interaction?.click_action === 'DRILL_THROUGH' ? () => interact(widget, result.data?.rows[0] ?? {}) : undefined} onSelect={(field, value) => interact(widget, {}, [{ field, operator: 'eq', value }])} /> : undefined} /> }} />
    {!renderedWidgets.length && <div className="bi-state">У цьому розділі немає доступних віджетів.</div>}
    {editor && resolvedCatalog && <SemanticWidgetEditor widget={editor} catalog={resolvedCatalog} system={!personal} saving={saving} dateRange={dates} globalFilters={globalFilters} timeFrom={filters.time_from} timeTo={filters.time_to} onClose={() => setEditor(null)} onSave={async widget => { setDraft(current => ({ ...(current ?? base!), widgets: (current ?? base!).widgets.some(item => item.id === widget.id) ? (current ?? base!).widgets.map(item => item.id === widget.id ? { ...widget, owner_id: personal ? auth.user?.id : widget.owner_id } : item) : [...(current ?? base!).widgets, { ...widget, owner_id: personal ? auth.user?.id : widget.owner_id }] })); setEditor(null) }} />}
    {appearanceOpen && snapshot && <PersonalAppearanceEditor appearance={snapshot.appearance} saving={saving} onClose={() => setAppearanceOpen(false)} onSave={async next => { setSaving(true); try { const saved = await biApi.savePersonalDashboard({ expected_revision: snapshot.revision, appearance: next }); client.setQueryData(['integrated-definition', page, auth.user?.id], saved); setAppearanceOpen(false) } finally { setSaving(false) } }} />}
  </section>
}
