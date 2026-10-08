import { ArrowDown, ArrowUp, Calculator, Check, Eye, History, KeyRound, ListFilter, MessageSquare, Palette, RefreshCw, Save, Settings2, ShieldCheck, Table2, BookOpen, Database, Undo2, Users } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppConfiguration } from '../config/AppConfigurationContext'
import { defaultCardDetailsConfiguration, type AppConfiguration, type CardDetailsConfiguration } from '../config/appConfiguration'
import { configurationApi } from '../lib/configurationApi'
import { api } from '../lib/api'
import type { FilterOptions, SourceStatus } from '../lib/types'
import { validatePurposeKpi } from '../lib/purposeKpiEditor'
import { ALL_COLUMNS } from './EventsTable'
import { PurposeKpiEditor } from './PurposeKpiEditor'
import { CustomFilterEditor } from './CustomFilterEditor'
import { biApi } from '../lib/biApi'
import { validateCustomFilters } from '../lib/customFilters'
import { AccountManagement } from './AccountManagement'
import { useAuth } from '../config/AuthContext'
import { AnalyticsAdministrationSection, analyticsAdministrationSections, type AnalyticsAdministrationSectionId } from './bi/AnalyticsAdministrationSection'
import './AdministrationPage.css'

type SectionId = AnalyticsAdministrationSectionId | 'filters' | 'card_details' | 'kpi' | 'dictionaries' | 'tables' | 'appearance' | 'source' | 'history'
type Revision = { revision: number; created_at: string; action: string }
type DictionaryGroup = keyof FilterOptions
const TOKEN_KEY = 'analytics-app-admin-session'
const clone = (value: AppConfiguration): AppConfiguration => structuredClone(value)
const readToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) || '' } catch { return '' } }
const sections: Array<{ key: SectionId; label: string; icon: typeof ListFilter }> = [
  ...analyticsAdministrationSections.map(({ key, title }) => ({ key, label: title, icon: key === 'users' ? Users : key === 'roles' ? ShieldCheck : key === 'cache' ? Database : Calculator })),
  { key: 'filters', label: 'Фільтри', icon: ListFilter },
  { key: 'card_details', label: 'Підказки карток', icon: MessageSquare },
  { key: 'kpi', label: 'Розрахунок KPI', icon: Calculator },
  { key: 'dictionaries', label: 'Довідники', icon: BookOpen },
  { key: 'tables', label: 'Таблиці та звіти', icon: Table2 },
  { key: 'appearance', label: 'Оформлення і меню', icon: Palette },
  { key: 'source', label: 'Джерело даних', icon: Database },
  { key: 'history', label: 'Історія змін', icon: History },
]
const menuOptions = [
  { key: 'dashboard', label: 'Дашборд' }, { key: 'statistics', label: 'Статистика' },
  { key: 'comparison', label: 'Порівняння' }, { key: 'map', label: 'Карта' },
  { key: 'table', label: 'Таблиця' }, { key: 'saved', label: 'Мій дашборд' },
  { key: 'dictionaries', label: 'Довідники' }, { key: 'settings', label: 'Персональні налаштування' },
]
const dictionaryGroups: Array<{ key: DictionaryGroup; label: string }> = [
  { key: 'category', label: 'Кафедри' }, { key: 'purpose', label: 'Мети вильотів' },
  { key: 'bbak', label: 'Підрозділи — ББАК' }, { key: 'rota', label: 'Роти' },
  { key: 'battalion', label: 'Батальйони' }, { key: 'direction', label: 'Напрямки' },
  { key: 'unit', label: 'Зони відповідальності' }, { key: 'asset', label: 'Засоби' },
  { key: 'group', label: 'Екіпажі' }, { key: 'class_name', label: 'Класи цілей' },
  { key: 'result', label: 'Результати' },
]

function move<T>(items: T[], index: number, direction: number): T[] {
  const target = index + direction
  if (target < 0 || target >= items.length) return items
  const output = [...items]
  ;[output[index], output[target]] = [output[target], output[index]]
  return output
}

