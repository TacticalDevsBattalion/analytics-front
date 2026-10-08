import { Calculator, Plus, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppConfiguration } from '../config/appConfiguration'
import { api } from '../lib/api'
import { normalizePurposeKpiValue, purposeKpiSample, uniquePurposeKpiValues, validatePurposeKpi } from '../lib/purposeKpiEditor'
import type { FilterState } from '../lib/types'
import './PurposeKpiEditor.css'

type KpiConfiguration = AppConfiguration['kpi']
type PurposeRule = KpiConfiguration['purpose_rules'][number]
type PreviewResponse = Awaited<ReturnType<typeof api.kpiPreview>>
const number = (value: number) => value.toLocaleString('uk-UA', { maximumFractionDigits: 2 })
const percentage = (value: number | null) => value === null ? 'Немає бази для розрахунку' : `${number(value)}%`
const defaultRule = (purpose: string): PurposeRule => ({ purpose, success_mode: 'source', successful_results: [], usefulness_percent: 100, coefficient: 1 })
const errorMessage = (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : 'Не вдалося виконати перевірку KPI.'
  if (message.includes('require the full ClickHouse flight dataset')) return 'Для розрахунку правил за метами потрібне повне джерело вильотів ClickHouse. Поточне джерело не підтримує цю перевірку.'
  if (message.includes('temporarily unavailable')) return 'Джерело даних тимчасово недоступне. Спробуйте перевірити пізніше.'
  return message
}
const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const previousWeek = () => {
  const date = new Date()
  date.setDate(date.getDate() - 6)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const previewFilters = (dateFrom: string, dateTo: string): FilterState => ({ date_from: dateFrom, date_to: dateTo, direction: [], unit: [], category: [], asset: [], group: [], bbak: [], rota: [], battalion: [], purpose: [], class_name: [], result: [] })

export function PurposeKpiEditor({ value, onChange }: {
  value: KpiConfiguration
  onChange: (value: KpiConfiguration) => void
}) {
  const [options, setOptions] = useState<{ purposes: string[]; results: string[] } | null>(null)
  const [optionsError, setOptionsError] = useState('')
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedPurpose, setSelectedPurpose] = useState('')
  const [resultSearch, setResultSearch] = useState('')
  const [sampleFlights, setSampleFlights] = useState('10')
  const [sampleSuccess, setSampleSuccess] = useState('6')
  const [dateFrom, setDateFrom] = useState(previousWeek)
  const [dateTo, setDateTo] = useState(today)
  const [preview, setPreview] = useState<{ data: PreviewResponse; signature: string } | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [previewBusy, setPreviewBusy] = useState(false)
  const previewController = useRef<AbortController | null>(null)
  const alive = useRef(true)
  const currentSignature = JSON.stringify({ kpi: value, date_from: dateFrom, date_to: dateTo })
  const signatureRef = useRef(currentSignature)
  signatureRef.current = currentSignature
  const validationError = validatePurposeKpi(value)

  async function loadOptions() {
    setOptionsLoading(true)
    setOptionsError('')
    try { const response = await api.kpiOptions(); if (alive.current) setOptions(response) }
    catch (reason) { if (alive.current) setOptionsError(errorMessage(reason)) }
    finally { if (alive.current) setOptionsLoading(false) }
  }

  useEffect(() => {
    alive.current = true
    void loadOptions()
    return () => { alive.current = false; previewController.current?.abort() }
  }, [])

  useEffect(() => {
    if (previewController.current) {
      previewController.current.abort()
      previewController.current = null
      setPreviewBusy(false)
    }
    setPreviewError('')
  }, [currentSignature])

  const allPurposes = useMemo(() => uniquePurposeKpiValues([...(options?.purposes || []), ...value.purpose_rules.map(rule => rule.purpose)]).sort((first, second) => first.localeCompare(second, 'uk-UA')), [options, value.purpose_rules])
  const filteredPurposes = allPurposes.filter(purpose => !search.trim() || purpose.toLocaleLowerCase('uk-UA').includes(search.trim().toLocaleLowerCase('uk-UA')))
  const activePurpose = allPurposes.includes(selectedPurpose) ? selectedPurpose : allPurposes[0] || ''
  const rule = value.purpose_rules.find(item => normalizePurposeKpiValue(item.purpose) === normalizePurposeKpiValue(activePurpose))
  const shownRule = rule || defaultRule(activePurpose)
  const results = uniquePurposeKpiValues([...(options?.results || []), ...shownRule.successful_results]).sort((first, second) => first.localeCompare(second, 'uk-UA'))
    .filter(result => !resultSearch.trim() || result.toLocaleLowerCase('uk-UA').includes(resultSearch.trim().toLocaleLowerCase('uk-UA')))
  const sample = sampleFlights.trim() && sampleSuccess.trim() ? purposeKpiSample(shownRule, Number(sampleFlights), Number(sampleSuccess)) : null
  const previewStale = Boolean(preview && preview.signature !== currentSignature)

  function setRule(next: PurposeRule) {
    const exists = value.purpose_rules.some(item => normalizePurposeKpiValue(item.purpose) === normalizePurposeKpiValue(next.purpose))
    onChange({ ...value, purpose_rules: exists ? value.purpose_rules.map(item => normalizePurposeKpiValue(item.purpose) === normalizePurposeKpiValue(next.purpose) ? next : item) : [...value.purpose_rules, next] })
  }

  async function calculate() {
    const error = validatePurposeKpi(value)
    if (error) { setPreviewError(error); return }
    if (!dateFrom || !dateTo || dateFrom > dateTo) { setPreviewError('Оберіть коректний період: початок має бути не пізніше завершення.'); return }
    previewController.current?.abort()
    const controller = new AbortController()
    previewController.current = controller
    const signature = currentSignature
    setPreviewBusy(true)
    setPreviewError('')
    try {
      const data = await api.kpiPreview({ filters: previewFilters(dateFrom, dateTo), kpi: structuredClone(value) }, controller.signal)
      if (alive.current && !controller.signal.aborted && signatureRef.current === signature) setPreview({ data, signature })
    } catch (reason) {
      if (alive.current && !controller.signal.aborted) setPreviewError(errorMessage(reason))
    } finally {
      if (alive.current && previewController.current === controller) { previewController.current = null; setPreviewBusy(false) }
    }
  }

  return <div className="purpose-kpi-editor">
    <div className="admin-section-heading"><Calculator size={20} /><div><h3>Розрахунок KPI для кожної мети</h3><p>Задайте, що вважається успішним вильотом, його частку корисної дії та вагу в загальному KPI. Кожна мета з джерела налаштовується окремо.</p></div></div>
    <div className="purpose-kpi-formula"><strong>Зважений KPI, %</strong><code>100 × Σ(успішні × частка / 100 × коефіцієнт) / Σ(усі × коефіцієнт)</code><p>Частка визначає внесок успішного вильоту. Коефіцієнт задає вагу мети в загальному показнику; 0 виключає її лише зі зваженого KPI. Звичайна кількість вильотів залишається повною.</p></div>
    <div className="purpose-kpi-layout">
      <aside className="purpose-kpi-purposes"><label className="purpose-kpi-search"><Search size={15} /><span className="admin-sr-only">Знайти мету вильоту</span><input aria-label="Знайти мету вильоту" value={search} onChange={event => setSearch(event.target.value)} placeholder="Знайти мету вильоту" /></label>
        <div className="purpose-kpi-list" role="group" aria-label="Мети для налаштування KPI">{filteredPurposes.map(purpose => {
          const configured = value.purpose_rules.some(item => item.purpose === purpose)
          return <button type="button" className={activePurpose === purpose ? 'active' : ''} key={purpose} aria-pressed={activePurpose === purpose} onClick={() => { setSelectedPurpose(purpose); setResultSearch('') }}><span>{purpose}</span><small>{configured ? 'Власне правило' : 'Правило джерела'}{options && !options.purposes.includes(purpose) ? ' · збережена мета' : ''}</small></button>
        })}</div>
        {optionsLoading && <p className="admin-hint">Завантаження мет вильотів…</p>}
        {!optionsLoading && !filteredPurposes.length && <p className="admin-hint">{allPurposes.length ? 'Немає мет за цим пошуком.' : 'Джерело не повернуло мет вильотів. Збережені правила залишаються доступними.'}</p>}
        {optionsError && <div className="purpose-kpi-options-error"><p className="admin-hint">{optionsError}</p><button type="button" className="admin-button" onClick={() => void loadOptions()} disabled={optionsLoading}><RefreshCw size={14} />Повторити</button></div>}
        <p className="admin-hint">Власних правил: {value.purpose_rules.length}. Без правила використовується ознака успішності джерела, частка 100% і коефіцієнт 1.</p>
      </aside>
      <div className="purpose-kpi-rule">
        {!activePurpose ? <p className="admin-hint">Оберіть мету вильоту зі списку, щоб налаштувати її результативність.</p> : <>
          <div className="purpose-kpi-rule-heading"><div><span className="admin-eyebrow">ОКРЕМА МЕТА З ДЖЕРЕЛА</span><h4>{activePurpose}</h4></div><span className={`admin-badge ${rule ? 'admin-badge-draft' : ''}`}>{rule ? 'Власне правило' : 'Правило джерела'}</span></div>
          {!rule && <div className="purpose-kpi-default"><p>Зараз діє чинна ознака успішності джерела. Щоб змінити результативність цієї мети, додайте власне правило.</p><button type="button" className="admin-button" onClick={() => setRule(defaultRule(activePurpose))}><Plus size={15} />Налаштувати цю мету</button></div>}
          {rule && <>
            <label className="purpose-kpi-field"><span>Що вважається успішним вильотом</span><select aria-label="Що вважається успішним вильотом" value={rule.success_mode} onChange={event => setRule({ ...rule, success_mode: event.target.value as PurposeRule['success_mode'], successful_results: event.target.value === 'source' ? [] : rule.successful_results })}><option value="source">Чинна ознака успішності джерела</option><option value="results">Лише обрані результати вильоту</option></select></label>
            {rule.success_mode === 'results' && <div className="purpose-kpi-results"><label className="purpose-kpi-field"><span>Пошук успішного результату</span><input aria-label="Пошук успішного результату" value={resultSearch} onChange={event => setResultSearch(event.target.value)} placeholder="Назва результату" /></label><div className="purpose-kpi-result-list" role="group" aria-label="Успішні результати для цієї мети">{results.map(result => <label className="admin-check" key={result}><input type="checkbox" checked={rule.successful_results.includes(result)} onChange={event => setRule({ ...rule, successful_results: event.target.checked ? [...rule.successful_results, result] : rule.successful_results.filter(item => item !== result) })} /><span>{result}{options && !options.results.includes(result) && <small> Збережене значення, якого немає в поточному списку</small>}</span></label>)}</div>{!results.length && <p className="admin-hint">{resultSearch ? 'Немає результатів за цим пошуком.' : 'Результати поки недоступні. Оновіть довідник; збережені значення не видаляються.'}</p>}{!rule.successful_results.length && <p className="purpose-kpi-validation" role="alert">Оберіть хоча б один успішний результат для цього правила.</p>}</div>}
            <div className="admin-fields purpose-kpi-numbers"><label><span>Частка корисної дії успішного вильоту, %</span><input type="number" aria-label="Частка корисної дії, %" min={0} max={100} step="any" value={Number.isFinite(rule.usefulness_percent) ? rule.usefulness_percent : ''} onChange={event => setRule({ ...rule, usefulness_percent: event.target.value === '' ? Number.NaN : Number(event.target.value) })} /></label><label><span>Коефіцієнт мети</span><input type="number" aria-label="Коефіцієнт мети" min={0} max={100} step="any" value={Number.isFinite(rule.coefficient) ? rule.coefficient : ''} onChange={event => setRule({ ...rule, coefficient: event.target.value === '' ? Number.NaN : Number(event.target.value) })} /></label></div>
            <div className="purpose-kpi-rule-actions"><button type="button" className="admin-button" onClick={() => setRule(defaultRule(activePurpose))}><RotateCcw size={14} />Скинути значення правила</button><button type="button" className="admin-button" onClick={() => onChange({ ...value, purpose_rules: value.purpose_rules.filter(item => item.purpose !== activePurpose) })}><Trash2 size={14} />Прибрати власне правило</button></div>
          </>}
          <div className="purpose-kpi-sample"><h4>Приклад на ваших числах</h4><p>Ці числа ілюструють формулу та не змінюють дані джерела.</p><div className="admin-fields"><label><span>Усього вильотів у прикладі</span><input aria-label="Усього вильотів у прикладі" type="number" min={0} step={1} value={sampleFlights} onChange={event => setSampleFlights(event.target.value)} /></label><label><span>Успішних вильотів у прикладі</span><input aria-label="Успішних вильотів у прикладі" type="number" min={0} step={1} value={sampleSuccess} onChange={event => setSampleSuccess(event.target.value)} /></label></div>{sample ? <div className="purpose-kpi-sample-answer"><strong>{percentage(sample.value)}</strong><span>{number(sample.points)} корисних балів / {number(sample.capacity)} зважених вильотів</span></div> : <p className="purpose-kpi-validation">Вкажіть цілі невід’ємні числа; успішних вильотів має бути не більше загальної кількості.</p>}<p className="admin-hint">Для однієї мети ненульовий коефіцієнт скорочується у відношенні. Його вплив видно в загальному KPI, коли порівнюються різні мети.</p></div>
        </>}
      </div>
    </div>
    {validationError && <div className="admin-message admin-message-error" role="alert">{validationError}</div>}
    <div className="purpose-kpi-preview"><h4>Перевірити чернетку на даних джерела</h4><p className="admin-hint">Розрахунок охоплює всі мети за обраний період і використовує саме ці правила чернетки. Публікація та дані джерела не змінюються.</p><div className="purpose-kpi-preview-controls"><label className="purpose-kpi-field"><span>Дата початку</span><input aria-label="Дата початку перевірки KPI" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></label><label className="purpose-kpi-field"><span>Дата завершення</span><input aria-label="Дата завершення перевірки KPI" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} /></label><button type="button" className="admin-button admin-button-primary" disabled={previewBusy || Boolean(validationError)} onClick={() => void calculate()}><Calculator size={15} />{previewBusy ? 'Обчислюється…' : 'Перевірити розрахунок'}</button></div>
      {previewError && <div className="admin-message admin-message-error" role="alert">{previewError}</div>}
      {previewStale && <div className="admin-message purpose-kpi-stale" role="status">Правила або період змінилися. Показано попередній розрахунок; перевірте чернетку ще раз перед публікацією.</div>}
      {preview && <div className={`purpose-kpi-preview-result ${previewStale ? 'is-stale' : ''}`}><div className="purpose-kpi-totals"><div><span>Вильотів</span><strong>{number(preview.data.total_flights)}</strong></div><div><span>Успішних за правилами</span><strong>{number(preview.data.successful_flights)}</strong></div><div><span>Зважений KPI</span><strong>{percentage(preview.data.weighted_efficiency)}</strong></div><div><span>Зважена база</span><strong>{number(preview.data.weighted_flights)}</strong></div></div><p className="admin-hint">Корисних балів: {number(preview.data.usefulness_points)}. Джерело: {preview.data.source}. Це результат перевірки чернетки.</p><div className="purpose-kpi-table-wrap"><table className="purpose-kpi-table"><caption className="admin-sr-only">Розрахунок KPI окремо для кожної мети вильоту</caption><thead><tr><th>Мета вильоту</th><th>Вильотів</th><th>Успішних</th><th>Успішність</th><th>Частка, %</th><th>Коеф.</th><th>Корисні бали</th><th>Зважений KPI</th></tr></thead><tbody>{preview.data.purposes.map(item => <tr key={item.purpose}><td><strong>{item.purpose}</strong><small>{item.success_mode === 'results' ? `Результати: ${item.successful_results.join(', ')}` : 'Ознака успішності джерела'}</small></td><td>{number(item.flights)}</td><td>{number(item.successful_flights)}</td><td>{percentage(item.success_rate)}</td><td>{number(item.usefulness_percent)}</td><td>{number(item.coefficient)}</td><td>{number(item.usefulness_points)}</td><td>{item.weighted_efficiency === null ? '—' : percentage(item.weighted_efficiency)}</td></tr>)}</tbody></table></div>{!preview.data.purposes.length && <p className="admin-hint">За цей період немає вильотів. KPI недоступний, доки немає бази для розрахунку.</p>}</div>}
    </div>
  </div>
}
