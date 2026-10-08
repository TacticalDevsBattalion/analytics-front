import type { CacheInvalidation, CachePeriod, CacheRange, CacheTarget, CacheWarmRequest } from './biAdminApi'

function validRange(range: CacheRange): CacheRange {
  for (const value of [range.from, range.to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) throw new Error('Оберіть коректні дати періоду.')
    const parsed = new Date(`${value}T00:00:00Z`)
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error('Некоректна календарна дата.')
  }
  if (range.from > range.to) throw new Error('Початок періоду повинен бути не пізніше завершення.')
  return { ...range }
}

export function cacheInvalidation(target: CacheTarget, range: CacheRange, key: string): CacheInvalidation {
  if (target === 'PERIOD') {
    const date_range = validRange(range)
    if ((Date.parse(date_range.to) - Date.parse(date_range.from)) / 86400000 > 3660) throw new Error('Період очищення не може перевищувати десять років.')
    return { target, date_range }
  }
  if (target === 'METRIC' || target === 'KPI') {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,127}$/.test(key)) throw new Error('Оберіть метрику або KPI.')
    return { target, key }
  }
  return { target }
}

export function cacheWarmRequest(periods: CachePeriod[], range: CacheRange, keys: string[]): CacheWarmRequest {
  if (!periods.length || new Set(periods).size !== periods.length) throw new Error('Оберіть унікальні періоди підготовки cache.')
  if (!keys.length || keys.length > 30 || new Set(keys).size !== keys.length) throw new Error('Оберіть від 1 до 30 унікальних метрик.')
  return { periods: [...periods], metric_keys: [...keys], ...(periods.includes('CUSTOM') ? { date_range: validRange(range) } : {}) }
}
