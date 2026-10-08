import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, Play, RefreshCw, Trash2 } from 'lucide-react'
import { biAdminApi, type BiKpi, type CachePeriod, type CacheRange, type CacheTarget } from '../../lib/biAdminApi'
import { cacheInvalidation, cacheWarmRequest } from '../../lib/cacheAdmin'
import type { MetricDefinition } from '../../lib/biTypes'

const targetOptions: Array<{ key: CacheTarget; title: string }> = [
  { key: 'CURRENT_PERIOD', title: 'Поточний місяць' }, { key: 'PERIOD', title: 'Обраний період' },
  { key: 'METRIC', title: 'Метрика' }, { key: 'KPI', title: 'KPI' },
  { key: 'DICTIONARY', title: 'Довідники / ваги' }, { key: 'ALL', title: 'Увесь analytics cache' },
]
const periodOptions: Array<{ key: CachePeriod; title: string }> = [
  { key: 'CURRENT_MONTH', title: 'Поточний місяць' }, { key: 'PREVIOUS_MONTH', title: 'Попередній місяць' },
  { key: 'LAST_HORIZON', title: 'Історія за cache horizon' }, { key: 'CUSTOM', title: 'Власний період' },
]
const number = (value: unknown) => typeof value === 'number' ? value.toLocaleString('uk-UA', { maximumFractionDigits: 2 }) : '—'
const bytes = (value: unknown) => typeof value === 'number' ? `${number(value / 1048576)} MiB` : '—'
const reason = (error: unknown) => error instanceof Error ? error.message : String(error)
const jobStatus: Record<string, string> = { queued: 'У черзі', running: 'Виконується', complete: 'Завершено', failed: 'Помилка', interrupted: 'Перервано перезапуском' }

function RangeInputs({ range, onChange }: { range: CacheRange; onChange: (range: CacheRange) => void }) {
  return <div className="bia-fields"><label className="bia-field"><span>Від</span><input type="date" value={range.from} onChange={event => onChange({ ...range, from: event.target.value })} /></label><label className="bia-field"><span>До</span><input type="date" value={range.to} onChange={event => onChange({ ...range, to: event.target.value })} /></label></div>
}

