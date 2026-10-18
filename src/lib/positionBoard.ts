// Flights by day and night: departments, their positions, and the crews of each position.
export type Counts = { flights: number; day: number; night: number; effective: number | null; efficiencyWeight: number }
export type Crew = Counts & { team: string }
export type Position = Counts & { key: string; position: string; bbak: string; crews: Crew[] }
export type Department = Counts & { category: string; positions: Position[] }
export type SortKey = 'flights' | 'day' | 'night' | 'night_share' | 'efficiency'

export const SORTS: [SortKey, string][] = [['flights', 'Усього вильотів'], ['day', 'Вдень'], ['night', 'Вночі'], ['night_share', 'Частка ночі']]
const empty = (): Counts => ({ flights: 0, day: 0, night: 0, effective: null, efficiencyWeight: 0 })
const num = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0
const label = (value: unknown, fallback: string) => value === null || value === undefined || String(value).trim() === '' ? fallback : String(value)

function add(target: Counts, row: Record<string, unknown>) {
  const flights = num(row.flights)
  target.flights += flights
  target.day += num(row.day_flights)
  target.night += num(row.night_flights)
  // Efficiency of a group is effective ÷ flights; without "effective" it is weighted by flights.
  const effective = typeof row.effective === 'number' ? row.effective : typeof row.efficiency === 'number' ? row.efficiency * flights / 100 : null
  if (effective !== null) { target.effective = (target.effective ?? 0) + effective; target.efficiencyWeight += flights }
}

export function efficiencyOf(counts: Counts) {
  return counts.effective === null || counts.efficiencyWeight === 0 ? null : counts.effective / counts.efficiencyWeight * 100
}

export function groupPositions(rows: Record<string, unknown>[]): Department[] {
  const departments = new Map<string, Department>()
  for (const row of rows) {
    const category = label(row.category, 'Без кафедри')
    const department = departments.get(category) ?? { ...empty(), category, positions: [] }
    departments.set(category, department)
    const bbak = label(row.bbak_title, '')
    const name = label(row.position, 'Без позиції')
    const key = `${bbak}\u0000${name}`
    let position = department.positions.find(item => item.key === key)
    if (!position) { position = { ...empty(), key, position: name, bbak, crews: [] }; department.positions.push(position) }
    const teamName = label(row.team, 'Без екіпажу')
    let crew = position.crews.find(item => item.team === teamName)
    if (!crew) { crew = { ...empty(), team: teamName }; position.crews.push(crew) }
    add(department, row); add(position, row); add(crew, row)
  }
  return [...departments.values()].sort((left, right) => right.flights - left.flights)
}

export function sortValue(counts: Counts, key: SortKey) {
  if (key === 'night_share') return counts.flights ? counts.night / counts.flights : -1
  if (key === 'efficiency') return efficiencyOf(counts) ?? -1
  return counts[key]
}

