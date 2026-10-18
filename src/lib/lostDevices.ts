// Losses per department as counts per device, not one card per lost drone.
// Single-use drones that struck or destroyed their target are "spent", counted apart.
export type LossRow = { category: string; asset?: string; result?: string; group?: string; spent?: boolean }
export type AssetLosses = { asset: string; lost: number; spent: number; results: [string, number][]; positions: [string, number][] }
export type DepartmentLosses = { department: string; lost: number; spent: number; results: [string, number][]; positions: [string, number][]; assets: AssetLosses[] }

const byCount = (counts: Map<string, number>): [string, number][] => [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'uk'))
const bump = (counts: Map<string, number>, key: string) => counts.set(key, (counts.get(key) ?? 0) + 1)
type Tally = { lost: number; spent: number; results: Map<string, number>; positions: Map<string, number> }
const tally = (): Tally => ({ lost: 0, spent: 0, results: new Map(), positions: new Map() })
const add = (target: Tally, row: LossRow) => {
  if (row.spent) { target.spent += 1; return }
  target.lost += 1
  bump(target.results, row.result?.trim() || 'Без результату')
  // Where the drone was lost: the position of its flight.
  bump(target.positions, row.group?.trim() && row.group !== '—' ? row.group.trim() : 'Позицію не вказано')
}

export function summarizeLosses(rows: LossRow[], order: string[] = []): DepartmentLosses[] {
  const departments = new Map<string, Tally & { assets: Map<string, Tally> }>()
  for (const row of rows) {
    const department = departments.get(row.category) ?? { ...tally(), assets: new Map() }
    departments.set(row.category, department)
    const name = row.asset?.trim() && row.asset !== '—' ? row.asset.trim() : 'Засіб не вказано'
    const asset = department.assets.get(name) ?? tally()
    department.assets.set(name, asset)
    add(department, row)
    add(asset, row)
  }
  const rank = (name: string) => { const index = order.indexOf(name); return index < 0 ? order.length : index }
  return [...departments].map(([department, data]) => ({
    department, lost: data.lost, spent: data.spent, results: byCount(data.results), positions: byCount(data.positions),
    assets: [...data.assets].map(([asset, item]) => ({ asset, lost: item.lost, spent: item.spent, results: byCount(item.results), positions: byCount(item.positions) }))
      .sort((left, right) => right.lost + right.spent - left.lost - left.spent || left.asset.localeCompare(right.asset, 'uk')),
  })).sort((left, right) => rank(left.department) - rank(right.department) || right.lost - left.lost)
}
