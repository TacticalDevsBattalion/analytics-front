import type { ComparisonGranularity, ComparisonResponse, ComparisonSelection, Metric } from './types'

export type ComparisonMetricRow = {
  key: string
  metricKey: string
  label: string
  context?: string
  secondary?: boolean
  unit?: string
  metrics: Record<string, Metric | undefined>
}

export function comparisonMetricRows(result: ComparisonResponse): ComparisonMetricRow[] {
  const rows = new Map<string, ComparisonMetricRow>()

  for (const selection of result.selections) {
    for (const metric of selection.metrics) {
      const row = rows.get(metric.key) ?? {
        key: metric.key,
        metricKey: metric.key,
        label: metric.label,
        context: metric.primary_label || undefined,
        unit: metric.unit,
        metrics: {},
      }
      row.metrics[selection.id] = metric
      row.context ||= metric.primary_label || undefined
      rows.set(metric.key, row)

      if (metric.secondary_value != null) {
        const key = `${metric.key}:secondary`
        const secondaryRow = rows.get(key) ?? {
          key,
          metricKey: metric.key,
          label: metric.label,
          context: metric.secondary_label || undefined,
          secondary: true,
          metrics: {},
        }
        secondaryRow.context ||= metric.secondary_label || undefined
        secondaryRow.metrics[selection.id] = { ...metric, value: metric.secondary_value, unit: undefined }
        rows.set(key, secondaryRow)
      }
    }
  }

  return [...rows.values()]
}

export function metricDifference(value?: number | null, baseline?: number | null) {
  if (value == null || baseline == null || !Number.isFinite(value) || !Number.isFinite(baseline)) {
    return { absolute: null, relative: null }
  }

  return {
    absolute: value - baseline,
    relative: baseline === 0 ? null : ((value - baseline) / Math.abs(baseline)) * 100,
  }
}

function calendarDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid calendar date')
  }
  return date
}

function bucketStart(date: Date, granularity: ComparisonGranularity) {
  const start = new Date(date)
  if (granularity === 'week') start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
  if (granularity === 'month' || granularity === 'quarter') start.setUTCDate(1)
  if (granularity === 'quarter') start.setUTCMonth(Math.floor(start.getUTCMonth() / 3) * 3)
  return start
}

function shiftBuckets(date: Date, granularity: ComparisonGranularity, count: number) {
  const shifted = new Date(date)
  if (granularity === 'day') shifted.setUTCDate(shifted.getUTCDate() + count)
  if (granularity === 'week') shifted.setUTCDate(shifted.getUTCDate() + count * 7)
  if (granularity === 'month') shifted.setUTCMonth(shifted.getUTCMonth() + count)
  if (granularity === 'quarter') shifted.setUTCMonth(shifted.getUTCMonth() + count * 3)
  return shifted
}

// Inputs are local calendar dates. UTC arithmetic avoids daylight-saving shifts.
export function temporalPresetRange(granularity: ComparisonGranularity, count: number, today: string) {
  if (!Number.isInteger(count) || count < 1 || count > 24) throw new Error('Invalid period count')
  const start = shiftBuckets(bucketStart(calendarDate(today), granularity), granularity, 1 - count)
  return { date_from: start.toISOString().slice(0, 10), date_to: today, time_from: undefined, time_to: undefined }
}

export function temporalPeriodCount(dateFrom: string, dateTo: string, granularity: ComparisonGranularity) {
  try {
    const fromDate = calendarDate(dateFrom)
    const toDate = calendarDate(dateTo)
    if (fromDate > toDate) return 0
    const from = bucketStart(fromDate, granularity)
    const to = bucketStart(toDate, granularity)
    let count = 1
    // The UI only needs to distinguish valid workloads from the 24-period limit.
    for (let current = from; current < to && count <= 24; count++) current = shiftBuckets(current, granularity, 1)
    return count
  } catch {
    return 0
  }
}

export function temporalGroups(result: ComparisonResponse) {
  const groups = new Map<string, { id: string; label: string }>()
  for (const selection of result.selections) {
    if (selection.group_id && !groups.has(selection.group_id)) {
      groups.set(selection.group_id, { id: selection.group_id, label: selection.label })
    }
  }
  return [...groups.values()]
}

export function comparisonReference(result: ComparisonResponse, selection: ComparisonSelection) {
  if (result.mode !== 'units_over_time') return result.selections.find((item) => item.id === result.baseline_id)
  const periods = result.periods || []
  const index = periods.findIndex((period) => period.id === selection.period_id)
  if (index <= 0 || !selection.group_id) return undefined
  return result.selections.find((item) => item.group_id === selection.group_id && item.period_id === periods[index - 1].id)
}

export function temporalMetricCells(result: ComparisonResponse, row: ComparisonMetricRow) {
  return (result.periods || []).map((period) => ({
    period,
    cells: temporalGroups(result).map((group) => {
      const selection = result.selections.find((item) => item.period_id === period.id && item.group_id === group.id)
      const reference = selection ? comparisonReference(result, selection) : undefined
      const value = selection ? row.metrics[selection.id]?.value : undefined
      const previousValue = reference ? row.metrics[reference.id]?.value : undefined
      return {
        groupId: group.id,
        selection,
        value: value != null && Number.isFinite(value) ? value : null,
        ...metricDifference(value, previousValue),
      }
    }),
  }))
}

// Quote every cell and neutralize formula-like strings when opened in a spreadsheet.
// Numeric values remain numeric, including negative differences.
export function comparisonCsv(rows: Array<Array<string | number | null | undefined>>) {
  const cell = (value: string | number | null | undefined) => {
    let text = value == null ? '' : String(value)
    if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`
}
