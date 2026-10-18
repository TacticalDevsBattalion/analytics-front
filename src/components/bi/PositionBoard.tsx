import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, Moon, Search, Sun } from 'lucide-react'
import { InfoHint } from '../help/InfoHint'
import type { QueryResult } from '../../lib/biTypes'
import { SORTS, efficiencyOf, groupPositions, sortValue, type Counts, type Position, type SortKey } from '../../lib/positionBoard'

function DayNightBar({ counts, scale }: { counts: Counts; scale: number }) {
  const width = scale > 0 ? Math.max(counts.flights / scale * 100, counts.flights ? 2 : 0) : 0
  const day = counts.flights ? counts.day / counts.flights * 100 : 0
  return <div className="pb-bar" aria-hidden="true"><div className="pb-bar__fill" style={{ width: `${width}%` }}><span className="pb-bar__day" style={{ width: `${day}%` }} /><span className="pb-bar__night" style={{ width: `${100 - day}%` }} /></div></div>
}

export function PositionBoard({ result, locale }: { result: QueryResult; locale: string }) {
  const format = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale])
  const percent = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale])
  const departments = useMemo(() => groupPositions(result.rows), [result.rows])
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('flights')
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const hasEfficiency = departments.some(department => department.effective !== null)
  const needle = search.trim().toLocaleLowerCase('uk')
  const matches = (position: Position) => !needle || [position.position, position.bbak, ...position.crews.map(crew => crew.team)].some(value => value.toLocaleLowerCase('uk').includes(needle))
  const shown = departments
    .filter(department => !selected || department.category === selected)
    .map(department => ({ ...department, positions: department.positions.filter(matches).sort((left, right) => sortValue(right, sort) - sortValue(left, sort) || right.flights - left.flights) }))
    .filter(department => department.positions.length)
  const scale = Math.max(0, ...shown.flatMap(department => department.positions.map(position => position.flights)))
  const toggle = (key: string) => setOpen(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  const share = (part: number, total: number) => total ? `${percent.format(part / total * 100)}%` : '—'
  const efficiency = (counts: Counts) => { const value = efficiencyOf(counts); return value === null ? '—' : `${percent.format(value)}%` }

  if (!departments.length) return <p className="bi-state" role="status">Немає даних за вибраний період</p>
  return <div className="pb">
    <div className="pb-departments" role="group" aria-label="Кафедри">
      {departments.map(department => <button type="button" key={department.category} className={`pb-department${selected === department.category ? ' active' : ''}`} aria-pressed={selected === department.category} onClick={() => setSelected(current => current === department.category ? null : department.category)}>
        <span className="pb-department__name">{department.category}</span>
        <strong>{format.format(department.flights)}</strong>
        <DayNightBar counts={department} scale={department.flights} />
        <span className="pb-department__split"><span className="pb-day"><Sun size={12} />{share(department.day, department.flights)}</span><span className="pb-night"><Moon size={12} />{share(department.night, department.flights)}</span></span>
        {hasEfficiency && <span className="pb-department__efficiency">Результативність <b>{efficiency(department)}</b></span>}
        <small>{department.positions.length} поз.</small>
      </button>)}
    </div>
    <div className="pb-toolbar">
      <label className="pb-search"><Search size={14} /><input type="search" value={search} placeholder="Позиція, ББАК або екіпаж" aria-label="Пошук позиції" onChange={event => setSearch(event.target.value)} /></label>
      <label className="pb-sort"><span>Сортувати</span><select value={sort} onChange={event => setSort(event.target.value as SortKey)}>{SORTS.map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
      <span className="pb-legend"><span className="pb-day"><i />Вдень</span><span className="pb-night"><i />Вночі</span></span>
      {selected && <button type="button" className="secondary pb-reset" onClick={() => setSelected(null)}>Усі кафедри</button>}
    </div>
    {!shown.length && <p className="bi-state" role="status">Нічого не знайдено</p>}
    <div className="pb-table-scroll" tabIndex={0}>
      <table className="pb-table">
        <thead><tr><th>Позиція</th><th className="pb-bar-col">Вдень / вночі<InfoHint title="Смуга">Довжина — кількість вильотів відносно найбільшої позиції в списку. Жовта частина — вильоти вдень (типово 07:00–19:00 за київським часом), блакитна — вночі.</InfoHint></th><th className="bi-num">Вдень</th><th className="bi-num">Вночі</th><th className="bi-num">Усього</th><th className="bi-num">Ніч, %<InfoHint title="Частка ночі">Вильоти вночі ÷ усі вильоти позиції × 100%. Вильоти без зазначеного часу рахуються як нічні.</InfoHint></th></tr></thead>
        {shown.map(department => <tbody key={department.category}>
          <tr className="pb-group"><th colSpan={6}>{department.category}<small>{department.positions.length} поз. · {format.format(department.positions.reduce((sum, position) => sum + position.flights, 0))} вильотів</small></th></tr>
          {department.positions.map(position => {
            const key = `${department.category}\u0000${position.key}`
            const expanded = open.has(key)
            return <Fragment key={key}>
              <tr className={`pb-row${expanded ? ' expanded' : ''}`} tabIndex={0} aria-expanded={expanded} onClick={() => toggle(key)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(key) } }}>
                <td><span className="pb-name"><ChevronDown size={14} className="pb-chevron" /><span><strong>{position.position}</strong>{position.bbak && <small>{position.bbak}</small>}</span></span></td>
                <td className="pb-bar-col"><DayNightBar counts={position} scale={scale} /></td>
                <td className="bi-num pb-day">{format.format(position.day)}</td>
                <td className="bi-num pb-night">{format.format(position.night)}</td>
                <td className="bi-num"><strong>{format.format(position.flights)}</strong></td>
                <td className="bi-num">{share(position.night, position.flights)}</td>
              </tr>
              {expanded && [...position.crews].sort((left, right) => sortValue(right, sort) - sortValue(left, sort) || right.flights - left.flights).map(crew => <tr className="pb-crew" key={crew.team}>
                <td><span className="pb-crew__name">Екіпаж {crew.team}</span></td>
                <td className="pb-bar-col"><DayNightBar counts={crew} scale={scale} /></td>
                <td className="bi-num pb-day">{format.format(crew.day)}</td>
                <td className="bi-num pb-night">{format.format(crew.night)}</td>
                <td className="bi-num">{format.format(crew.flights)}</td>
                <td className="bi-num">{share(crew.night, crew.flights)}</td>
              </tr>)}
            </Fragment>
          })}
        </tbody>)}
      </table>
    </div>
  </div>
}
