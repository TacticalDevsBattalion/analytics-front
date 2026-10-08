import type { Metric, MetricBreakdownItem } from './types'

export function nativeKpiValueVisible(value: unknown, hideZeroValues = false): boolean {
  return !hideZeroValues || value !== 0
}

export function nativeKpiHasSecondary(metric: Pick<Metric, 'secondary_label' | 'secondary_value'>): boolean {
  return Boolean(metric.secondary_label?.trim()) || metric.secondary_value != null
}

export function filterNativeKpiBreakdown(items: MetricBreakdownItem[], hideZeroValues = false): MetricBreakdownItem[] {
  if (!hideZeroValues) return items
  return items.flatMap(item => {
    if (item.value === 0) return []
    const children = item.children ? filterNativeKpiBreakdown(item.children, true) : undefined
    return [children ? { ...item, children } : item]
  })
}

export function nativeKpiCardVisible(metric: Metric, hideZeroValues = false): boolean {
  return !hideZeroValues || metric.value !== 0
}
