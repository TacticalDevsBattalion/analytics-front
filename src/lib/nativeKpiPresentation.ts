import type { MetricBreakdownItem } from './types'

export function nativeKpiValueVisible(value: unknown, hideZeroValues = false): boolean {
  return !hideZeroValues || value !== 0
}

export function filterNativeKpiBreakdown(items: MetricBreakdownItem[], hideZeroValues = false): MetricBreakdownItem[] {
  if (!hideZeroValues) return items
  return items.flatMap(item => {
    if (item.value === 0) return []
    const children = item.children ? filterNativeKpiBreakdown(item.children, true) : undefined
    return [children ? { ...item, children } : item]
  })
}
