import { temporalPeriodCount } from './comparison'
import type { ComparisonFilterSettings, ComparisonRequest, FilterState } from './types'

type Period = ComparisonFilterSettings['reference_period']
type Validation = 'period' | 'reference' | 'units' | 'workload'

function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function timeValue(value: string | undefined, endOfDay: boolean): number | null {
  if (value == null || value === '') return endOfDay ? 86_400_000_000 - 1 : 0
  const parts = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,6}))?)?$/.exec(value)
  if (!parts) return null
  return (Number(parts[1]) * 3600 + Number(parts[2]) * 60 + Number(parts[3] || 0)) * 1_000_000
    + Number((parts[4] || '').padEnd(6, '0'))
}

function validPeriod(period: Period) {
  if (!validCalendarDate(period.date_from) || !validCalendarDate(period.date_to)) return false
  const start = timeValue(period.time_from, false)
  const end = timeValue(period.time_to, true)
  if (start == null || end == null || period.date_from > period.date_to) return false
  return period.date_from < period.date_to || start <= end
}

function selectedUnits(settings: ComparisonFilterSettings, filters: FilterState) {
  return (filters[settings.dimension] || []).map((value) => value.trim())
}

export function comparisonSetupValidation(settings: ComparisonFilterSettings, filters: FilterState): Validation | null {
  // The shared filter bar must validate its reporting window with comparison off.
  if (!validPeriod(filters)) return 'period'
  if (!settings.enabled) return null
  if (settings.mode === 'periods') {
    return settings.reference === 'custom' && !validPeriod(settings.reference_period) ? 'reference' : null
  }

  const units = selectedUnits(settings, filters)
  if (units.length < 2 || units.length > 6 || units.some((value) => !value) || new Set(units).size !== units.length) return 'units'
  if (settings.mode === 'units_over_time') {
    const count = temporalPeriodCount(filters.date_from, filters.date_to, settings.granularity)
    if (count < 1 || count > 24 || count * units.length > 72) return 'workload'
  }
  return null
}

function cloneFilters(filters: FilterState): FilterState {
  return {
    ...Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])) as FilterState,
    time_from: filters.time_from || undefined,
    time_to: filters.time_to || undefined,
  }
}

const validationMessages: Record<Validation, string> = {
  period: 'Enter a valid reporting date and time range using local times without a timezone offset.',
  reference: 'Enter a valid custom comparison date and time range using local times without a timezone offset.',
  units: 'Select between 2 and 6 distinct, nonblank values in the grouping filter.',
  workload: 'Choose up to 24 periods and 72 group-period combinations.',
}

export function buildComparisonRequest(settings: ComparisonFilterSettings, filters: FilterState): ComparisonRequest | null {
  if (!settings.enabled) return null
  const validation = comparisonSetupValidation(settings, filters)
  if (validation) throw new Error(validationMessages[validation])

  const current = cloneFilters(filters)
  if (settings.mode === 'periods') {
    if (settings.reference === 'previous') return { mode: 'periods', filters: current }
    const reference = settings.reference_period
    return {
      mode: 'periods',
      filters: current,
      comparison_filters: {
        ...cloneFilters(filters),
        date_from: reference.date_from,
        date_to: reference.date_to,
        time_from: reference.time_from || undefined,
        time_to: reference.time_to || undefined,
      },
    }
  }

  return {
    mode: settings.mode,
    filters: current,
    dimension: settings.dimension,
    units: selectedUnits(settings, filters),
    ...(settings.mode === 'units_over_time' ? { granularity: settings.granularity } : {}),
  }
}
