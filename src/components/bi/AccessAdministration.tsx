import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, History, Search, Users } from 'lucide-react'
import { accessApi, type AccessProfile, type AccessUser } from '../../lib/accessApi'
import { startViewAs } from '../../lib/viewAs'
import './access.css'

const STATUS: Record<AccessUser['status'], string> = { pending: 'Очікує доступу', assigned: 'Налаштовано', custom: 'Старі права' }
const PROFILE_HELP: Record<AccessProfile, string> = {
  company: 'Екіпажі однієї роти. Порівняння з іншими — лише різниця.',
  battalion: 'Усі екіпажі батальйону. Порівняння з іншими — лише різниця.',
  command: 'Бачить і порівнює все. Змінює лише свій дашборд.',
  admin: 'Повний доступ, зокрема адміністрування.',
}
type Draft = { profile: AccessProfile | null; battalion_id: string; company_id: string; coordinates: boolean }
type Filter = 'all' | 'pending' | 'assigned' | 'custom'

const draftOf = (user?: AccessUser): Draft => ({ profile: user?.status === 'custom' ? null : user?.profile ?? null, battalion_id: user?.battalion_id ?? '', company_id: user?.company_id ?? '', coordinates: user?.coordinates ?? false })
const message = (reason: unknown) => reason instanceof Error ? reason.message : String(reason)
const readable = (text: string) => ({
  'Choose the user\'s battalion': 'Оберіть батальйон.',
  'Choose a company of the selected battalion': 'Оберіть роту з обраного батальйону.',
  'Access changed elsewhere; reload before saving': 'Доступ щойно змінив хтось інший. Оновіть список і повторіть.',
  'The last active administrator cannot be disabled or demoted': 'Це останній адміністратор: спершу призначте іншого.',
}[text] ?? text)

