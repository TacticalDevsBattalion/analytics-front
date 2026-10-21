import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import { biApi } from '../../lib/biApi'
import { dashboardGlobalFilters } from '../../lib/biBuilder'
import { RANKING_METRICS, rankingApi, type RankingRow } from '../../lib/rankingApi'
import type { FilterState } from '../../lib/types'
import { useLanguage } from '../../i18n/LanguageContext'
import { usePreferenceSync } from '../../config/PreferencesContext'
import './ranking.css'

/** Own crews with their places in the company, the battalion and the whole brigade. */
export function CrewRanking({ filters }: { filters: FilterState }) {
  const { tr, locale } = useLanguage()
  const metadata = useQuery({ queryKey: ['bi-metadata'], queryFn: ({ signal }) => biApi.metadata(signal) })
  const hierarchy = useQuery({ queryKey: ['bi-hierarchy'], queryFn: ({ signal }) => biApi.hierarchy(signal) })
  const available = useMemo(() => RANKING_METRICS.map(key => metadata.data?.metrics.find(metric => metric.key === key)).filter(metric => !!metric), [metadata.data])
  const [metric, setMetric] = useState('efficiency')
  const [category, setCategory] = useState('')
  usePreferenceSync<{ metric?: string; category?: string }>('ranking', { metric, category }, saved => { if (saved.metric) setMetric(saved.metric); if (typeof saved.category === 'string') setCategory(saved.category) })
  const queryFilters = dashboardGlobalFilters(filters, metadata.data?.filter_fields ?? [])
  const ranking = useQuery({
    queryKey: ['crew-ranking', metric, filters.date_from, filters.date_to, filters.time_from, filters.time_to, queryFilters],
    queryFn: ({ signal }) => rankingApi.get({ date_range: { from: filters.date_from, to: filters.date_to }, ...(filters.time_from ? { time_from: filters.time_from } : {}), ...(filters.time_to ? { time_to: filters.time_to } : {}), filters: queryFilters, metric }, signal),
    enabled: !!metadata.data,
  })
  const titles = useMemo(() => ({
    battalion: new Map((hierarchy.data?.departments ?? []).map(item => [String(item.id), item.title])),
    company: new Map((hierarchy.data?.groups ?? []).map(item => [String(item.id), item.title])),
  }), [hierarchy.data])
  const rows = ranking.data?.rows ?? []
  const categories = [...new Set(rows.map(row => row.category))].sort((a, b) => a.localeCompare(b, 'uk'))
  const selected = category && categories.includes(category) ? category : ''
  const percent = ranking.data?.format.type === 'percent'
  const format = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: percent ? 1 : 2 }) + (percent ? '%' : '')
  const full = ranking.data?.full_list ?? false
  const place = (value: number, total: number) => <span className="crew-ranking__place"><b>{value}</b> {tr('з', 'of')} {total}<i style={{ ['--share' as string]: `${Math.max(4, 100 - ((value - 1) / Math.max(1, total)) * 100)}%` }} aria-hidden="true" /></span>

  return <section className="crew-ranking panel">
    <header className="crew-ranking__head">
      <div><h2><Trophy size={18} aria-hidden="true" /> {tr('Рейтинг екіпажів', 'Crew ranking')}</h2>
        <p>{full ? tr('Усі екіпажі бригади за кожною кафедрою.', 'All crews of the brigade, per department.') : tr('Ваші екіпажі та їхні місця серед усіх екіпажів бригади за кожною кафедрою. Назви й показники інших екіпажів не показуються.', 'Your crews and their places among all crews of the brigade, per department. Other crews are not shown.')}</p></div>
      <div className="crew-ranking__controls">
        <label>{tr('Показник', 'Metric')}<select value={metric} onChange={event => setMetric(event.target.value)}>{available.map(item => <option key={item!.key} value={item!.key}>{item!.title ?? item!.key}</option>)}</select></label>
        <label>{tr('Кафедра', 'Department')}<select value={selected} onChange={event => setCategory(event.target.value)}><option value="">{tr('Усі кафедри', 'All departments')}</option>{categories.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>
    </header>
    {ranking.isPending ? <p className="bi-state" role="status">{tr('Розрахунок рейтингу…', 'Calculating the ranking…')}</p>
      : ranking.isError ? <p className="bi-error-banner" role="alert">{ranking.error.message}</p>
      : !rows.length ? <p className="bi-state">{tr('За обраний період немає екіпажів із достатньою кількістю вильотів.', 'No crews with enough flights in the selected period.')}</p>
      : <>
        {ranking.data!.min_flights > 1 && <p className="crew-ranking__note">{tr(`Враховано екіпажі, що мають щонайменше ${ranking.data!.min_flights} вильотів.`, `Crews with at least ${ranking.data!.min_flights} flights.`)} {ranking.data!.higher_is_better ? '' : tr('Менше значення — краще.', 'Lower is better.')}</p>}
        {(selected ? [selected] : categories).map(name => {
          const members = rows.filter(row => row.category === name)
          return <div className="crew-ranking__group" key={name}>
            <h3>{name}</h3>
            <div className="crew-ranking__table-wrap"><table className="crew-ranking__table">
              <thead><tr><th>{tr('Екіпаж', 'Crew')}</th>{full && <th>{tr('Батальйон', 'Battalion')}</th>}<th>{tr('Рота', 'Company')}</th><th>{ranking.data!.title}</th><th>{tr('Вильоти', 'Flights')}</th><th>{tr('У роті', 'In company')}</th><th>{tr('У батальйоні', 'In battalion')}</th><th>{tr('У бригаді', 'In brigade')}</th></tr></thead>
              <tbody>{members.map((row: RankingRow) => <tr key={`${row.battalion_id}:${row.crew}`}>
                <td data-label={tr('Екіпаж', 'Crew')}><b>{row.crew}</b></td>
                {full && <td data-label={tr('Батальйон', 'Battalion')}>{titles.battalion.get(row.battalion_id) ?? row.battalion_id}</td>}
                <td data-label={tr('Рота', 'Company')}>{titles.company.get(row.company_id) ?? row.company_id}</td>
                <td data-label={ranking.data!.title}>{format(row.value)}</td>
                <td data-label={tr('Вильоти', 'Flights')}>{row.flights ?? '—'}</td>
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
