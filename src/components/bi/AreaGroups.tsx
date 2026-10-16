import { useLanguage } from '../../i18n/LanguageContext'
import { missionKey, type AreaMetric, type MissionDepartment, type MissionGroup, type AreaMission } from '../../lib/areaComparison'
import { areaComparisonDocument } from '../../lib/areaExport'
import type { MetricFormat } from '../../lib/biTypes'
import { AreaComparison } from './AreaComparison'
import { ExportControl } from './ExportControl'

type Props = {
  departments: MissionDepartment[]
  missions: Map<string, AreaMission[]>
  metrics: Array<AreaMetric & { format?: MetricFormat }>
  label: (id: string) => string
  // Departments themselves are the compared areas: one block for all of them.
  departmentLevel: boolean
  departmentLabel: (id: string) => string
  tags?: (id: string) => string[]
  highlighted?: (id: string) => boolean
  exportMeta: Array<[string, string]>
  exportTitle: string
}
const OPEN_DEPARTMENTS = 2

// One rating per area: inside its department, single-mission areas are compared
// with areas doing only the same mission; multi-mission areas form the overall rating.
export function AreaGroups({ departments, missions, metrics, label, departmentLevel, departmentLabel, tags, highlighted, exportMeta, exportTitle }: Props) {
  const { tr, locale } = useLanguage()
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  const groupTitle = (group: MissionGroup) => group.purpose === null ? tr('Багатозадачні — загальний рейтинг', 'Multi-mission — overall rating') : group.purpose ? `${tr('Лише', 'Only')}: ${group.purpose}` : tr('Мету не вказано', 'No purpose')
  const missionsOf = (category: string) => (id: string) => missions.get(missionKey(category, id)) ?? []
  const judged = metrics.some(metric => metric.rate && metric.direction !== 'NEUTRAL')
  const exportDocument = () => areaComparisonDocument({
    title: exportTitle, tr, metrics, label, tags, highlighted, meta: exportMeta, byPurposeOnly: departmentLevel,
    groups: departments.flatMap(department => department.groups.map(group => ({ department: departmentLabel(department.category), purpose: groupTitle(group), areas: group.areas, rated: group.rated >= 2, missions: missionsOf(department.category) }))),
  })
  const groupBlock = (department: MissionDepartment, group: MissionGroup) => <section key={group.key} className="bi-area-mission-group">
    <h4>{groupTitle(group)}<span>{tr('областей', 'areas')}: {group.areas.length} · {tr('вильотів', 'flights')}: {number.format(group.flights)}</span></h4>
    {group.rated >= 2
      ? <AreaComparison areas={group.areas} metrics={metrics} label={label} tags={tags} highlighted={highlighted} missions={missionsOf(department.category)} />
      : <p className="bi-notice">{tr('Без рейтингу: немає з ким порівняти', 'Not rated: nothing comparable')} — {group.areas.map(area => label(area.id)).join(', ')}</p>}
  </section>
  return <div className="bi-area-groups">
    <p className="bi-notice">{departmentLevel
      ? tr('Кафедри з однією місією порівнюються лише з кафедрами, що виконували ту саму місію; кафедри з кількома місіями — у загальному рейтингу.', 'Departments with one mission are compared only with departments doing the same mission; multi-mission departments form the overall rating.')
      : tr('Рейтинги не змішують кафедри. Усередині кафедри область з однією місією (напр., лише розвідка чи лише доставка) порівнюється тільки з такими самими; області з кількома місіями — у загальному рейтингу кафедри. Місії кожної області підсвічені: частка вильотів і результат за кожною.', 'Ratings never mix departments. Inside a department, a single-mission area is compared only with the same; multi-mission areas form the overall rating. Each area’s missions are highlighted with their share of flights and result.')}
      {' '}{tr('Споріднені мети — одна місія: Ураження (динамічне, планове, вільне полювання, засідка), Розвідка (дорозвідка, зйомка ураження, коригування, супровід), Доставка та евакуація.', 'Related purposes are one mission: Strike (dynamic, planned, free hunting, ambush), Reconnaissance (additional reconnaissance, strike filming, adjustment, escort), Delivery and evacuation.')}{' '}{tr('У загальному рейтингу кожна місія області порівнюється лише з такою самою місією інших областей кафедри, а результати зважуються за складністю: ураження ×1, мінування ×0,8, розвідка ×0,6, доставка та евакуація ×0,4. Чверть балу дає складність набору місій — більше уражень, вищий рейтинг.', 'In the overall rating each mission is compared only with the same mission of other areas and weighted by difficulty: strike ×1, mining ×0.8, reconnaissance ×0.6, delivery and evacuation ×0.4. A quarter of the score is the difficulty of the mission mix: more strikes, higher rating.')}{' '}{tr('Місія враховується, якщо на неї припадає щонайменше 10% вильотів області; епізодичні вильоти показані блідо й на рейтинг не впливають.', 'A mission counts when it has at least 10% of the area’s flights; occasional flights are shown faded and do not affect the rating.')}</p>
    {!judged && <p className="bi-notice">{tr('У вибраному наборі немає відносних показників, тому рейтинг не будується. Додайте відсоткові або відносні показники в набір.', 'The selected set has no relative metrics, so no rating is built. Add percentage or ratio metrics to the set.')}</p>}
    <div className="bi-export-row"><span>{tr('Завантажити всі рейтинги та статистику за місіями', 'Download all ratings and per-mission statistics')}</span><ExportControl document={exportDocument} fileName="analytics-areas" disabled={!departments.length} /></div>
    {!departments.length && <p className="bi-state">{tr('Немає даних за цей період.', 'No data for this period.')}</p>}
    {departmentLevel
      ? departments.flatMap(department => department.groups.map(group => groupBlock(department, group)))
      : departments.map((department, index) => <details key={department.category} className="bi-area-group" open={index < OPEN_DEPARTMENTS}>
        <summary><b>{departmentLabel(department.category)}</b><span>{tr('вильотів', 'flights')}: {number.format(department.flights)} · {department.groups.map(group => `${groupTitle(group)} (${group.areas.length})`).join(' · ')}</span></summary>
        {department.groups.map(group => groupBlock(department, group))}
      </details>)}
  </div>
}