/** Who sees what: a profile, a unit and one switch per user. */
export function AccessAdministration({ token, onDirty }: { token?: string; onDirty: (dirty: boolean) => void }) {
  const client = useQueryClient()
  const data = useQuery({ queryKey: ['bi-admin', 'access', token], queryFn: ({ signal }) => accessApi.list(token, signal) })
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [draft, setDraft] = useState<Draft>(draftOf())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const users = data.data?.users ?? []
  const current = selected.length === 1 ? users.find(user => user.id === selected[0]) : undefined
  const base = useMemo(() => JSON.stringify(draftOf(current)), [current])
  const dirty = selected.length > 0 && JSON.stringify(draft) !== (selected.length === 1 ? base : JSON.stringify(draftOf()))
  useEffect(() => { onDirty(dirty); return () => onDirty(false) }, [dirty, onDirty])
  const counts = useMemo(() => ({ all: users.length, pending: users.filter(user => user.status === 'pending').length, assigned: users.filter(user => user.status === 'assigned').length, custom: users.filter(user => user.status === 'custom').length }), [users])
  const visible = users.filter(user => (filter === 'all' || user.status === filter) && `${user.display_name} ${user.username} ${user.battalion ?? ''} ${user.company ?? ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const companies = (data.data?.companies ?? []).filter(company => company.department_id === draft.battalion_id)
  const needsBattalion = draft.profile === 'company' || draft.profile === 'battalion'
  const valid = draft.profile !== null && (!needsBattalion || draft.battalion_id !== '') && (draft.profile !== 'company' || draft.company_id !== '')
  const history = useQuery({ queryKey: ['bi-admin', 'access-audit', current?.id, token], queryFn: ({ signal }) => accessApi.audit(current!.id, token, signal), enabled: historyOpen && !!current })

  const choose = (ids: string[]) => {
    setSelected(ids); setError(''); setNotice(''); setHistoryOpen(false)
    setDraft(draftOf(ids.length === 1 ? users.find(user => user.id === ids[0]) : undefined))
  }
  const toggle = (id: string) => choose(selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id])
  const save = async () => {
    if (!valid || !draft.profile) return
    setBusy(true); setError(''); setNotice('')
    const body = { profile: draft.profile, battalion_id: needsBattalion ? draft.battalion_id : null, company_id: draft.profile === 'company' ? draft.company_id : null, coordinates: needsBattalion && draft.coordinates }
    try {
      if (current) {
        await accessApi.assign(current.id, { ...body, expected_revision: current.status === 'pending' ? null : current.revision }, token)
        setNotice('Доступ збережено. Якщо змінилась роль адміністратора, користувач має увійти знову.')
      } else {
        const result = await accessApi.assignMany({ ...body, user_ids: selected }, token)
        setNotice(`Призначено: ${result.users.length}.` + (result.errors.length ? ` Не вдалося: ${result.errors.map(item => `${users.find(user => user.id === item.user_id)?.display_name ?? item.user_id} — ${readable(item.error)}`).join('; ')}` : ''))
      }
      await client.invalidateQueries({ queryKey: ['bi-admin', 'access'] })
      await client.invalidateQueries({ queryKey: ['bi-admin', 'access-audit'] })
    } catch (reason) { setError(readable(message(reason))) } finally { setBusy(false) }
  }

  if (data.isPending) return <p className="bi-state" role="status">Завантаження доступів…</p>
  if (data.isError) return <div className="bi-error-banner" role="alert">{readable(data.error.message)}</div>
  return <div className="access-admin">
    <div className="access-admin__list">
      <div className="access-admin__filters" role="tablist" aria-label="Фільтр користувачів">
        {(['all', 'pending', 'assigned', 'custom'] as Filter[]).filter(key => key !== 'custom' || counts.custom > 0).map(key => <button type="button" role="tab" aria-selected={filter === key} key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{{ all: 'Усі', pending: 'Нові', assigned: 'Налаштовані', custom: 'Старі права' }[key]} <b>{counts[key]}</b></button>)}
      </div>
      <label className="access-admin__search"><Search size={15} aria-hidden="true" /><input type="search" placeholder="Пошук за ім'ям чи підрозділом" value={search} onChange={event => setSearch(event.target.value)} /></label>
      {visible.length === 0 ? <p className="bi-state">Нікого не знайдено.</p> : <ul>
        {visible.map(user => <li key={user.id} className={selected.includes(user.id) ? 'active' : ''}>
          <input type="checkbox" aria-label={`Вибрати ${user.display_name}`} checked={selected.includes(user.id)} disabled={busy} onChange={() => toggle(user.id)} />
          <button type="button" disabled={busy} onClick={() => choose([user.id])}>
            <strong>{user.display_name || user.username}</strong>
            <span className={`access-status access-status--${user.status}`}>{STATUS[user.status]}</span>
            <small>{user.profile ? data.data!.profiles.find(item => item.id === user.profile)?.title : '—'}{user.battalion ? ` · ${user.battalion}` : ''}{user.company ? ` · ${user.company}` : ''}{!user.active ? ' · вимкнено' : ''}</small>
          </button>
        </li>)}
      </ul>}
    </div>
    <div className="access-admin__form">
      {selected.length === 0 ? <div className="access-admin__empty"><Users size={28} aria-hidden="true" /><p>Оберіть користувача, щоб призначити доступ. Позначте кількох, щоб призначити однаковий доступ усім одразу.</p>{counts.pending > 0 && <button type="button" className="secondary" onClick={() => setFilter('pending')}>Показати нових ({counts.pending})</button>}</div> : <>
        <h4>{current ? current.display_name || current.username : `Вибрано: ${selected.length}`}</h4>
        {current?.status === 'custom' && <p className="bi-notice">Доступ налаштовано старим способом (ролі й окремі дозволи). Оберіть профіль, щоб перейти на простий.</p>}
        <fieldset className="access-admin__profiles"><legend>1. Що може робити?</legend>
          {data.data!.profiles.map(profile => <label key={profile.id} className={draft.profile === profile.id ? 'active' : ''}>
            <input type="radio" name="access-profile" checked={draft.profile === profile.id} disabled={busy} onChange={() => setDraft({ ...draft, profile: profile.id, company_id: profile.id === 'company' ? draft.company_id : '' })} />
            <span><strong>{profile.title}</strong><small>{PROFILE_HELP[profile.id]}</small></span>
          </label>)}
        </fieldset>
        {needsBattalion && <fieldset className="access-admin__unit"><legend>2. Підрозділ</legend>
          <label>Батальйон<select value={draft.battalion_id} disabled={busy} onChange={event => setDraft({ ...draft, battalion_id: event.target.value, company_id: '' })}><option value="">Оберіть батальйон</option>{data.data!.battalions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          {draft.profile === 'company' && <label>Рота<select value={draft.company_id} disabled={busy || !draft.battalion_id} onChange={event => setDraft({ ...draft, company_id: event.target.value })}><option value="">{draft.battalion_id ? 'Оберіть роту' : 'Спершу оберіть батальйон'}</option>{companies.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
          <label className="access-admin__switch"><input type="checkbox" checked={draft.coordinates} disabled={busy} onChange={event => setDraft({ ...draft, coordinates: event.target.checked })} /> Точні координати цілей на мапі</label>
        </fieldset>}
        {current && !dirty && <p className="access-admin__summary">{current.summary}</p>}
        {current && !dirty && current.status !== 'pending' && current.role !== 'administrator' && current.active && <button type="button" className="secondary access-admin__view-as" onClick={() => startViewAs({ id: current.id, name: current.display_name || current.username })}><Eye size={15} aria-hidden="true" /> Переглянути застосунок як цей користувач</button>}
        {error && <p className="bia-error" role="alert">{error}</p>}
        {notice && <p className="bi-notice" role="status">{notice}</p>}
        <div className="access-admin__actions">
          <button type="button" className="secondary" disabled={busy || !dirty} onClick={() => choose(selected)}>Скасувати</button>
          <button type="button" className="primary" disabled={busy || !valid || !dirty} onClick={() => void save()}>{busy ? 'Збереження…' : selected.length > 1 ? `Призначити ${selected.length} користувачам` : 'Зберегти'}</button>
        </div>
        {current && current.status !== 'pending' && <details className="access-admin__history" open={historyOpen} onToggle={event => setHistoryOpen((event.target as HTMLDetailsElement).open)}>
          <summary><History size={14} aria-hidden="true" /> Історія змін</summary>
          {history.isPending ? <p className="bi-state">Завантаження…</p> : history.isError ? <p className="bia-error">{history.error.message}</p> : history.data?.length ? <ol>{history.data.map(item => <li key={item.changed_at}><time>{new Date(item.changed_at).toLocaleString('uk-UA')}</time> · {item.actor ?? 'система'}: {describe(item.before, data.data!.profiles)} → <b>{describe(item.after, data.data!.profiles)}</b></li>)}</ol> : <p className="bi-state">Змін ще не було.</p>}
        </details>}
      </>}
    </div>
  </div>
}

function describe(value: { profile?: AccessProfile | null; battalion_id?: string | null; company_id?: string | null } | null, profiles: Array<{ id: AccessProfile; title: string }>) {
  if (!value?.profile) return 'без профілю'
  return [profiles.find(item => item.id === value.profile)?.title ?? value.profile, value.battalion_id && `бат. ${value.battalion_id}`, value.company_id && `рота ${value.company_id}`].filter(Boolean).join(', ')
}
