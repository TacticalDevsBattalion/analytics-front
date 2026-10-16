import { scoreStars, type AreaInsight, type AreaMetric, type AreaMission, type AreaSummary } from './areaComparison'
import type { ExportColumn, ExportDocument } from './tableExport'

type Tr = (uk: string, en: string) => string
type Metric = AreaMetric & { format?: { type?: string; decimals?: number } }
export type AreaExportInput = {
  title: string
  createdAt?: string
  meta: Array<[string, string]>
  // Separate ratings (e.g. "only reconnaissance", "multi-mission") per department;
  // ranks are within a group only. `purpose` is the group's title.
  groups: Array<{ department: string; purpose: string; areas: AreaSummary[]; rated: boolean; missions?: (id: string) => AreaMission[] }>
  byPurposeOnly?: boolean
  metrics: Metric[]
  label: (id: string) => string
  tags?: (id: string) => string[]
  highlighted?: (id: string) => boolean
  tr: Tr
}

const metricColumn = (metric: Metric): ExportColumn => ({ key: metric.key, title: metric.title, kind: metric.percent ? 'percent' : 'number', decimals: metric.format?.decimals })
const round = (value: number) => Math.round(value * 10) / 10
const direction = (metric: Metric, tr: Tr) => !metric.rate ? tr('Кількісний, без оцінки', 'Count, not judged') : metric.direction === 'LOWER_IS_BETTER' ? tr('Краще менше', 'Lower is better') : metric.direction === 'NEUTRAL' ? tr('Без оцінки', 'Not judged') : tr('Краще більше', 'Higher is better')

