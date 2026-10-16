export type AreaDirection = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'NEUTRAL'
// `rate` metrics (percentages, ratios, averages, normalized formulas) are
// comparable between areas of different size. Counts mostly reflect size, so
// they are shown but never judged as strengths or weaknesses.
export type AreaMetric = { key: string; title: string; percent: boolean; rate: boolean; direction: AreaDirection }
export type AreaRow = { id: string; values: Record<string, number | null | undefined> }
export type AreaInsight = {
  metric: AreaMetric
  value: number
  median: number
  // Distance from the median in the "better" direction: percentage points for
  // percent metrics, relative percent for other rates. Positive is better.
  deviation: number
  rank: number
  of: number
}
export type AreaSummary = {
  id: string
  values: Record<string, number | null>
  // Mean percentile (0 worst … 100 best) over judged metrics with data.
  score: number | null
  strengths: AreaInsight[]
  weaknesses: AreaInsight[]
  best: string[]
  worst: string[]
  // Too little activity to judge rates; shown but not rated.
  lowVolume: boolean
  // Multi-mission ratings only: each mission judged against the same mission
  // elsewhere (0–100) and how demanding the area's mission mix is (0–100).
  quality?: number | null
  difficulty?: number | null
}
export type AreaOptions = { limit?: number; volumeKey?: string; minimumVolume?: number }

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function normalizeDirection(value: unknown): AreaDirection {
  return value === 'LOWER_IS_BETTER' || value === 'NEUTRAL' ? value : 'HIGHER_IS_BETTER'
}

const RATE_AGGREGATIONS = new Set(['RATIO', 'AVG'])
const RATE_NORMALIZATIONS = new Set(['PER_OPERATION', 'PER_100_OPERATIONS', 'PERCENT_OF_TOTAL', 'RATIO', 'MIN_MAX'])
export function isRateMetric(definition: { aggregation?: unknown; normalization?: unknown; format?: { type?: string } }) {
  return definition.format?.type === 'percent' || definition.format?.type === 'percentage' || RATE_AGGREGATIONS.has(String(definition.aggregation)) || RATE_NORMALIZATIONS.has(String(definition.normalization))
}

