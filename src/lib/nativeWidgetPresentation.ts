import type { TimelinePoint } from './types'

export type NativeTimelineView = 'combined' | 'bars' | 'line' | 'area'

export function nativeNumericValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Zero suppression affects presentation only; unavailable values stay unavailable. */
export function nativePlotValue(value: number | null, hideZeroValues: boolean): number | null {
  return hideZeroValues && value === 0 ? null : value
}

export function visibleNativeValues<T extends { value: unknown }>(items: T[], hideZeroValues: boolean): T[] {
  return hideZeroValues ? items.filter(item => item.value !== 0) : items
}

export function nativeDistributionEntries(data: [string, number][], hideZeroValues: boolean) {
  return data.map(([label, value], index) => ({ label, value: nativeNumericValue(value), index }))
    .filter(entry => !hideZeroValues || entry.value !== 0)
}

export function nativeTimelineValues(point: TimelinePoint) {
  const total = nativeNumericValue(point.total)
  // Absent legacy fields have defined fallbacks. An explicit null means that
  // the server could not provide a value and must never become a known zero.
  const day = nativeNumericValue(point.day === undefined ? point.total : point.day)
  const night = nativeNumericValue(point.night === undefined ? 0 : point.night)
  const dayEffective = nativeNumericValue(point.day_effective === undefined ? point.effective : point.day_effective)
  const nightEffective = nativeNumericValue(point.night_effective === undefined ? 0 : point.night_effective)
  const dayEfficiency = point.day_efficiency !== undefined ? nativeNumericValue(point.day_efficiency)
    : day === null || dayEffective === null ? null : day > 0 ? Math.round(dayEffective / day * 1000) / 10 : 0
  const nightEfficiency = point.night_efficiency !== undefined ? nativeNumericValue(point.night_efficiency)
    : night === null || nightEffective === null ? null : night > 0 ? Math.round(nightEffective / night * 1000) / 10 : 0
  return { total, day, night, dayEfficiency, nightEfficiency }
}

/** A period total is unknown if even one supplied daily total is unavailable. */
export function nativeTimelineTotal(data: TimelinePoint[]): number | null {
  let total = 0
  for (const point of data) {
    const value = nativeNumericValue(point.total)
    if (value === null) return null
    total += value
  }
  return total
}

export function visibleNativeTimeline(data: TimelinePoint[], view: NativeTimelineView, hideZeroValues: boolean): TimelinePoint[] {
  if (!hideZeroValues) return data
  return data.filter(point => {
    const values = nativeTimelineValues(point)
    // Keep a date if any displayed field is nonzero or unavailable. The full
    // table also exposes the server's total in every chart view.
    const displayed = view === 'combined'
      ? [values.total, values.day, values.night, values.dayEfficiency, values.nightEfficiency]
      : [values.total, values.day, values.night]
    return !displayed.every(value => value === 0)
  })
}
