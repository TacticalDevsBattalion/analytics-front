// The filters a user left a page with, kept on the server and restored on any device.
// A period that reaches today or yesterday ("7 днів", "Сьогодні", "Вчора") is kept
// relative to the current day, so it does not go stale; an explicitly chosen past
// period is kept as it was.
export type FilterValues = Record<string, unknown> & { date_from: string; date_to: string; time_from?: string; time_to?: string }
export type SavedPeriod = { mode: 'relative'; end_offset: number; length: number } | { mode: 'absolute'; from: string; to: string }
export type SavedFilters = { version: 1; period: SavedPeriod; time_from?: string; time_to?: string; values: Record<string, string[]>; custom?: Record<string, unknown> }

const DAY = 86_400_000
const parse = (value: string) => { const [y, m, d] = value.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const format = (time: number) => new Date(time).toISOString().slice(0, 10)
const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

export function serializeFilters(filters: FilterValues, today: string, custom?: Record<string, unknown>): SavedFilters {
  const end = parse(filters.date_to), start = parse(filters.date_from), now = parse(today)
  const endOffset = Math.round((now - end) / DAY)
  const period: SavedPeriod = endOffset >= 0 && endOffset <= 1
    ? { mode: 'relative', end_offset: endOffset, length: Math.max(1, Math.round((end - start) / DAY) + 1) }
    : { mode: 'absolute', from: filters.date_from, to: filters.date_to }
  const values: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value) && value.length) values[key] = value.map(String)
  }
  return { version: 1, period, ...(filters.time_from ? { time_from: filters.time_from } : {}), ...(filters.time_to ? { time_to: filters.time_to } : {}), values, ...(custom && Object.keys(custom).length ? { custom } : {}) }
}

/** The saved filters applied over the defaults; keys the app no longer has are ignored. */
export function restoreFilters<T extends FilterValues>(saved: unknown, defaults: T, today: string): T {
  if (!saved || typeof saved !== 'object' || (saved as SavedFilters).version !== 1) return defaults
  const value = saved as SavedFilters
  const result: T = { ...defaults }
  const period = value.period
  if (period?.mode === 'relative' && Number.isInteger(period.end_offset) && Number.isInteger(period.length) && period.length >= 1 && period.length <= 3660) {
    const end = parse(today) - period.end_offset * DAY
    result.date_to = format(end)
    result.date_from = format(end - (period.length - 1) * DAY)
  } else if (period?.mode === 'absolute' && isDate(period.from) && isDate(period.to) && period.from <= period.to) {
    result.date_from = period.from
    result.date_to = period.to
  }
  if (typeof value.time_from === 'string') result.time_from = value.time_from
  if (typeof value.time_to === 'string') result.time_to = value.time_to
  for (const [key, list] of Object.entries(value.values ?? {})) {
    if (Array.isArray((defaults as Record<string, unknown>)[key]) && Array.isArray(list)) (result as Record<string, unknown>)[key] = list.map(String)
  }
  return result
}