export function CacheAdministration({ token, metrics, kpis }: { token?: string; metrics: MetricDefinition[]; kpis: BiKpi[] }) {
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<CacheTarget>('CURRENT_PERIOD')
  const [range, setRange] = useState<CacheRange>({ from: '', to: '' })
  const [key, setKey] = useState('')
  const [periods, setPeriods] = useState<CachePeriod[]>(['CURRENT_MONTH', 'PREVIOUS_MONTH', 'LAST_HORIZON'])
  const [metricKeys, setMetricKeys] = useState<string[]>(() => ['flights', 'effective', 'efficiency'].filter(key => metrics.some(metric => metric.key === key)))
  const [jobId, setJobId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const status = useQuery({ queryKey: ['bi-admin', 'cache-status', token], queryFn: ({ signal }) => biAdminApi.cacheStatus(token, signal), staleTime: 10000, refetchInterval: 30000, retry: false })
  const job = useQuery({ queryKey: ['bi-admin', 'cache-job', jobId, token], enabled: Boolean(jobId), queryFn: ({ signal }) => biAdminApi.cacheJob(jobId!, token, signal), retry: false, refetchInterval: query => query.state.error || query.state.data && !['queued', 'running'].includes(query.state.data.status) ? false : 2000 })
  const activeJob = Boolean(jobId && (!job.data || ['queued', 'running'].includes(job.data.status)))
  const stats = status.data?.cache
  const policy = status.data?.policy
  const invalidationOptions = target === 'KPI' ? [{ key: 'mission', title: 'KPI місій / правила цілей' }, ...kpis.filter(item => item.key !== 'mission')] : metrics
  const clear = async () => {
    setError(''); setNotice('')
    let payload
    try { payload = cacheInvalidation(target, range, key) } catch (error) { setError(reason(error)); return }
    setBusy(true)
    try {
      const result = await biAdminApi.invalidateCache(payload, token)
      setNotice(result.affected_partitions !== undefined ? `Інвалідовано ${result.affected_partitions} залежних partition tags.` : 'Cache інвалідовано. Наступні запити перерахують потрібні дані.')
      await Promise.all([status.refetch(), queryClient.invalidateQueries({ queryKey: ['bi-dashboard-query'] }), queryClient.invalidateQueries({ queryKey: ['bi-comparison'] })])
    } catch (error) { setError(reason(error)) } finally { setBusy(false) }
  }
  const warm = async () => {
    setError(''); setNotice('')
    let payload
    try { payload = cacheWarmRequest(periods, range, metricKeys) } catch (error) { setError(reason(error)); return }
    setBusy(true)
    try { const result = await biAdminApi.warmCache(payload, token); setJobId(result.id); queryClient.setQueryData(['bi-admin', 'cache-job', result.id, token], result); setNotice('Підготовку запущено у фоні.') } catch (error) { setError(reason(error)) } finally { setBusy(false) }
  }
  return <div className="bia-cache"><header className="bia-heading"><div><h3><Database size={17} /> Analytics cache</h3><p>Повторне використання агрегатів з урахуванням області даних, метрик та версій конфігурації.</p></div><button type="button" className="secondary" disabled={status.isFetching} onClick={() => void status.refetch()}><RefreshCw size={14} /> Оновити стан</button></header>
    {status.isPending && <p className="bi-state" role="status">Завантаження стану cache…</p>}{status.isError && <div className="bi-error-banner" role="alert">{status.error.message}</div>}
    {stats && <><p className={stats.degraded ? 'bia-error' : 'bi-notice'} role="status">{stats.enabled ? stats.redis_configured ? stats.redis_available ? 'Redis підключений; shared cache доступний.' : 'Redis недоступний. Backend продовжує працювати через джерело даних.' : 'Redis не налаштований; використовується локальний cache.' : 'Analytics cache вимкнений.'}</p><div className="bia-cache-cards">{[['Cache hits', number(stats.hits)], ['Cache misses', number(stats.misses)], ['Hit ratio', typeof stats.hit_ratio === 'number' ? `${number(stats.hit_ratio * 100)}%` : '—'], ['Redis keys (DB)', number(stats.redis_keys_count)], ['Cache lookup avg', typeof stats.average_lookup_milliseconds === 'number' ? `${number(stats.average_lookup_milliseconds)} ms` : '—'], ['L1 / Redis hits', `${number(stats.l1_hits)} / ${number(stats.redis_hits)}`], ['L1 memory / limit', `${bytes(stats.l1_bytes)} / ${bytes(stats.l1_max_bytes)}`], ['Redis memory', bytes(stats.redis_memory_bytes)], ['DB loads / errors', `${number(stats.loads)} / ${number(stats.load_errors)}`]].map(([title, value]) => <article key={title}><span>{title}</span><strong>{value}</strong></article>)}</div></>}
    {policy && <p className="bi-notice">Horizon: {policy.horizon_days} днів. Hot: 0–{policy.hot_days} днів, TTL {policy.hot_ttl_seconds}s; warm: до {policy.warm_days} днів, TTL {policy.warm_ttl_seconds}s; historical TTL {policy.historical_ttl_seconds}s. Старші періоди залишаються доступними через джерело даних.</p>}
    <div className="bia-cache-controls"><fieldset className="bia-form" disabled={busy || status.isError}><h3>Інвалідація cache</h3><label className="bia-field"><span>Що оновити</span><select value={target} onChange={event => { setTarget(event.target.value as CacheTarget); setKey('') }}>{targetOptions.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}</select></label>{target === 'PERIOD' && <RangeInputs range={range} onChange={setRange} />}{(target === 'METRIC' || target === 'KPI') && <label className="bia-field"><span>{target === 'METRIC' ? 'Метрика' : 'KPI'}</span><select value={key} onChange={event => setKey(event.target.value)}><option value="">Оберіть значення</option>{invalidationOptions.map(item => <option key={item.key} value={item.key}>{item.title || item.key}</option>)}</select></label>}<p className="bi-notice">Оновлюються лише залежні cache entries. Первинні дані та налаштування зберігаються.</p><button type="button" className="secondary" onClick={() => void clear()}><Trash2 size={14} /> {target === 'ALL' ? 'Інвалідувати весь cache' : 'Інвалідувати обраний cache'}</button></fieldset>
    <fieldset className="bia-form" disabled={busy || activeJob || status.isError}><h3>Підготовка агрегатів у фоні</h3><div className="bia-cache-periods">{periodOptions.map(item => <label className="bia-check" key={item.key}><input type="checkbox" checked={periods.includes(item.key)} onChange={event => setPeriods(event.target.checked ? [...periods, item.key] : periods.filter(key => key !== item.key))} />{item.title}</label>)}</div>{periods.includes('CUSTOM') && <RangeInputs range={range} onChange={setRange} />}<fieldset className="bia-choices"><legend>Метрики (до 30)</legend><div>{metrics.map(item => <label className="bia-check" key={item.key}><input type="checkbox" checked={metricKeys.includes(item.key)} onChange={event => setMetricKeys(event.target.checked ? [...metricKeys, item.key] : metricKeys.filter(key => key !== item.key))} />{item.title || item.key}</label>)}</div></fieldset><button type="button" className="secondary" disabled={!periods.length || !metricKeys.length} onClick={() => void warm()}><Play size={14} /> Підготувати cache</button></fieldset></div>
    {error && <div className="bi-error-banner" role="alert">{error}</div>}{notice && <p className="bi-notice" role="status">{notice}</p>}
    {jobId && <section className="bia-cache-job" aria-live="polite"><h4>Фонове завдання</h4>{job.isError ? <p className="bia-error">{job.error.message}</p> : job.data ? <><p>{jobStatus[job.data.status] ?? job.data.status} · {job.data.completed_queries} / {job.data.total_queries} запитів</p><progress max={Math.max(1, job.data.total_queries)} value={job.data.completed_queries} /><small>ID: {job.data.id} · оновлено {job.data.updated_at}</small>{job.data.error_code && <p className="bia-error">{job.data.error_code === 'analytics_unavailable' ? 'Джерело analytics недоступне або запит завершився помилкою. Перевірте backend logs та повторіть підготовку.' : job.data.error_code}</p>}</> : <p>Перевірка стану…</p>}<button type="button" className="secondary" disabled={job.isFetching} onClick={() => void job.refetch()}><RefreshCw size={14} /> Оновити завдання</button></section>}
    {stats && <details className="bia-advanced"><summary>Детальна діагностика</summary><pre className="bia-cache-details">{JSON.stringify(stats, null, 2)}</pre></details>}
  </div>
}
