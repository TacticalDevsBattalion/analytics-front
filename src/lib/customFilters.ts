import type { QueryFilter } from './biTypes'

export type CustomFilterType = 'select' | 'number_range' | 'text' | 'boolean'
export type CustomFilterPlacement = 'main' | 'extra' | 'hidden'
export type CustomFilterOption = { value: string; label: string }
export type CustomFilterDefinition = {
  id: string
  label: string
  field: string
  type: CustomFilterType
  placement: CustomFilterPlacement
  options: CustomFilterOption[]
}
export type NumberRangeValue = { min?: string; max?: string }
export type BooleanValue = '' | 'yes' | 'no'
export type CustomFilterValue = string[] | NumberRangeValue | string | BooleanValue
export type CustomFilterValues = Record<string, CustomFilterValue | undefined>

export const CUSTOM_FILTER_TYPE_LABELS: Record<CustomFilterType, string> = {
  select: 'Вибір зі списку',
  number_range: 'Діапазон чисел',
  text: 'Текстовий пошук',
  boolean: 'Так / ні',
}

const finite = (raw: string | undefined): number | null => {
  if (raw === undefined || raw.trim() === '') return null
  const value = Number(raw.replace(',', '.'))
  return Number.isFinite(value) ? value : null
}

function normalized(definition: CustomFilterDefinition, value: CustomFilterValue | undefined): CustomFilterValue | null {
  if (definition.type === 'select') {
    const known = new Set(definition.options.map(option => option.value))
    const selected = Array.isArray(value) ? value.filter(item => known.has(item)) : []
    return selected.length ? selected : null
  }
  if (definition.type === 'number_range') {
    const range: NumberRangeValue = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    const min = finite(range.min), max = finite(range.max)
    if (min === null && max === null) return null
    return { ...(min !== null ? { min: String(min) } : {}), ...(max !== null ? { max: String(max) } : {}) }
  }
  if (definition.type === 'text') return typeof value === 'string' && value.trim() ? value.trim() : null
  return value === 'yes' || value === 'no' ? value : null
}

export const isCustomValueActive = (definition: CustomFilterDefinition, value: CustomFilterValue | undefined) => normalized(definition, value) !== null

/** Drops empty and stale values so that removed or edited definitions never leave hidden filters behind. */
export function pruneCustomValues(definitions: readonly CustomFilterDefinition[], values: CustomFilterValues): CustomFilterValues {
  const result: CustomFilterValues = {}
  for (const definition of definitions) {
    const value = normalized(definition, values[definition.id])
    if (value !== null) result[definition.id] = value
  }
  return result
}

/** Stable comparison key: the order in which values were typed must not matter. */
export const customSignature = (definitions: readonly CustomFilterDefinition[], values: CustomFilterValues) =>
  JSON.stringify(definitions.map(definition => {
    const value = normalized(definition, values[definition.id])
    return [definition.id, Array.isArray(value) ? [...value].sort() : value]
  }))

export const countCustomValues = (definitions: readonly CustomFilterDefinition[], values: CustomFilterValues) =>
  definitions.filter(definition => isCustomValueActive(definition, values[definition.id])).length

export function customFiltersToQuery(definitions: readonly CustomFilterDefinition[], values: CustomFilterValues): QueryFilter[] {
  return definitions.flatMap((definition): QueryFilter[] => {
    const value = normalized(definition, values[definition.id])
    if (value === null) return []
    if (definition.type === 'select') return [{ field: definition.field, operator: 'in', value }]
    if (definition.type === 'text') return [{ field: definition.field, operator: 'contains', value }]
    if (definition.type === 'boolean') return [{ field: definition.field, operator: 'eq', value: value === 'yes' }]
    const range = value as NumberRangeValue
    const min = finite(range.min), max = finite(range.max)
    if (min !== null && max !== null) return [{ field: definition.field, operator: 'between', value: [Math.min(min, max), Math.max(min, max)] }]
    return min !== null ? [{ field: definition.field, operator: 'gte', value: min }] : [{ field: definition.field, operator: 'lte', value: max }]
  })
}

/** Short human-readable description for chips and tooltips. */
export function describeCustomValue(definition: CustomFilterDefinition, value: CustomFilterValue | undefined): string {
  const current = normalized(definition, value)
  if (current === null) return ''
  if (definition.type === 'select') {
    const labels = new Map(definition.options.map(option => [option.value, option.label]))
    return (current as string[]).map(item => labels.get(item) ?? item).join(', ')
  }
  if (definition.type === 'number_range') {
    const { min, max } = current as NumberRangeValue
    return min !== undefined && max !== undefined ? `${min} – ${max}` : min !== undefined ? `від ${min}` : `до ${max}`
  }
  if (definition.type === 'boolean') return current === 'yes' ? 'Так' : 'Ні'
  return `«${current as string}»`
}

/** Admin text format: one option per line, "value = label" (the label is optional). */
export function parseCustomOptions(text: string): CustomFilterOption[] {
  const seen = new Set<string>()
  return text.split(/\r?\n/).flatMap(line => {
    const trimmed = line.trim()
    if (!trimmed) return []
    const separator = trimmed.indexOf('=')
    const value = (separator < 0 ? trimmed : trimmed.slice(0, separator)).trim()
    const label = (separator < 0 ? '' : trimmed.slice(separator + 1)).trim() || value
    if (!value || seen.has(value)) return []
    seen.add(value)
    return [{ value, label }]
  })
}

export const formatCustomOptions = (options: readonly CustomFilterOption[]) =>
  options.map(option => option.label === option.value ? option.value : `${option.value} = ${option.label}`).join('\n')

export function slugifyFilterId(label: string, taken: readonly string[]): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^[^a-z]+/, '').replace(/_+$/g, '') || 'filter'
  const stem = (base.length >= 2 ? base : `filter_${base}`).slice(0, 34)
  let candidate = stem, index = 2
  while (taken.includes(candidate)) candidate = `${stem}_${index++}`
  return candidate
}

export function validateCustomFilters(definitions: readonly CustomFilterDefinition[]): string | null {
  const ids = new Set<string>()
  for (const definition of definitions) {
    if (!definition.label.trim()) return 'У кожного власного фільтра має бути назва.'
    if (!definition.field.trim()) return `Оберіть поле даних для фільтра «${definition.label}».`
    if (ids.has(definition.id)) return 'Ідентифікатори власних фільтрів мають бути унікальними.'
    ids.add(definition.id)
    if (definition.type === 'select' && definition.options.length === 0) return `Додайте хоча б одне значення для фільтра «${definition.label}».`
  }
  return definitions.length > 20 ? 'Можна створити не більше 20 власних фільтрів.' : null
}
