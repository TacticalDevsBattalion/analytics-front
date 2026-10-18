import { Calculator, Plus, RefreshCw, RotateCcw, Search, Sparkles, Trash2 } from 'lucide-react'
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
const defaultRule = (purpose: string): PurposeRule => ({ purpose, success_mode: 'source', successful_results: [], usefulness_percent: 100, coefficient: 1, loss_rule: 'ignore' })
// Reconnaissance is useful only when something was found, a target was re-checked or a strike filmed.
const RECON_RESULTS = ['Виявлено', 'Підтверджено', 'Фіксація']
const isRecon = (purpose: string) => normalizePurposeKpiValue(purpose).includes('розвідка')
const reconRule = (purpose: string, available: string[]): PurposeRule => {
  const present = available.filter(value => RECON_RESULTS.some(name => normalizePurposeKpiValue(name) === normalizePurposeKpiValue(value)))
  return { purpose, success_mode: 'events', successful_results: present.length ? present : RECON_RESULTS, usefulness_percent: 100, coefficient: 1, loss_rule: 'penalty' }
}
const SUCCESS_MODES: Record<PurposeRule['success_mode'], { label: string; hint: string }> = {
  source: { label: 'Як позначило джерело', hint: 'Береться ознака «результативний» із бази без змін.' },
  results: { label: 'За головним результатом вильоту', hint: 'Результативний, якщо головний результат вильоту — один з обраних нижче.' },
  events: { label: 'За записами під час вильоту', hint: 'Результативний, якщо під час вильоту був хоча б один запис з обраним результатом: виявлення, дорозвідка, зйомка ураження тощо. Виліт лише із записом «Розвідка» — нерезультативний.' },
}
const LOSS_RULES: Record<NonNullable<PurposeRule['loss_rule']>, { label: string; hint: string }> = {
  ignore: { label: 'Не враховувати', hint: 'Втрата борту на результативність не впливає.' },
  unsuccessful: { label: 'Виліт із втратою — нерезультативний', hint: 'Навіть якщо щось виявили, виліт із втраченим бортом не зараховується.' },
  penalty: { label: 'Втрата без результату — мінус', hint: 'Нерезультативний виліт, у якому ще й втрачено борт, знімає один результативний: (результативні − такі вильоти) ÷ усі вильоти. Виліт із результатом і втратою зараховується.' },
}
const ruleSummary = (rule: PurposeRule) => {
  const success = rule.success_mode === 'source' ? 'як позначило джерело' : `${rule.success_mode === 'events' ? 'під час вильоту був запис' : 'головний результат'}: ${rule.successful_results.join(', ') || '—'}`
  const loss = rule.loss_rule === 'penalty' ? ' Втрата борту без результату — мінус один результативний.' : rule.loss_rule === 'unsuccessful' ? ' Виліт із втратою борту — нерезультативний.' : ''
  return `Результативний, якщо ${success}.${loss}`
}
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
  const [options, setOptions] = useState<{ purposes: string[]; results: string[]; event_results?: string[] } | null>(null)
  const [optionsError, setOptionsError] = useState('')
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedPurpose, setSelectedPurpose] = useState('')
  const [resultSearch, setResultSearch] = useState('')
  const [sampleFlights, setSampleFlights] = useState('10')
  const [sampleSuccess, setSampleSuccess] = useState('6')
  const [sampleLost, setSampleLost] = useState('1')
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
  const available = (shownRule.success_mode === 'events' ? options?.event_results : options?.results) || []
  const results = uniquePurposeKpiValues([...available, ...shownRule.successful_results]).sort((first, second) => first.localeCompare(second, 'uk-UA'))
    .filter(result => !resultSearch.trim() || result.toLocaleLowerCase('uk-UA').includes(resultSearch.trim().toLocaleLowerCase('uk-UA')))
  const lossPenalty = shownRule.loss_rule === 'penalty'
  const sample = sampleFlights.trim() && sampleSuccess.trim() && (!lossPenalty || sampleLost.trim()) ? purposeKpiSample(shownRule, Number(sampleFlights), Number(sampleSuccess), lossPenalty ? Number(sampleLost) : 0) : null
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
    <div className="admin-section-heading"><Calculator size={20} /><div><h3>Результативність і KPI для кожної мети</h3><p>Для кожної мети вильоту задайте: коли виліт результативний, як враховувати втрату борту і (за потреби) його вагу в зваженому KPI. Діє на всі картки, «Результативність», позиції й порівняння після публікації.</p></div></div>
    <div className="purpose-kpi-formula"><strong>Результативність, %</strong><code>100 × (результативні − вильоти з втратою без результату) / усі вильоти</code><p>Що таке «результативний» і чи віднімати втрату борту — задається окремо для кожної мети нижче. Мінус діє лише для мет, де він увімкнений, тому результативність може бути від’ємною.</p><strong>Зважений KPI, %</strong><code>100 × Σ((результативні − мінусові) × частка / 100 × коефіцієнт) / Σ(усі × коефіцієнт)</code><p>Частка визначає внесок успішного вильоту. Коефіцієнт задає вагу мети в загальному показнику; 0 виключає її лише зі зваженого KPI. Звичайна кількість вильотів залишається повною.</p></div>
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
          {!rule && <div className="purpose-kpi-default"><p>Зараз діє чинна ознака успішності джерела. Щоб змінити результативність цієї мети, додайте власне правило.</p><div className="purpose-kpi-rule-actions">{isRecon(activePurpose) && <button type="button" className="admin-button admin-button-primary" onClick={() => setRule(reconRule(activePurpose, options?.event_results || []))}><Sparkles size={15} />Рекомендоване для розвідки</button>}<button type="button" className="admin-button" onClick={() => setRule(defaultRule(activePurpose))}><Plus size={15} />Налаштувати цю мету</button></div>{isRecon(activePurpose) && <p className="admin-hint">Рекомендоване: результативний, лише якщо під час вильоту було виявлення, дорозвідка (підтвердження) або зйомка ураження; втрата борту без результату — мінус.</p>}</div>}
          {rule && <>
            <p className="purpose-kpi-summary" role="status">{ruleSummary(rule)}</p>
            <fieldset className="purpose-kpi-choice"><legend>1. Коли виліт результативний</legend>
              {(Object.keys(SUCCESS_MODES) as PurposeRule['success_mode'][]).map(mode => <label key={mode} className={rule.success_mode === mode ? 'active' : ''}><input type="radio" name="purpose-kpi-success" checked={rule.success_mode === mode} onChange={() => setRule({ ...rule, success_mode: mode, successful_results: mode === rule.success_mode ? rule.successful_results : [] })} /><span><strong>{SUCCESS_MODES[mode].label}</strong><small>{SUCCESS_MODES[mode].hint}</small></span></label>)}
            </fieldset>
            {rule.success_mode !== 'source' && <div className="purpose-kpi-results"><label className="purpose-kpi-field"><span>{rule.success_mode === 'events' ? 'Пошук запису під час вильоту' : 'Пошук успішного результату'}</span><input aria-label="Пошук успішного результату" value={resultSearch} onChange={event => setResultSearch(event.target.value)} placeholder="Назва результату" /></label><div className="purpose-kpi-result-list" role="group" aria-label="Успішні результати для цієї мети">{results.map(result => <label className="admin-check" key={result}><input type="checkbox" checked={rule.successful_results.includes(result)} onChange={event => setRule({ ...rule, successful_results: event.target.checked ? [...rule.successful_results, result] : rule.successful_results.filter(item => item !== result) })} /><span>{result}{options && !available.includes(result) && <small> Збережене значення, якого немає в поточному списку</small>}</span></label>)}</div>{!results.length && <p className="admin-hint">{resultSearch ? 'Немає результатів за цим пошуком.' : 'Результати поки недоступні. Оновіть довідник; збережені значення не видаляються.'}</p>}{!rule.successful_results.length && <p className="purpose-kpi-validation" role="alert">Оберіть хоча б один успішний результат для цього правила.</p>}</div>}
            <fieldset className="purpose-kpi-choice"><legend>2. Втрата борту</legend>
              {(Object.keys(LOSS_RULES) as NonNullable<PurposeRule['loss_rule']>[]).map(mode => <label key={mode} className={(rule.loss_rule ?? 'ignore') === mode ? 'active' : ''}><input type="radio" name="purpose-kpi-loss" checked={(rule.loss_rule ?? 'ignore') === mode} onChange={() => setRule({ ...rule, loss_rule: mode })} /><span><strong>{LOSS_RULES[mode].label}</strong><small>{LOSS_RULES[mode].hint}</small></span></label>)}
            </fieldset>
            <div className="admin-fields purpose-kpi-numbers"><p className="purpose-kpi-numbers-title">3. Вага у зваженому KPI (необов’язково)</p><label><span>Частка корисної дії успішного вильоту, %</span><input type="number" aria-label="Частка корисної дії, %" min={0} max={100} step="any" value={Number.isFinite(rule.usefulness_percent) ? rule.usefulness_percent : ''} onChange={event => setRule({ ...rule, usefulness_percent: event.target.value === '' ? Number.NaN : Number(event.target.value) })} /></label><label><span>Коефіцієнт мети</span><input type="number" aria-label="Коефіцієнт мети" min={0} max={100} step="any" value={Number.isFinite(rule.coefficient) ? rule.coefficient : ''} onChange={event => setRule({ ...rule, coefficient: event.target.value === '' ? Number.NaN : Number(event.target.value) })} /></label></div>
            <div className="purpose-kpi-rule-actions">{isRecon(activePurpose) && <button type="button" className="admin-button" onClick={() => setRule(reconRule(activePurpose, options?.event_results || []))}><Sparkles size={14} />Рекомендоване для розвідки</button>}<button type="button" className="admin-button" onClick={() => setRule(defaultRule(activePurpose))}><RotateCcw size={14} />Скинути значення правила</button><button type="button" className="admin-button" onClick={() => onChange({ ...value, purpose_rules: value.purpose_rules.filter(item => item.purpose !== activePurpose) })}><Trash2 size={14} />Прибрати власне правило</button></div>
          </>}
          <div className="purpose-kpi-sample"><h4>Приклад на ваших числах</h4><p>Ці числа ілюструють формулу та не змінюють дані джерела.</p><div className="admin-fields"><label><span>Усього вильотів у прикладі</span><input aria-label="Усього вильотів у прикладі" type="number" min={0} step={1} value={sampleFlights} onChange={event => setSampleFlights(event.target.value)} /></label><label><span>Успішних вильотів у прикладі</span><input aria-label="Успішних вильотів у прикладі" type="number" min={0} step={1} value={sampleSuccess} onChange={event => setSampleSuccess(event.target.value)} /></label>{lossPenalty && <label><span>Із решти — втрачено борт</span><input aria-label="Нерезультативних вильотів із втратою борту" type="number" min={0} step={1} value={sampleLost} onChange={event => setSampleLost(event.target.value)} /></label>}</div>{sample ? <div className="purpose-kpi-sample-answer"><strong>{percentage(sample.value)}</strong><span>{number(sample.points)} корисних балів / {number(sample.capacity)} зважених вильотів</span></div> : <p className="purpose-kpi-validation">Вкажіть цілі невід’ємні числа; успішних і втрачених разом має бути не більше загальної кількості.</p>}<p className="admin-hint">Для однієї мети ненульовий коефіцієнт скорочується у відношенні. Його вплив видно в загальному KPI, коли порівнюються різні мети.</p></div>
        </>}
      </div>
    </div>
    {validationError && <div className="admin-message admin-message-error" role="alert">{validationError}</div>}
    <div className="purpose-kpi-preview"><h4>Перевірити чернетку на даних джерела</h4><p className="admin-hint">Розрахунок охоплює всі мети за обраний період і використовує саме ці правила чернетки. Публікація та дані джерела не змінюються.</p><div className="purpose-kpi-preview-controls"><label className="purpose-kpi-field"><span>Дата початку</span><input aria-label="Дата початку перевірки KPI" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></label><label className="purpose-kpi-field"><span>Дата завершення</span><input aria-label="Дата завершення перевірки KPI" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} /></label><button type="button" className="admin-button admin-button-primary" disabled={previewBusy || Boolean(validationError)} onClick={() => void calculate()}><Calculator size={15} />{previewBusy ? 'Обчислюється…' : 'Перевірити розрахунок'}</button></div>
      {previewError && <div className="admin-message admin-message-error" role="alert">{previewError}</div>}
      {previewStale && <div className="admin-message purpose-kpi-stale" role="status">Правила або період змінилися. Показано попередній розрахунок; перевірте чернетку ще раз перед публікацією.</div>}
      {preview && <div className={`purpose-kpi-preview-result ${previewStale ? 'is-stale' : ''}`}><div className="purpose-kpi-totals"><div><span>Вильотів</span><strong>{number(preview.data.total_flights)}</strong></div><div><span>Успішних за правилами</span><strong>{number(preview.data.successful_flights)}</strong></div><div><span>Мінус за втрату</span><strong>{number(preview.data.penalized_flights ?? 0)}</strong></div><div><span>Зважений KPI</span><strong>{percentage(preview.data.weighted_efficiency)}</strong></div><div><span>Зважена база</span><strong>{number(preview.data.weighted_flights)}</strong></div></div><p className="admin-hint">Корисних балів: {number(preview.data.usefulness_points)}. Джерело: {preview.data.source}. Це результат перевірки чернетки.</p><div className="purpose-kpi-table-wrap"><table className="purpose-kpi-table"><caption className="admin-sr-only">Розрахунок KPI окремо для кожної мети вильоту</caption><thead><tr><th>Мета вильоту</th><th>Вильотів</th><th>Успішних</th><th>Мінус</th><th>Результативність</th><th>Частка, %</th><th>Коеф.</th><th>Корисні бали</th><th>Зважений KPI</th></tr></thead><tbody>{preview.data.purposes.map(item => <tr key={item.purpose}><td data-label="Мета вильоту"><strong>{item.purpose}</strong><small>{item.success_mode === 'source' ? 'Ознака успішності джерела' : `${item.success_mode === 'events' ? 'Записи' : 'Результати'}: ${item.successful_results.join(', ')}`}{item.loss_rule === 'penalty' ? ' · втрата без результату — мінус' : item.loss_rule === 'unsuccessful' ? ' · втрата — нерезультативний' : ''}</small></td><td data-label="Вильотів">{number(item.flights)}</td><td data-label="Успішних">{number(item.successful_flights)}</td><td data-label="Мінус">{number(item.penalized_flights ?? 0)}</td><td data-label="Результативність">{percentage(item.success_rate)}</td><td data-label="Частка, %">{number(item.usefulness_percent)}</td><td data-label="Коеф.">{number(item.coefficient)}</td><td data-label="Корисні бали">{number(item.usefulness_points)}</td><td data-label="Зважений KPI">{item.weighted_efficiency === null ? '—' : percentage(item.weighted_efficiency)}</td></tr>)}</tbody></table></div>{!preview.data.purposes.length && <p className="admin-hint">За цей період немає вильотів. KPI недоступний, доки немає бази для розрахунку.</p>}</div>}
    </div>
  </div>
}