// The same content as the "All areas" view: rating, strengths/weaknesses,
// full metric matrix and the metric legend.
export function areaComparisonDocument({ title, createdAt = new Date().toISOString(), meta, groups, byPurposeOnly = false, metrics, label, tags, highlighted, tr }: AreaExportInput): ExportDocument {
  const insight = (item: AreaInsight) => `${item.metric.title}: ${item.deviation > 0 ? '+' : ''}${round(item.deviation)}${item.metric.percent ? ` ${tr('в.п.', 'pp')}` : '%'} ${tr('від медіани', 'vs median')}`
  const titles = (keys: string[]) => keys.map(key => metrics.find(metric => metric.key === key)?.title ?? key).join(', ')
  // Flat list of every area in every group, with its rank inside that group.
  const entries = groups.flatMap(group => {
    let rank = 0
    const participants = group.areas.filter(area => area.score != null).length
    return group.areas.map(area => ({ group, area, participants, rank: group.rated && !area.lowVolume && area.score != null ? ++rank : null }))
  })
  type Entry = typeof entries[number]
  const withMissions = groups.some(group => group.missions)
  const base: ExportColumn[] = [
    ...(byPurposeOnly ? [] : [{ key: 'department', title: tr('Кафедра', 'Department') }]), { key: 'group', title: tr('Рейтинг', 'Rating') },
    { key: 'rank', title: tr('Місце в групі', 'Rank in group'), kind: 'number', decimals: 0 }, { key: 'rated', title: tr('Оцінено в групі', 'Rated in group'), kind: 'number', decimals: 0 },
    { key: 'area', title: tr('Область', 'Area') }, ...(tags ? [{ key: 'context', title: tr('ББАК', 'BBAK') }] : []),
    ...(withMissions ? [{ key: 'missions', title: tr('Місії (частка вильотів)', 'Missions (share of flights)') }] : []),
  ]
  const percent = (value: number) => `${Math.round(value * 100)}%`
  const head = ({ group, area, participants, rank }: Entry) => [...(byPurposeOnly ? [] : [group.department]), group.purpose, rank, participants, label(area.id), ...(tags ? [tags(area.id).join(', ')] : []), ...(withMissions ? [(group.missions?.(area.id) ?? []).filter(mission => mission.main).map(mission => `${mission.purpose} ${percent(mission.share)}`).join(', ')] : [])]
  const highlight = highlighted ? entries.map(entry => highlighted(entry.area.id)) : undefined
  return {
    title, createdAt, meta,
    notes: [
      tr('Рейтинги не змішують кафедри. Область з однією місією порівнюється лише з такими самими («Лише: …»), області з кількома місіями — у загальному рейтингу кафедри. Місця з різних рейтингів між собою не порівнюються.', 'Ratings never mix departments. A single-mission area is compared only with the same ("Only: …"); multi-mission areas form the overall rating. Ranks from different ratings are not comparable.'),
      tr('Споріднені мети — одна місія: Ураження (динамічне, планове, вільне полювання, засідка), Розвідка (дорозвідка, зйомка ураження, коригування, супровід), Доставка та евакуація.', 'Related purposes are one mission: Strike (dynamic, planned, free hunting, ambush), Reconnaissance (additional reconnaissance, strike filming, adjustment, escort), Delivery and evacuation.'),
      tr('Місія враховується, якщо на неї припадає щонайменше 10% вильотів області. Аркуш «За місіями» містить показники кожної області окремо за кожною місією.', 'A mission counts at 10% or more of the area’s flights. The "By mission" sheet has every area’s metrics per mission.'),
      tr('Сильні й слабкі сторони визначаються лише за відносними показниками порівняно з медіаною своєї групи; для відсотків різниця у в.п.', 'Strengths and weaknesses use only relative metrics against the group median; percentages differ in pp.'),
      tr('У загальному рейтингу бал = якість місій × 75% + складність місій × 25%. Якість — бал кожної місії проти такої самої місії інших областей кафедри, зважений за вильотами та складністю (ураження 1, мінування 0,8, розвідка 0,6, доставка та евакуація 0,4, інші 0,5). Складність — 100, якщо всі вильоти — ураження.', 'In the overall rating score = mission quality × 75% + mission difficulty × 25%. Quality is each mission scored against the same mission of other areas, weighted by flights and difficulty (strike 1, mining 0.8, reconnaissance 0.6, delivery and evacuation 0.4, other 0.5). Difficulty is 100 when all flights are strikes.'),
      tr('Бал — середній процентиль за відносними показниками (100 — найкраще). Зірки: 0–19 балів — 1, 20–39 — 2, 40–59 — 3, 60–79 — 4, 80–100 — 5.', 'Score is the average percentile over relative metrics (100 is best). Stars: 0–19 points — 1, 20–39 — 2, 40–59 — 3, 60–79 — 4, 80–100 — 5.'),
      tr('Області з малою кількістю вильотів і групи, де менше двох оцінених областей, показано без місця.', 'Areas with too few flights and groups with fewer than two rated areas have no rank.'),
      ...(highlighted ? [tr('Підсвічені рядки — вибраний ББАК.', 'Highlighted rows are the selected BBAK.')] : []),
    ],
    tables: [
      {
        name: tr('Рейтинг', 'Rating'), highlight,
        columns: [...base, { key: 'stars', title: tr('Рейтинг (зірки)', 'Rating (stars)') }, { key: 'score', title: tr('Бал з 100', 'Score of 100'), kind: 'number', decimals: 1 }, { key: 'quality', title: tr('Якість місій', 'Mission quality'), kind: 'number', decimals: 1 }, { key: 'difficulty', title: tr('Складність місій', 'Mission difficulty'), kind: 'number', decimals: 1 }, { key: 'low_volume', title: tr('Мало даних', 'Little data') }, { key: 'strengths', title: tr('Сильні сторони', 'Strengths') }, { key: 'weaknesses', title: tr('Слабкі сторони', 'Weaknesses') }, { key: 'best', title: tr('Найкраще серед усіх', 'Best of all') }, { key: 'worst', title: tr('Найгірше серед усіх', 'Worst of all') }],
        rows: entries.map(entry => { const { area } = entry; return [...head(entry), entry.rank == null || area.score == null ? null : '★'.repeat(scoreStars(area.score)) + '☆'.repeat(5 - scoreStars(area.score)), entry.rank == null || area.score == null ? null : round(area.score), area.quality == null ? null : round(area.quality), area.difficulty == null ? null : round(area.difficulty), area.lowVolume, area.strengths.map(insight).join('\n'), area.weaknesses.map(insight).join('\n'), titles(area.best), titles(area.worst)] }),
      },
      {
        name: tr('Матриця', 'Matrix'), highlight,
        columns: [...base, ...metrics.map(metricColumn)],
        rows: entries.map(entry => [...head(entry), ...metrics.map(metric => entry.area.values[metric.key] ?? null)]),
      },
      ...(withMissions ? [{
        name: tr('За місіями', 'By mission'),
        columns: [...(byPurposeOnly ? [] : [{ key: 'department', title: tr('Кафедра', 'Department') }]), { key: 'area', title: tr('Область', 'Area') }, { key: 'purpose', title: tr('Місія', 'Mission') }, { key: 'parts', title: tr('Мети вильотів у місії', 'Flight purposes in the mission') }, { key: 'share', title: tr('Частка вильотів', 'Share of flights'), kind: 'percent' as const, decimals: 0 }, { key: 'main', title: tr('Входить у профіль', 'Part of profile') }, ...metrics.map(metricColumn)],
        rows: entries.flatMap(({ group, area }) => (group.missions?.(area.id) ?? []).map(mission => [...(byPurposeOnly ? [] : [group.department]), label(area.id), mission.purpose, (mission.parts ?? [mission.purpose]).join(', '), mission.share * 100, mission.main, ...metrics.map(metric => { const value = mission.values[metric.key]; return typeof value === 'number' && Number.isFinite(value) ? value : null })])),
      }] : []),
      {
        name: tr('Показники', 'Metrics'),
        columns: [{ key: 'key', title: tr('Код', 'Key') }, { key: 'title', title: tr('Показник', 'Metric') }, { key: 'type', title: tr('Тип', 'Type') }, { key: 'direction', title: tr('Оцінка', 'Judgement') }],
        rows: metrics.map(metric => [metric.key, metric.title, metric.rate ? tr('Відносний', 'Relative') : tr('Кількісний', 'Count'), direction(metric, tr)]),
      },
    ],
  }
}
