import type { ComparisonResponse, MetricBreakdownItem } from './types'

export type ComparisonDetailRow = {
  key: string
  parentKey?: string
  label: string
  pathLabels: string[]
  depth: number
  metrics: Record<string, MetricBreakdownItem | undefined>
}

export function comparisonDetailRows(
  result: ComparisonResponse,
  metricKey = 'flights',
): ComparisonDetailRow[] {
  // Secondary event totals have no corresponding device/purpose breakdown.
  if (metricKey.endsWith(':secondary')) return []

  const rows = new Map<string, ComparisonDetailRow>()

  for (const selection of result.selections) {
    const metric = selection.metrics.find((item) => item.key === metricKey)

    const visit = (items: MetricBreakdownItem[], keys: string[], labels: string[]) => {
      for (const item of items) {
        const pathKeys = [...keys, item.key]
        const pathLabels = [...labels, item.label]
        const key = JSON.stringify(pathKeys)
        const row = rows.get(key) ?? {
          key,
          parentKey: keys.length ? JSON.stringify(keys) : undefined,
          label: item.label,
          pathLabels,
          depth: keys.length,
          metrics: Object.create(null) as Record<string, MetricBreakdownItem | undefined>,
        }
        row.metrics[selection.id] = item
        rows.set(key, row)
        visit(item.children ?? [], pathKeys, pathLabels)
      }
    }

    visit(metric?.breakdown ?? [], [], [])
  }

  return [...rows.values()]
}

export function comparisonDetailValue(row: ComparisonDetailRow, selectionId: string): number | undefined {
  const value = row.metrics[selectionId]?.value
  return value != null && Number.isFinite(value) ? value : undefined
}