// Ranks every area against all others on each judged metric; equal values share
// a rank. Areas below the activity threshold keep their values but are not rated.
export function analyzeAreas(rows: AreaRow[], metrics: AreaMetric[], { limit = 3, volumeKey = 'flights', minimumVolume = 10 }: AreaOptions = {}): AreaSummary[] {
  const volumes = rows.map(row => row.values[volumeKey]).filter(finite)
  // At least `minimumVolume`, and at least a tenth of the typical area's activity.
  const threshold = volumes.length ? Math.max(minimumVolume, 0.1 * median(volumes)) : 0
  const summaries = rows.map(row => ({
    id: row.id,
    values: Object.fromEntries(metrics.map(metric => [metric.key, finite(row.values[metric.key]) ? row.values[metric.key] as number : null])),
    lowVolume: volumes.length > 0 && (!finite(row.values[volumeKey]) || (row.values[volumeKey] as number) < threshold),
    percentiles: [] as number[], insights: [] as AreaInsight[], best: [] as string[], worst: [] as string[],
  }))
  for (const metric of metrics) {
    if (metric.direction === 'NEUTRAL' || !metric.rate) continue
    const present = summaries.filter(summary => !summary.lowVolume && summary.values[metric.key] != null)
    if (present.length < 2) continue
    const sign = metric.direction === 'LOWER_IS_BETTER' ? -1 : 1
    const values = present.map(summary => summary.values[metric.key]!)
    const middle = median(values)
    const bestValue = sign > 0 ? Math.max(...values) : Math.min(...values)
    const worstValue = sign > 0 ? Math.min(...values) : Math.max(...values)
    for (const summary of present) {
      const value = summary.values[metric.key]!
      const rank = 1 + values.filter(other => sign * other > sign * value).length
      summary.percentiles.push(100 * (present.length - rank) / (present.length - 1))
      if (bestValue !== worstValue && value === bestValue) summary.best.push(metric.key)
      if (bestValue !== worstValue && value === worstValue) summary.worst.push(metric.key)
      const raw = metric.percent ? value - middle : middle === 0 ? null : (value - middle) / Math.abs(middle) * 100
      if (raw != null && raw !== 0) summary.insights.push({ metric, value, median: middle, deviation: sign * raw, rank, of: present.length })
    }
  }
  return summaries.map(({ percentiles, insights, ...summary }) => ({
    ...summary,
    score: percentiles.length ? percentiles.reduce((total, value) => total + value, 0) / percentiles.length : null,
    strengths: insights.filter(item => item.deviation > 0).sort((a, b) => b.deviation - a.deviation).slice(0, limit),
    weaknesses: insights.filter(item => item.deviation < 0).sort((a, b) => a.deviation - b.deviation).slice(0, limit),
  })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
}

export type AreaTotalRow = AreaRow & { category: string }
// `purpose` is the mission; `parts` are the flight purposes it is made of.
export type AreaPurposeRow = AreaRow & { category: string; purpose: string; parts?: string[] }
export type AreaMission = { purpose: string; parts: string[]; flights: number; share: number; values: Record<string, number | null | undefined>; main: boolean }
export type MissionGroup = {
  key: string
  // null: several missions, compared in the department's overall rating.
  purpose: string | null
  areas: AreaSummary[]
  rated: number
  flights: number
}
export type MissionDepartment = { category: string; flights: number; groups: MissionGroup[] }
export type MissionOptions = AreaOptions & { shareThreshold?: number; minimumMissionFlights?: number }

const flightsOf = (values: Record<string, unknown>, key: string) => finite(values[key]) ? values[key] as number : 0
// Score (0–100) as 1–5 stars: every 20 points is one more star.
export const scoreStars = (score: number) => Math.max(1, Math.min(5, Math.floor(score / 20) + 1))

export const missionKey = (category: string, id: string) => `${category}\u0000${id}`

// Flight purposes that are one mission: an area doing free hunting and dynamic
// strikes is a strike area, not a multi-mission one. Other purposes stay as they are.
// `weight` is how demanding and dangerous the mission is for the crews and assets.
export const MISSIONS: Array<{ title: string; purposes: string[]; weight: number }> = [
  { title: 'Ураження', weight: 1, purposes: ['Ураження', 'Динамічне ураження', 'Вільне полювання', 'Планове ураження', 'Засідка'] },
  { title: 'Мінування', weight: 0.8, purposes: ['Мінування'] },
  { title: 'Розвідка', weight: 0.6, purposes: ['Розвідка', 'Дорозвідка', 'Зйомка ураження', 'Коригування', 'Супровід'] },
  { title: 'Доставка та евакуація', weight: 0.4, purposes: ['Доставка', 'Евакуація'] },
]
export const OTHER_MISSION_WEIGHT = 0.5
// Share of the multi-mission score given by the mission mix; the rest is quality.
export const DIFFICULTY_SHARE = 0.25
const MISSION_WEIGHT = new Map(MISSIONS.map(mission => [mission.title, mission.weight]))
export const missionWeight = (mission: string) => MISSION_WEIGHT.get(mission) ?? OTHER_MISSION_WEIGHT
const normalizePurpose = (value: string) => value.trim().toLocaleLowerCase('uk').replace(/\s+/g, ' ')
const MISSION_OF = new Map(MISSIONS.flatMap(mission => mission.purposes.map(purpose => [normalizePurpose(purpose), mission.title] as const)))
export const missionOf = (purpose: string) => MISSION_OF.get(normalizePurpose(purpose)) ?? purpose.trim()

// Present purposes per mission; a mission needs its own query only when it has several.
export function missionParts(purposes: string[]) {
  const result = new Map<string, string[]>()
  for (const purpose of new Set(purposes.filter(Boolean))) { const mission = missionOf(purpose); result.set(mission, [...(result.get(mission) ?? []), purpose]) }
  return result
}

// Per-purpose rows become per-mission rows. Values of a mission made of several
// purposes come from a query filtered by those purposes (`combined`), because
// rates cannot be added up; a single-purpose mission keeps its own row.
export function missionRows(rows: AreaPurposeRow[], combined: Map<string, AreaTotalRow[]>): AreaPurposeRow[] {
  const result = new Map<string, AreaPurposeRow>()
  for (const row of rows) {
    const mission = row.purpose ? missionOf(row.purpose) : ''
    const key = `${missionKey(row.category, row.id)}\u0000${mission}`
    const current = result.get(key)
    // Until the combined values arrive only the flights are known.
    if (current) { current.parts = [...(current.parts ?? []), row.purpose]; current.values = { flights: flightsOf(current.values, 'flights') + flightsOf(row.values, 'flights') } }
    else result.set(key, { ...row, purpose: mission, parts: row.purpose ? [row.purpose] : [] })
  }
  for (const [mission, list] of combined) {
    const values = new Map(list.map(row => [missionKey(row.category, row.id), row.values]))
    for (const row of result.values()) if (row.purpose === mission && (row.parts?.length ?? 0) > 1) row.values = values.get(missionKey(row.category, row.id)) ?? row.values
  }
  return [...result.values()]
}

// An area's missions within one department: purposes with a noticeable share of
// its flights. Occasional flights for another purpose do not change its profile.
export function areaMissions(rows: AreaPurposeRow[], { volumeKey = 'flights', shareThreshold = 0.1, minimumMissionFlights = 5 }: MissionOptions = {}) {
  const byArea = new Map<string, AreaPurposeRow[]>()
  for (const row of rows) { const key = missionKey(row.category, row.id); byArea.set(key, [...(byArea.get(key) ?? []), row]) }
  const result = new Map<string, AreaMission[]>()
  for (const [key, list] of byArea) {
    const total = list.reduce((sum, row) => sum + flightsOf(row.values, volumeKey), 0)
    const missions = list.filter(row => row.purpose).map(row => {
      const flights = flightsOf(row.values, volumeKey), share = total ? flights / total : 0
      return { purpose: row.purpose, parts: row.parts ?? [row.purpose], flights, share, values: row.values, main: share >= shareThreshold && flights >= minimumMissionFlights }
    }).sort((a, b) => b.flights - a.flights)
    // Too little activity everywhere: the largest purpose still defines the profile.
    if (missions.length && !missions.some(mission => mission.main)) missions[0].main = true
    result.set(key, missions)
  }
  return result
}

// Ratings are never mixed across departments. Inside a department, an area with
// one mission is compared only with areas doing just that mission. Areas with
// several missions form the overall rating, where each mission is judged against
// the same mission of other areas (2000 deliveries are not compared with 2000
// strikes) and a more demanding mission mix ranks higher.
export function analyzeMissionGroups(totals: AreaTotalRow[], purposes: AreaPurposeRow[], metrics: AreaMetric[], options: MissionOptions = {}): { departments: MissionDepartment[]; missions: Map<string, AreaMission[]> } {
  const volumeKey = options.volumeKey ?? 'flights'
  const missions = areaMissions(purposes, options)
  const departments = new Map<string, Map<string, { purpose: string | null; rows: AreaRow[] }>>()
  for (const row of totals) {
    const main = (missions.get(missionKey(row.category, row.id)) ?? []).filter(mission => mission.main)
    const purpose = main.length === 1 ? main[0].purpose : main.length ? null : ''
    const groups = departments.get(row.category) ?? departments.set(row.category, new Map()).get(row.category)!
    const key = purpose ?? '\u0000multi'
    const group = groups.get(key) ?? groups.set(key, { purpose, rows: [] }).get(key)!
    group.rows.push({ id: row.id, values: row.values })
  }
  const result = [...departments].map(([category, groups]) => {
    const list = [...groups].map(([key, group]) => {
      let areas = analyzeAreas(group.rows, metrics, options)
      if (group.purpose === null) areas = weighMissions(category, areas, [...groups.values()].flatMap(item => item.rows.map(row => row.id)), missions, metrics, options)
      return { key: `${category}\u0000${key}`, purpose: group.purpose, areas, rated: areas.filter(area => area.score != null).length, flights: group.rows.reduce((sum, row) => sum + flightsOf(row.values, volumeKey), 0) }
    }).sort((a, b) => Number(b.purpose === null) - Number(a.purpose === null) || b.flights - a.flights)
    return { category, groups: list, flights: list.reduce((sum, group) => sum + group.flights, 0) }
  }).sort((a, b) => b.flights - a.flights || a.category.localeCompare(b.category))
  return { departments: result, missions }
}

// Multi-mission score = quality × (1 − DIFFICULTY_SHARE) + difficulty × DIFFICULTY_SHARE.
// Quality: per-mission scores against every area of the department doing that
// mission, averaged with weights flights × mission weight. Difficulty: the mission
// mix, 100 when all flights are strikes.
function weighMissions(category: string, areas: AreaSummary[], departmentAreas: string[], missions: Map<string, AreaMission[]>, metrics: AreaMetric[], options: MissionOptions): AreaSummary[] {
  const byMission = new Map<string, AreaRow[]>()
  for (const id of departmentAreas) for (const mission of missions.get(missionKey(category, id)) ?? []) if (mission.main) byMission.set(mission.purpose, [...(byMission.get(mission.purpose) ?? []), { id, values: { ...mission.values, [options.volumeKey ?? 'flights']: mission.flights } }])
  const missionScores = new Map([...byMission].map(([mission, rows]) => [mission, new Map(analyzeAreas(rows, metrics, options).map(area => [area.id, area.score]))]))
  const top = Math.max(...MISSIONS.map(mission => mission.weight), OTHER_MISSION_WEIGHT)
  return areas.map(area => {
    if (area.score == null) return area
    const list = missions.get(missionKey(category, area.id)) ?? []
    let weighted = 0, weights = 0
    for (const mission of list) {
      const score = mission.main ? missionScores.get(mission.purpose)?.get(area.id) : null
      if (score == null) continue
      const weight = mission.flights * missionWeight(mission.purpose)
      weighted += score * weight; weights += weight
    }
    const shares = list.reduce((sum, mission) => sum + mission.share, 0)
    const difficulty = shares ? list.reduce((sum, mission) => sum + mission.share * missionWeight(mission.purpose), 0) / shares / top * 100 : null
    // Without comparable missions the totals stay the quality measure.
    const quality = weights ? weighted / weights : area.score
    return { ...area, quality, difficulty, score: difficulty == null ? quality : quality * (1 - DIFFICULTY_SHARE) + difficulty * DIFFICULTY_SHARE }
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
}
