import type { Metric } from './types'

// Use the complete Flights KPI breakdown, rather than the limited events table.
export function flightSummaryRows(metrics: Metric[] | undefined, dimension: 'category' | 'purpose'): Array<[string, number]> {
  const departments = metrics?.find(metric => metric.key === 'flights')?.breakdown ?? []
  if (dimension === 'category') return departments.flatMap(item => item.value != null ? [[item.label, item.value] as [string, number]] : [])
  const totals = new Map<string, { label: string; value: number }>()
  departments.forEach(department => department.children?.forEach(purpose => {
    if (purpose.value == null) return
    const existing = totals.get(purpose.key)
    totals.set(purpose.key, { label: existing?.label ?? purpose.label, value: (existing?.value ?? 0) + purpose.value })
  }))
  return [...totals.values()].sort((a, b) => b.value - a.value).map(item => [item.label, item.value])
}
