/**
 * Helpers for the single "date + time of day" period field (<input type="datetime-local">).
 *
 * The filter state keeps the date and an *optional* time of day. A missing time means
 * "the whole day", so the day boundaries are shown in the field but stored as "no time".
 * That keeps quick periods, saved views and the backend request unchanged.
 */
export type PeriodSide = 'from' | 'to'

const FULL_DAY: Record<PeriodSide, string[]> = {
  from: ['', '00:00', '00:00:00'],
  to: ['', '23:59', '23:59:59'],
}

/** Value for a datetime-local input; a missing time is shown as the day boundary. */
export function dateTimeValue(date: string, time: string | undefined, boundary: string): string {
  return `${date}T${(time || boundary).slice(0, 8)}`
}

/** Splits a datetime-local value back into state. Returns null for empty / incomplete input. */
export function parseDateTimeValue(side: PeriodSide, value: string): { date: string; time: string | undefined } | null {
  if (!value) return null
  const [date, rawTime = ''] = value.split('T')
  if (!date) return null
  const time = rawTime.slice(0, 8)
  return { date, time: FULL_DAY[side].includes(time) ? undefined : time }
}
