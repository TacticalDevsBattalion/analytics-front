import { useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useLanguage } from '../../i18n/LanguageContext'
import { scoreStars, type AreaInsight, type AreaMetric, type AreaMission, type AreaSummary } from '../../lib/areaComparison'
import type { MetricFormat } from '../../lib/biTypes'
import { formatWidgetValue } from './WidgetRenderer'

type Props = {
  // Already analysed areas of one department and purpose.
  areas: AreaSummary[]
  metrics: Array<AreaMetric & { format?: MetricFormat }>
  label: (id: string) => string
  // Context shown next to an area name, e.g. a crew's BBAK and department.
  tags?: (id: string) => string[]
  // Areas to emphasise without filtering the others out.
  highlighted?: (id: string) => boolean
  // The area's flight purposes in this department, highlighted next to its name.
  missions?: (id: string) => AreaMission[]
}
const CARD_LIMIT = 12

// Every area of one group against the others: overall rank, strengths and
// weaknesses relative to the median, and the full matrix with best/worst marked.
export function AreaComparison({ areas, metrics, label, tags, highlighted, missions }: Props) {
  const { tr, locale } = useLanguage()
  const [showAll, setShowAll] = useState(false)
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const deviation = (item: AreaInsight) => `${item.deviation > 0 ? '+' : ''}${number.format(item.deviation)}${item.metric.percent ? ` ${tr('в.п.', 'pp')}` : '%'}`
  const shown = (item: AreaInsight) => formatWidgetValue(item.value, metrics.find(metric => metric.key === item.metric.key)?.format, locale)
  const middle = (item: AreaInsight) => formatWidgetValue(item.median, metrics.find(metric => metric.key === item.metric.key)?.format, locale)
  const insight = (item: AreaInsight) => <li key={item.metric.key} title={`${tr('Місце', 'Rank')} ${item.rank}/${item.of}`}><span>{item.metric.title}<small>{shown(item)} · {tr('медіана', 'median')} {middle(item)}</small></span><b>{deviation(item)}</b></li>
  const judged = metrics.some(metric => metric.rate && metric.direction !== 'NEUTRAL')
  const lowVolume = areas.filter(area => area.lowVolume).length
  const ranked = areas.map((area, index) => ({ area, rank: index + 1 }))
  const cards = highlighted ? ranked.filter(item => highlighted(item.area.id)) : ranked
  const visibleCards = showAll ? cards : cards.slice(0, CARD_LIMIT)
  const name = (id: string) => <>{label(id)}{tags?.(id).map(tag => <span className="bi-area-tag" key={tag}>{tag}</span>)}</>
  // Per-mission result: the first percentage metric, e.g. effectiveness.
  const missionMetric = metrics.find(metric => metric.percent && metric.rate)
  const share = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 })
  const missionChips = (id: string, detailed: boolean) => {
    const list = missions?.(id) ?? []
    if (!list.length) return null
    return <span className="bi-area-missions">{list.filter(mission => detailed || mission.main).map(mission => {
      const result = missionMetric ? mission.values[missionMetric.key] : null
      const resultText = missionMetric && typeof result === 'number' ? formatWidgetValue(result, missionMetric.format, locale) : null
      return <span key={mission.purpose} className={`bi-area-mission${mission.main ? ' is-main' : ''}`} title={`${mission.purpose}${mission.parts.length > 1 || mission.parts[0] !== mission.purpose ? ` (${mission.parts.join(', ')})` : ''}: ${number.format(mission.flights)} ${tr('вильотів', 'flights')} (${share.format(mission.share)})${resultText ? ` · ${missionMetric!.title}: ${resultText}` : ''}${mission.main ? '' : ` · ${tr('епізодично, на профіль не впливає', 'occasional, does not change the profile')}`}`}>{mission.purpose} {share.format(mission.share)}{detailed && resultText ? <b> · {resultText}</b> : null}</span>
    })}</span>
  }
  if (areas.length < 2) return <p className="bi-state">{tr('Для порівняння потрібно щонайменше дві області з даними.', 'At least two areas with data are needed.')}</p>
  return <div className="bi-areas">
    {lowVolume > 0 && <p className="bi-notice">{tr('Областей із малою кількістю вильотів, які не оцінюються', 'Areas with too few flights, not rated')}: {lowVolume}.</p>}
    {judged && <div className="bi-area-cards">{visibleCards.map(({ area, rank }) => <article key={area.id} className="bi-area-card">
      <header><span className="bi-area-rank">{area.lowVolume ? '–' : rank}</span><h3>{name(area.id)}{missionChips(area.id, true)}</h3>{area.lowVolume && <span className="bi-area-low" title={tr('Замало вильотів для надійної оцінки', 'Too few flights for a reliable rating')}>{tr('мало даних', 'little data')}{area.values.flights != null ? ` · ${number.format(area.values.flights)}` : ''}</span>}{area.score != null && <span className="bi-area-stars" role="img" aria-label={`${scoreStars(area.score)} ${tr('з 5 зірок', 'of 5 stars')}`} title={`${tr('Бал', 'Score')}: ${number.format(area.score)}/100${area.difficulty != null ? ` = ${tr('якість місій', 'mission quality')} ${number.format(area.quality ?? 0)} × 75% + ${tr('складність місій', 'mission difficulty')} ${number.format(area.difficulty)} × 25%` : ` — ${tr('середній процентиль за показниками з напрямом «краще більше/менше»', 'average percentile across directional metrics')}`}`}>{'★'.repeat(scoreStars(area.score))}<span>{'★'.repeat(5 - scoreStars(area.score))}</span></span>}</header>
      {area.score != null && <div className="bi-area-meter" aria-hidden="true"><span style={{ width: `${area.score}%` }} /></div>}
      {!area.lowVolume && <div className="bi-area-insights">
        <section><h4><ArrowUp size={14} /> {tr('Сильні сторони', 'Strengths')}</h4>{area.strengths.length ? <ul>{area.strengths.map(insight)}</ul> : <p>{tr('Немає показників вище медіани', 'No metrics above the median')}</p>}</section>
        <section><h4><ArrowDown size={14} /> {tr('Слабкі сторони', 'Weaknesses')}</h4>{area.weaknesses.length ? <ul>{area.weaknesses.map(insight)}</ul> : <p>{tr('Немає показників нижче медіани', 'No metrics below the median')}</p>}</section>
      </div>}
    </article>)}</div>}
    {judged && cards.length > CARD_LIMIT && <button type="button" className="secondary bi-area-more" onClick={() => setShowAll(current => !current)}>{showAll ? tr('Згорнути', 'Show fewer') : `${tr('Показати всі', 'Show all')} (${cards.length})`}</button>}
    <div className="bi-table-scroll"><table className="bi-table bi-area-matrix"><thead><tr><th>{tr('Область', 'Area')}</th>{metrics.map(metric => <th key={metric.key} title={!metric.rate ? tr('Кількість: залежить від розміру підрозділу, без оцінки', 'Count: depends on unit size, not judged') : metric.direction === 'LOWER_IS_BETTER' ? tr('Краще менше', 'Lower is better') : metric.direction === 'NEUTRAL' ? tr('Без оцінки', 'Not judged') : tr('Краще більше', 'Higher is better')}>{metric.title}{metric.rate && metric.direction === 'LOWER_IS_BETTER' && <small> ↓</small>}{!metric.rate && <small> · {tr('к-сть', 'count')}</small>}</th>)}</tr></thead><tbody>{areas.map(area => <tr key={area.id} className={[area.lowVolume ? 'is-low-volume' : '', highlighted?.(area.id) ? 'is-highlighted' : ''].filter(Boolean).join(' ') || undefined}><th scope="row">{name(area.id)}{missionChips(area.id, false)}</th>{metrics.map(metric => {
      const best = area.best.includes(metric.key), worst = area.worst.includes(metric.key)
      return <td key={metric.key} className={best ? 'is-best' : worst ? 'is-worst' : undefined}>{area.values[metric.key] == null ? '—' : formatWidgetValue(area.values[metric.key], metric.format, locale)}{best && <small> ▲ {tr('найкраще', 'best')}</small>}{worst && <small> ▼ {tr('найгірше', 'worst')}</small>}</td>
    })}</tr>)}</tbody></table></div>
  </div>
}