function OrderButtons({ label, index, total, onMove }: { label: string; index: number; total: number; onMove: (direction: number) => void }) {
  return <div className="admin-order">
    <button type="button" aria-label={`Підняти: ${label}`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={15} /></button>
    <button type="button" aria-label={`Опустити: ${label}`} disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown size={15} /></button>
  </div>
}

function OrderedOptions({ options, selected, onChange }: { options: Array<{ key: string; label: string }>; selected: string[]; onChange: (values: string[]) => void }) {
  const ordered = [...selected.filter(key => options.some(option => option.key === key)), ...options.map(option => option.key).filter(key => !selected.includes(key))]
  return <div className="admin-option-list">{ordered.map(key => {
    const item = options.find(option => option.key === key)!
    const index = selected.indexOf(key)
    return <div className="admin-option-row" key={key}>
      <label className="admin-check"><input type="checkbox" checked={index >= 0} onChange={event => onChange(event.target.checked ? [...selected, key] : selected.filter(value => value !== key))} /><span>{item.label}</span></label>
      {index >= 0 && <OrderButtons label={item.label} index={index} total={selected.length} onMove={direction => onChange(move(selected, index, direction))} />}
    </div>
  })}</div>
}

function validate(config: AppConfiguration): string | null {
  if (!config.appearance.title.trim()) return 'Вкажіть назву застосунку.'
  if (config.filters.fields.some(field => !field.label.trim())) return 'У кожного фільтра має бути назва.'
  const customProblem = validateCustomFilters(config.filters.custom ?? [])
  if (customProblem) return customProblem
  if (!config.dashboard.metric_keys.length) return 'Залиште хоча б один показник KPI.'
  if (!config.tables.columns.length) return 'Залиште хоча б одну колонку таблиці.'
  if (!Number.isInteger(config.tables.page_size) || config.tables.page_size < 5 || config.tables.page_size > 200) return 'Кількість рядків має бути цілим числом від 5 до 200.'
  if (!Number.isInteger(config.defaults.date_range_days) || config.defaults.date_range_days < 1 || config.defaults.date_range_days > 365) return 'Початковий період має бути від 1 до 365 днів.'
  if (!config.appearance.menu.includes(config.appearance.default_page)) return 'Початкова сторінка має бути видимою в меню.'
  const details = config.appearance.card_details ?? defaultCardDetailsConfiguration()
  if (!Number.isInteger(details.hover_delay_ms) || details.hover_delay_ms < 0 || details.hover_delay_ms > 1500) return 'Затримка наведення має бути цілим числом від 0 до 1500 мс.'
  return validatePurposeKpi(config.kpi)
}

export function AdministrationPage({ onPreview }: { onPreview?: () => void }) {
  const auth = useAuth()
  const { config, publishedConfig, revision, previewConfig, clearPreview, refresh, isPreview, administrationEnabled } = useAppConfiguration()
  const [draft, setDraft] = useState<AppConfiguration>(() => clone(config))
  const [savedDraft, setSavedDraft] = useState<AppConfiguration>(() => clone(publishedConfig))
  const [baseRevision, setBaseRevision] = useState(revision)
  const [draftVersion, setDraftVersion] = useState(0)
  const [section, setSection] = useState<SectionId>('metrics')
  const catalog = useQuery({ queryKey: ['analytics-catalog'], queryFn: ({ signal }) => biApi.catalog(signal), retry: false, staleTime: 60000 })
  const customFilterFields = useMemo(() => (catalog.data?.filters ?? []).map(item => ({ key: item.field ?? item.key, label: item.label ?? item.title ?? item.key })).filter(item => item.key !== 'date' && item.key !== 'time'), [catalog.data])
  const [analyticsDirty, setAnalyticsDirty] = useState(false)
  const [token, setToken] = useState(readToken)
  const [authenticated, setAuthenticated] = useState(false)
  const filterColumns = useQuery({ queryKey: ['filter-columns', authenticated], queryFn: () => configurationApi.filterColumns(token), enabled: authenticated, retry: false, staleTime: 60000 })
  const customFilterColumns = useMemo(() => (filterColumns.data?.columns ?? []).map(item => ({ key: item.field, label: item.column })), [filterColumns.data])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [history, setHistory] = useState<Revision[]>([])
  const [source, setSource] = useState<SourceStatus | null>(null)
  const [sourceError, setSourceError] = useState('')
  const [options, setOptions] = useState<FilterOptions | null>(null)
  const [optionsError, setOptionsError] = useState('')
  const [dictionaryGroup, setDictionaryGroup] = useState<DictionaryGroup>('category')
  const [dictionarySearch, setDictionarySearch] = useState('')
  const [rollbackTarget, setRollbackTarget] = useState('')
  const sessionRestoreStarted = useRef(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft)
  const hasDraftChanges = JSON.stringify(draft) !== JSON.stringify(publishedConfig)
  const cardDetails = draft.appearance.card_details ?? defaultCardDetailsConfiguration()
  const analyticsSection = analyticsAdministrationSections.find(item => item.key === section)

  async function readStatus(key: string, preserveLocal = false) {
    const status = await configurationApi.status(key)
    setAuthenticated(true)
    try { sessionStorage.setItem(TOKEN_KEY, key) } catch { /* Session storage can be disabled. */ }
    setHistory(status.history)
    setDraftVersion(status.draft_version)
    if (!preserveLocal) {
      const hasCurrentDraft = status.draft && status.draft_base_revision === status.revision
      const current = clone(hasCurrentDraft ? status.draft! : status.config)
      setDraft(current)
      setSavedDraft(clone(current))
      setBaseRevision(status.revision)
    }
    await refresh()
    return status
  }

  useEffect(() => {
    let active = true
    void api.options().then(value => { if (active) setOptions(value) }).catch(reason => { if (active) setOptionsError(String(reason instanceof Error ? reason.message : reason)) })
    void api.sourceStatus().then(value => { if (active) setSource(value) }).catch(reason => { if (active) setSourceError(String(reason instanceof Error ? reason.message : reason)) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (sessionRestoreStarted.current) return
    sessionRestoreStarted.current = true
    const restoredToken = readToken()
    if (!restoredToken && auth.user?.role !== 'administrator') return
    void perform(async () => {
      await readStatus(restoredToken, isPreview || dirty)
      setNotice('Адміністративну сесію відновлено.')
    })
  }, [])

  useEffect(() => {
    if (!authenticated && !dirty && !isPreview) {
      setDraft(clone(publishedConfig))
      setSavedDraft(clone(publishedConfig))
      setBaseRevision(revision)
    }
  }, [publishedConfig, revision, authenticated, isPreview])

  async function perform(operation: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try { await operation() } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Не вдалося виконати дію. Спробуйте ще раз.'
      setError(message)
      if (message.startsWith('Ключ адміністратора') || message.startsWith('Адміністративний доступ завершено')) setAuthenticated(false)
    } finally { setBusy(false) }
  }

  function change(update: (current: AppConfiguration) => AppConfiguration) {
    setDraft(current => update(clone(current)))
    setError('')
    setNotice('')
  }

  function preview() {
    const validationError = validate(draft)
    if (validationError) { setError(validationError); return }
    setError('')
    previewConfig(clone(draft))
    setNotice(JSON.stringify(draft.kpi) !== JSON.stringify(publishedConfig.kpi)
      ? 'Перегляд оформлення чернетки увімкнено лише для вашої вкладки. Аналітика використовує опубліковані правила KPI; перевірте новий розрахунок у розділі «Розрахунок KPI» перед публікацією.'
      : 'Перегляд чернетки увімкнено лише для вашої вкладки. Публікація застосує зміни для всіх.')
    onPreview?.()
  }

  async function save() {
    const validationError = validate(draft)
    if (validationError) throw new Error(validationError)
    const saved = await configurationApi.saveDraft(token, { config: draft, base_revision: baseRevision, expected_draft_version: draftVersion })
    setDraftVersion(saved.draft_version)
    setSavedDraft(clone(draft))
    setNotice('Чернетку збережено. Поточна опублікована версія не змінилася.')
    return saved.draft_version
  }

  async function publish() {
    const savedDraftVersion = await save()
    await configurationApi.publish(token, { base_revision: baseRevision, expected_draft_version: savedDraftVersion })
    clearPreview()
    await readStatus(token)
    setNotice('Налаштування опубліковано. Вони застосовані до всіх сторінок.')
  }

  async function rollback() {
    if (!rollbackTarget) throw new Error('Оберіть попередню версію.')
    if (dirty) throw new Error('Спочатку збережіть свою чернетку або завантажте поточні налаштування, щоб не втратити зміни.')
    await configurationApi.rollback(token, { target_revision: Number(rollbackTarget), base_revision: baseRevision })
    clearPreview()
    await readStatus(token)
    setRollbackTarget('')
    setNotice('Попередні налаштування відновлено як нову версію.')
  }

  const dictionaryItems = useMemo(() => {
    const entries = options?.[dictionaryGroup] || []
    const values = entries.map(value => typeof value === 'string' ? { id: value, title: value } : { id: String(value.id), title: value.title })
    const aliases = draft.dictionaries.labels[dictionaryGroup] || {}
    const remaining = Object.keys(aliases).filter(id => !values.some(value => value.id === id)).map(id => ({ id, title: id }))
    const search = dictionarySearch.trim().toLocaleLowerCase('uk-UA')
    return [...values, ...remaining].filter(value => !search || `${value.title} ${aliases[value.id] || ''}`.toLocaleLowerCase('uk-UA').includes(search))
  }, [options, dictionaryGroup, dictionarySearch, draft.dictionaries.labels])

  return <section className="administration-page" aria-label="Адміністрування застосунку">
    <div className="admin-summary">
      <div><span className="admin-eyebrow">СПІЛЬНІ НАЛАШТУВАННЯ</span><h2>Адміністрування</h2><p>Керуйте показниками, правилами розрахунку, користувачами та спільними налаштуваннями. Віджети редагуються на сторінках «Дашборд», «Статистика» та «Мій дашборд».</p></div>
      <div className="admin-status">{analyticsSection ? analyticsDirty && <span className="admin-badge admin-badge-draft">Незбережені зміни</span> : <><span>Версія {revision}</span><span className={dirty || hasDraftChanges ? 'admin-badge admin-badge-draft' : 'admin-badge'}>{dirty ? 'Незбережені зміни' : hasDraftChanges ? 'Збережена чернетка' : 'Без локальних змін'}</span>{isPreview && <span className="admin-badge admin-badge-draft">Перегляд чернетки</span>}</>}</div>
    </div>

    {!authenticated && administrationEnabled && (!auth.user || !analyticsSection) && <form className="admin-login" onSubmit={event => { event.preventDefault(); void perform(async () => { await readStatus(token, dirty); setNotice('Доступ адміністратора підтверджено.') }) }}>
      <KeyRound size={20} /><div><strong>Доступ адміністратора</strong><p>Для збереження і публікації введіть ключ. Перевірити зміни у своїй вкладці можна без входу.</p></div>
      <label><span className="admin-sr-only">Ключ адміністратора</span><input aria-label="Ключ адміністратора" type="password" autoComplete="off" value={token} disabled={busy} onChange={event => setToken(event.target.value)} placeholder="Ключ адміністратора" /></label>
      <button className="admin-button" type="submit" disabled={busy || !token.trim()}>Увійти</button>
    </form>}
    {!administrationEnabled && !analyticsSection && <div className="admin-message">На сервері ще не налаштовано адміністративний ключ. Перегляд локальної чернетки доступний; збереження і публікація стануть доступними після налаштування ключа.</div>}

    {error && <div className="admin-message admin-message-error" role="alert">{error}</div>}
    {notice && <div className="admin-message" role="status">{notice}</div>}

    <div className="admin-layout"><nav className="admin-nav" aria-label="Розділи адміністрування">{sections.map(({ key, label, icon: Icon }) => <button type="button" key={key} className={section === key ? 'active' : ''} aria-current={section === key ? 'page' : undefined} disabled={analyticsDirty && section !== key} onClick={() => setSection(key)}><Icon size={17} /><span>{label}</span></button>)}</nav>
      <fieldset className="admin-content" disabled={busy}>
        {analyticsSection && <AnalyticsAdministrationSection key={section} section={analyticsSection.key} token={token} onDirty={setAnalyticsDirty} />}
        {section === 'users' && <details className="admin-user-accounts"><summary>Облікові записи та вхід</summary>
          <p className="admin-hint">Користувачі Keycloak з’являються в списку після першого входу. Їхні ролі, дозволи та підрозділи призначаються вище. Локальні облікові записи й відновлення доступу налаштовуються нижче.</p>
          <fieldset className="admin-account-content" disabled={analyticsDirty}><AccountManagement token={token} authorized={authenticated} /></fieldset>
          {authenticated && <button className="admin-button" type="button" disabled={analyticsDirty} onClick={() => void perform(async () => { clearPreview(); if (auth.user) await auth.logout(); try { sessionStorage.removeItem(TOKEN_KEY) } catch { /* Ignore unavailable session storage. */ } setToken(''); setAuthenticated(false); setHistory([]); setNotice('Адміністративний доступ завершено.') })}>{auth.user ? 'Вийти з облікового запису' : 'Завершити доступ за ключем'}</button>}
        </details>}
        {section === 'filters' && <>
          <div className="admin-section-heading"><Settings2 size={20} /><div><h3>Зручний вибір даних</h3><p>Період залишається завжди видимим. Решту полів можна перейменувати, перемістити або приховати.</p></div></div>
          <div className="admin-fields">
            <label><span>Вигляд панелі</span><select value={draft.filters.layout} onChange={event => change(value => { value.filters.layout = event.target.value as AppConfiguration['filters']['layout']; return value })}><option value="compact">Компактна панель</option><option value="steps">Покроковий вибір</option></select></label>
            <label><span>Що обирається в «Підрозділі»</span><select value={draft.filters.organization_dimension} onChange={event => change(value => { value.filters.organization_dimension = event.target.value as AppConfiguration['filters']['organization_dimension']; return value })}><option value="bbak">ББАК</option><option value="rota">Рота</option><option value="battalion">Батальйон</option><option value="unit">Зона відповідальності</option></select></label>
          </div>
          <p className="admin-hint">ББАК і батальйон у поточному джерелі використовують один список: на панелі показується лише один вибір підрозділу.</p>
          <div className="admin-filter-list">{draft.filters.fields.map((field, index) => <div className="admin-filter-row" key={field.key}>
            <label><span className="admin-sr-only">Назва фільтра {field.key}</span><input aria-label={`Назва фільтра ${field.key}`} value={field.label} maxLength={80} onChange={event => change(value => { value.filters.fields[index].label = event.target.value; return value })} /></label>
            <label><span className="admin-sr-only">Розміщення: {field.label}</span><select aria-label={`Розміщення: ${field.label}`} value={field.placement} onChange={event => change(value => { value.filters.fields[index].placement = event.target.value as typeof field.placement; return value })}><option value="main">Основні фільтри</option><option value="extra">Уточнити вибірку</option><option value="hidden">Приховати</option></select></label>
            <OrderButtons label={field.label} index={index} total={draft.filters.fields.length} onMove={direction => change(value => { value.filters.fields = move(value.filters.fields, index, direction); return value })} />
          </div>)}</div>
          <CustomFilterEditor value={draft.filters.custom ?? []} fields={customFilterFields} newColumns={customFilterColumns} newColumnsFailed={filterColumns.isError} reservedIds={[...draft.filters.fields.map(field => field.key), 'bbak', 'rota', 'battalion']} onChange={custom => change(value => { value.filters.custom = custom; return value })} />
          <h4>Початкове порівняння</h4><div className="admin-fields">
            <label><span>Режим</span><select value={draft.defaults.comparison_mode} onChange={event => change(value => { value.defaults.comparison_mode = event.target.value as AppConfiguration['defaults']['comparison_mode']; return value })}><option value="periods">Між періодами</option><option value="units">Між підрозділами</option><option value="units_over_time">Підрозділи за періодами</option></select></label>
            <label><span>Розбивка періоду</span><select value={draft.defaults.comparison_granularity} onChange={event => change(value => { value.defaults.comparison_granularity = event.target.value as AppConfiguration['defaults']['comparison_granularity']; return value })}><option value="day">За днями</option><option value="week">За тижнями</option><option value="month">За місяцями</option><option value="quarter">За кварталами</option></select></label>
          </div>
        </>}

        {section === 'kpi' && <PurposeKpiEditor value={draft.kpi} onChange={kpi => change(value => { value.kpi = kpi; return value })} />}

        {section === 'dictionaries' && <>
          <div className="admin-section-heading"><BookOpen size={20} /><div><h3>Спільні назви в довідниках</h3><p>Змінюйте підписи для інтерфейсу. Значення в джерелі даних і правила розрахунку залишаються стабільними.</p></div></div>
          <div className="admin-fields"><label><span>Довідник</span><select value={dictionaryGroup} onChange={event => { setDictionaryGroup(event.target.value as DictionaryGroup); setDictionarySearch('') }}>{dictionaryGroups.map(group => <option key={group.key} value={group.key}>{group.label}</option>)}</select></label>
          <label><span>Знайти значення</span><input value={dictionarySearch} onChange={event => setDictionarySearch(event.target.value)} placeholder="Назва або підпис" /></label></div>
          {optionsError && <p className="admin-hint">Не вдалося завантажити значення довідників: {optionsError}</p>}
          {!options && !optionsError && <p className="admin-hint">Завантаження довідників…</p>}
          <div className="admin-dictionary-list">{dictionaryItems.map(item => <div className="admin-dictionary-row" key={item.id}><div><strong>{item.title}</strong><small>{item.id !== item.title ? `Код: ${item.id}` : 'Назва з джерела'}</small></div><label><span className="admin-sr-only">Підпис для {item.title}</span><input aria-label={`Підпис для ${item.title}`} value={draft.dictionaries.labels[dictionaryGroup]?.[item.id] || ''} placeholder={item.title} maxLength={120} onChange={event => change(value => {
            const labels = { ...(value.dictionaries.labels[dictionaryGroup] || {}) }
            if (event.target.value.trim()) labels[item.id] = event.target.value
            else delete labels[item.id]
            value.dictionaries.labels[dictionaryGroup] = labels
            return value
          })} /></label></div>)}</div>
          {options && !dictionaryItems.length && <p className="admin-hint">За цим пошуком немає значень. Очистіть пошук або оберіть інший довідник.</p>}
          <p className="admin-hint">Порожній підпис повертає назву з джерела. Класифікація мети вильоту береться з чинних правил KPI.</p>
        </>}

        {section === 'card_details' && <>
          <div className="admin-section-heading"><MessageSquare size={20} /><div><h3>Підказки карток</h3><p>Виберіть спосіб відкриття та розмір вікна з наявною деталізацією.</p></div></div>
          <div className="admin-fields">
            <label><span>Як відкривати деталізацію</span><select aria-label="Як відкривати деталізацію" value={cardDetails.interaction} onChange={event => change(value => { value.appearance.card_details = { ...(value.appearance.card_details ?? defaultCardDetailsConfiguration()), interaction: event.target.value as CardDetailsConfiguration['interaction'] }; return value })}><option value="auto">Наведення або натискання</option><option value="click">Тільки натискання</option><option value="disabled">Вимкнено</option></select></label>
            <label><span>Затримка наведення, мс</span><input aria-label="Затримка наведення, мс" type="number" min={0} max={1500} step={1} value={cardDetails.hover_delay_ms} disabled={cardDetails.interaction !== 'auto'} onChange={event => change(value => { value.appearance.card_details = { ...(value.appearance.card_details ?? defaultCardDetailsConfiguration()), hover_delay_ms: Number(event.target.value) }; return value })} /></label>
            <label><span>Ширина вікна деталізації</span><select aria-label="Ширина вікна деталізації" value={cardDetails.width} disabled={cardDetails.interaction === 'disabled'} onChange={event => change(value => { value.appearance.card_details = { ...(value.appearance.card_details ?? defaultCardDetailsConfiguration()), width: event.target.value as CardDetailsConfiguration['width'] }; return value })}><option value="standard">Стандартна</option><option value="wide">Широка</option></select></label>
          </div>
          <p className="admin-hint">0 мс — відкривати відразу; 1000 мс — через секунду. На сенсорному екрані деталізація відкривається натисканням. З клавіатури — Enter або пробіл; Escape закриває вікно.</p>
          <p className="admin-hint">Натисніть «Переглянути», щоб перевірити вигляд у своїй вкладці. «Зберегти чернетку» зберігає вибір, а «Опублікувати» застосовує його для користувачів.</p>
        </>}

        {section === 'tables' && <>
          <div className="admin-section-heading"><Table2 size={20} /><div><h3>Таблиці та звіти</h3><p>Налаштуйте початковий склад таблиці й порядок колонок. Користувачі можуть уточнювати свій перегляд.</p></div></div>
          <div className="admin-fields"><label><span>Рядків на сторінці</span><input type="number" min={5} max={200} value={draft.tables.page_size} onChange={event => change(value => { value.tables.page_size = Number(event.target.value); return value })} /></label></div>
          <h4>Колонки</h4><OrderedOptions options={ALL_COLUMNS} selected={draft.tables.columns} onChange={selected => change(value => { value.tables.columns = selected; return value })} />
          <p className="admin-hint">Порівняння експортується окремо з поточними періодами та деталізацією за кафедрами й метами вильотів.</p>
        </>}

        {section === 'appearance' && <>
          <div className="admin-section-heading"><Palette size={20} /><div><h3>Оформлення і навігація</h3><p>Єдині назви, порядок сторінок і початкові параметри для нових переглядів.</p></div></div>
          <div className="admin-fields">
            <label><span>Назва застосунку</span><input value={draft.appearance.title} maxLength={80} onChange={event => change(value => { value.appearance.title = event.target.value; return value })} /></label>
            <label><span>Підпис у меню</span><input value={draft.appearance.subtitle} maxLength={120} onChange={event => change(value => { value.appearance.subtitle = event.target.value; return value })} /></label>
            <label><span>Щільність інтерфейсу</span><select value={draft.appearance.density} onChange={event => change(value => { value.appearance.density = event.target.value as AppConfiguration['appearance']['density']; return value })}><option value="comfortable">Звичайна</option><option value="compact">Компактна</option></select></label>
            <label><span>Початкова сторінка</span><select value={draft.appearance.default_page} onChange={event => change(value => { value.appearance.default_page = event.target.value; return value })}>{menuOptions.filter(item => draft.appearance.menu.includes(item.key)).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
            <label><span>Початковий період, днів</span><input type="number" min={1} max={365} value={draft.defaults.date_range_days} onChange={event => change(value => { value.defaults.date_range_days = Number(event.target.value); return value })} /></label>
          </div>
          <h4>Сторінки меню</h4><OrderedOptions options={menuOptions} selected={draft.appearance.menu} onChange={selected => change(value => {
            value.appearance.menu = selected
            if (!selected.includes(value.appearance.default_page) && selected.length) value.appearance.default_page = selected[0]
            return value
          })} /><p className="admin-hint">Адміністрування завжди доступне, щоб можна було повернути приховані сторінки.</p>
        </>}

        {section === 'source' && <>
          <div className="admin-section-heading"><Database size={20} /><div><h3>Підключення даних</h3><p>Поточний стан джерела та доступність його довідників.</p></div></div>
          <div className="admin-source-card"><div><span className={`admin-source-dot ${source?.connected ? 'connected' : ''}`} /><strong>{source?.label || 'Перевірка джерела'}</strong><span className="admin-badge">{source ? (source.connected ? 'Підключено' : 'Недоступне') : 'Завантаження'}</span></div><p>{source?.message || sourceError || 'Завантаження стану…'}</p><p className="admin-hint">{options ? `Довідники доступні: ${Object.keys(options).length}.` : optionsError ? 'Довідники наразі недоступні.' : 'Перевірка довідників…'}</p></div>
          <button type="button" className="admin-button" disabled={busy} onClick={() => void perform(async () => {
            const results = await Promise.allSettled([api.sourceStatus(), api.options()])
            if (results[0].status === 'fulfilled') { setSource(results[0].value); setSourceError('') } else { setSource(null); setSourceError(String(results[0].reason)) }
            if (results[1].status === 'fulfilled') { setOptions(results[1].value); setOptionsError('') } else { setOptions(null); setOptionsError(String(results[1].reason)) }
            setNotice('Перевірку джерела завершено.')
          })}><RefreshCw size={15} />Перевірити підключення</button>
          <p className="admin-hint">Адреса джерела, облікові дані й правила з’єднання налаштовуються на сервері. Ця сторінка показує їхній стан.</p>
        </>}

        {section === 'history' && <>
          <div className="admin-section-heading"><History size={20} /><div><h3>Історія опублікованих налаштувань</h3><p>Відновлення створює нову версію й зберігає попередні публікації.</p></div></div>
          {!authenticated ? <p className="admin-hint">Увійдіть за ключем адміністратора, щоб переглянути історію і відновити версію.</p> : <>
            <div className="admin-history-list">{[...history].sort((first, second) => second.revision - first.revision).map(item => <div key={item.revision}><strong>Версія {item.revision}</strong><span>{item.action === 'rollback' ? 'Відновлення' : item.action === 'initial' ? 'Початкові налаштування' : 'Публікація'}</span><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('uk-UA')}</time>{item.revision === revision && <span className="admin-badge">Поточна</span>}</div>)}</div>
            {!history.length && <p className="admin-hint">Історія поки порожня.</p>}
            <div className="admin-rollback"><label><span>Відновити налаштування з версії</span><select aria-label="Відновити налаштування з версії" value={rollbackTarget} onChange={event => setRollbackTarget(event.target.value)}><option value="">Оберіть версію</option>{history.filter(item => item.revision !== revision).map(item => <option value={item.revision} key={item.revision}>Версія {item.revision} — {new Date(item.created_at).toLocaleDateString('uk-UA')}</option>)}</select></label><button type="button" className="admin-button" disabled={busy || !rollbackTarget || dirty} onClick={() => void perform(rollback)}><Undo2 size={15} />Відновити</button></div>
            {dirty && <p className="admin-hint">Щоб відновити версію, спочатку збережіть локальну чернетку.</p>}
          </>}
        </>}
      </fieldset>
    </div>

    {!analyticsSection && <footer className="admin-actions"><div><strong>{authenticated ? 'Зміни для всієї команди' : 'Локальна чернетка'}</strong><span>{dirty ? 'Є незбережені зміни' : hasDraftChanges ? 'Чернетка ще не опублікована' : `Опублікована версія ${revision}`}</span></div><div>
      {isPreview && <button type="button" className="admin-button" onClick={clearPreview}>Завершити перегляд</button>}
      {dirty && <button type="button" className="admin-button" disabled={busy} onClick={() => { setDraft(clone(savedDraft)); clearPreview(); setError(''); setNotice('Локальні зміни скасовано. За потреби оновіть налаштування із сервера.') }}>Скасувати локальні зміни</button>}
      <button type="button" className="admin-button" onClick={preview} disabled={busy}><Eye size={16} />Переглянути</button>
      <button type="button" className="admin-button" disabled={busy || !authenticated || dirty} onClick={() => void perform(async () => { await readStatus(token); setNotice('Завантажено актуальні налаштування.') })}><RefreshCw size={16} />Оновити</button>
      <button type="button" className="admin-button" disabled={busy || !authenticated} onClick={() => void perform(save)}><Save size={16} />Зберегти чернетку</button>
      <button type="button" className="admin-button admin-button-primary" disabled={busy || !authenticated} onClick={() => void perform(publish)}><Check size={16} />{busy ? 'Виконується…' : 'Опублікувати'}</button>
    </div></footer>}
  </section>
}
