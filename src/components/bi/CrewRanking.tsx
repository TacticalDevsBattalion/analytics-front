import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import { biApi } from '../../lib/biApi'
import { dashboardGlobalFilters } from '../../lib/biBuilder'
import { rankingApi, type RankingRow } from '../../lib/rankingApi'
import type { FilterState } from '../../lib/types'
import { useLanguage } from '../../i18n/LanguageContext'
import { usePreferenceSync } from '../../config/PreferencesContext'
import './ranking.css'

/** Own crews with one score per kind of mission and overall, and their places in the company, the battalion and the brigade. */
export function CrewRanking({ filters }: { filters: FilterState }) {
  const { tr, locale } = useLanguage()
  const metadata = useQuery({ queryKey: ['bi-metadata'], queryFn: ({ signal }) => biApi.metadata(signal) })
  const hierarchy = useQuery({ queryKey: ['bi-hierarchy'], queryFn: ({ signal }) => biApi.hierarchy(signal) })
  const [category, setCategory] = useState('')
  const [mission, setMission] = useState('all')
  usePreferenceSync<{ category?: string; mission?: string }>('ranking', { category, mission }, saved => { if (typeof saved.category === 'string') setCategory(saved.category); if (typeof saved.mission === 'string') setMission(saved.mission) })
  const queryFilters = dashboardGlobalFilters(filters, metadata.data?.filter_fields ?? [])
  const ranking = useQuery({
    queryKey: ['crew-ranking', 'missions', filters.date_from, filters.date_to, filters.time_from, filters.time_to, queryFilters],
    queryFn: ({ signal }) => rankingApi.get({ date_range: { from: filters.date_from, to: filters.date_to }, ...(filters.time_from ? { time_from: filters.time_from } : {}), ...(filters.time_to ? { time_to: filters.time_to } : {}), filters: queryFilters }, signal),
    enabled: !!metadata.data,
  })
  const titles = useMemo(() => ({
    battalion: new Map((hierarchy.data?.departments ?? []).map(item => [String(item.id), item.title])),
    company: new Map((hierarchy.data?.groups ?? []).map(item => [String(item.id), item.title])),
  }), [hierarchy.data])
  const missions = ranking.data?.missions ?? []
  const missionTitle = new Map(missions.map(item => [item.id, item.title]))
  const current = missions.some(item => item.id === mission) ? mission : 'all'
  const overall = current === 'all'
  const rows = (ranking.data?.rows ?? []).filter(row => row.mission === current)
  const categories = [...new Set(rows.map(row => row.category))].sort((a, b) => a.localeCompare(b, 'uk'))
  const selected = category && categories.includes(category) ? category : ''
  const number = (value: number, digits = 1) => value.toLocaleString(locale, { maximumFractionDigits: digits })
  const full = ranking.data?.full_list ?? false
  const ignored = ranking.data?.ignore_losses[current] ?? []
  const place = (value: number, total: number) => <span className="crew-ranking__place"><b>{value}</b> {tr('з', 'of')} {total}<i style={{ ['--share' as string]: `${Math.max(4, 100 - ((value - 1) / Math.max(1, total)) * 100)}%` }} aria-hidden="true" /></span>
  // Each value with the crew's percentile on that criterion among the crews of its кафедра and mission group.
  const part = (text: string, share: number | undefined) => share === undefined ? <span className="crew-ranking__part" title={tr('Не враховується для цієї кафедри', 'Not counted for this department')}>{text}<small>—</small></span>
    : <span className="crew-ranking__part" title={tr(`Краще, ніж у ${number(share, 0)}% екіпажів`, `Better than ${number(share, 0)}% of crews`)}>{text}<small>{number(share, 0)}</small></span>

  return <section className="crew-ranking panel">
    <header className="crew-ranking__head">
      <div><h2><Trophy size={18} aria-hidden="true" /> {tr('Рейтинг екіпажів', 'Crew ranking')}</h2>
        <p>{full ? tr('Усі екіпажі бригади за кожною кафедрою.', 'All crews of the brigade, per department.') : tr('Ваші екіпажі та їхні місця серед усіх екіпажів бригади за кожною кафедрою. Назви й показники інших екіпажів не показуються.', 'Your crews and their places among all crews of the brigade, per department. Other crews are not shown.')}</p></div>
      <div className="crew-ranking__controls">
        <label>{tr('Кафедра', 'Department')}<select value={selected} onChange={event => setCategory(event.target.value)}><option value="">{tr('Усі кафедри', 'All departments')}</option>{categories.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>
    </header>
    {missions.length > 1 && <div className="crew-ranking__missions" role="tablist" aria-label={tr('Тип місій', 'Mission type')}>
      {missions.map(item => <button type="button" role="tab" key={item.id} aria-selected={current === item.id} className={current === item.id ? 'active' : ''} onClick={() => setMission(item.id)}>{item.title}</button>)}
    </div>}
    {ranking.isPending ? <p className="bi-state" role="status">{tr('Розрахунок рейтингу…', 'Calculating the ranking…')}</p>
      : ranking.isError ? <p className="bi-error-banner" role="alert">{ranking.error.message}</p>
      : !rows.length ? <p className="bi-state">{tr('За обраний період немає екіпажів із достатньою кількістю вильотів.', 'No crews with enough flights in the selected period.')}</p>
      : <>
        <p className="crew-ranking__note">{overall
          ? tr('Кожен тип місій (ударні, логістика, мінування…) оцінюється окремо: екіпаж порівнюється лише з екіпажами своєї кафедри, що виконували такі самі місії. Загальний бал — середнє балів за типами місій, зважене за кількістю вильотів: хто виконував усі типи, оцінюється за всіма, хто лише логістику й мінування — тільки за ними.', 'Each mission type is scored separately among crews of the same department that flew such missions; the overall score is the mean of those scores weighted by flights.')
          : tr('Бал 0–100 враховує разом середню кількість вильотів за добу (у дні, коли екіпаж виконував такі місії), результативність і втрати бортів на виліт. Мале число біля значення — скільки відсотків екіпажів кафедри з такими самими місіями він випереджає.', 'The 0–100 score combines average flights per flying day, effectiveness and devices lost per flight; the small number shows the share of crews outperformed.')}
          {' '}{tr(`За однакового балу вище екіпаж із більшою кількістю вильотів. Тип місій враховується, якщо в ньому щонайменше ${ranking.data!.min_flights} вильотів.`, `Equal scores: more flights rank higher. A mission type counts with at least ${ranking.data!.min_flights} flights.`)}
          {!overall && ignored.length > 0 && ` ${tr('Втрати не враховуються для кафедр', 'Losses are not counted for')}: ${ignored.join(', ')}.`}</p>
        {(selected ? [selected] : categories).map(name => {
          const members = rows.filter(row => row.category === name)
          return <div className="crew-ranking__group" key={name}>
            <h3>{name}</h3>
            <div className="crew-ranking__table-wrap"><table className="crew-ranking__table">
              <thead><tr><th>{tr('Екіпаж', 'Crew')}</th>{full && <th>{tr('Батальйон', 'Battalion')}</th>}<th>{tr('Рота', 'Company')}</th><th>{tr('Бал', 'Score')}</th>
                {overall && <th>{tr('За типами місій', 'By mission type')}</th>}
                <th>{tr('Вильотів за добу', 'Flights per day')}</th><th>{tr('Результативність', 'Effectiveness')}</th><th>{tr('Втрачено бортів', 'Devices lost')}</th><th>{tr('Вильоти', 'Flights')}</th><th>{tr('У роті', 'In company')}</th><th>{tr('У батальйоні', 'In battalion')}</th><th>{tr('У бригаді', 'In brigade')}</th></tr></thead>
              <tbody>{members.map((row: RankingRow) => <tr key={`${row.battalion_id}:${row.crew}`}>
                <td data-label={tr('Екіпаж', 'Crew')}><b>{row.crew}</b></td>
                {full && <td data-label={tr('Батальйон', 'Battalion')}>{titles.battalion.get(row.battalion_id) ?? row.battalion_id}</td>}
                <td data-label={tr('Рота', 'Company')}>{titles.company.get(row.company_id) ?? row.company_id}</td>
                <td data-label={tr('Бал', 'Score')}><b className="crew-ranking__score">{number(row.score)}</b></td>
                {overall && <td data-label={tr('За типами місій', 'By mission type')}><span className="crew-ranking__mission-scores">{Object.entries(row.missions ?? {}).map(([key, value]) => <span key={key} title={tr(`${value.flights} вильотів`, `${value.flights} flights`)}>{missionTitle.get(key) ?? key} <b>{number(value.score)}</b></span>)}</span></td>}
                <td data-label={tr('Вильотів за добу', 'Flights per day')}>{overall ? number(row.avg_flights) : part(number(row.avg_flights), row.parts?.avg_flights)}</td>
                <td data-label={tr('Результативність', 'Effectiveness')}>{overall ? `${number(row.efficiency)}%` : part(`${number(row.efficiency)}%`, row.parts?.efficiency)}</td>
                <td data-label={tr('Втрачено бортів', 'Devices lost')}>{overall ? row.lost : part(String(row.lost), row.parts?.loss_rate)}</td>
                <td data-label={tr('Вильоти', 'Flights')} title={tr(`Літав ${row.active_days} діб`, `Flew on ${row.active_days} days`)}>{row.flights}</td>
                <td data-label={tr('У роті', 'In company')}>{place(row.company_place, row.company_total)}</td>
                <td data-label={tr('У батальйоні', 'In battalion')}>{place(row.battalion_place, row.battalion_total)}</td>
                <td data-label={tr('У бригаді', 'In brigade')}>{place(row.brigade_place, row.brigade_total)}</td>
              </tr>)}</tbody>
            </table></div>
          </div>
        })}
      </>}
  </section>
}
