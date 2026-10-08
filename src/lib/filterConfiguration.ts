import type { ComparisonDimension, FilterState } from './types'

export type ConfiguredFilterKey = 'organization' | 'category' | 'purpose' | 'direction' | 'unit' | 'asset' | 'group' | 'class_name' | 'result' | 'time'
export type SelectionFilterKey = Exclude<keyof FilterState, 'date_from' | 'date_to' | 'time_from' | 'time_to'>
export type ConfiguredFilterField = { key: ConfiguredFilterKey; label: string; placement: 'main' | 'extra' | 'hidden' }
export type ResolvedFilterField = ConfiguredFilterField & { selectionKey: SelectionFilterKey }

/** The legacy BBAK and battalion filters currently point to the same source field.
 * Consolidate only equivalent conditions; different selections must retain their
 * existing intersection until the user explicitly edits or removes them. */
export function canonicalOrganizationFilters(filters: FilterState, dimension: ComparisonDimension): FilterState {
  const next = { ...filters, bbak: [...(filters.bbak || [])], battalion: [...(filters.battalion || [])] }
  if (dimension !== 'bbak' && dimension !== 'battalion') return next
  const alias = dimension === 'bbak' ? 'battalion' : 'bbak'
  const chosen = next[dimension]
  const previous = next[alias]
  if (!previous.length) return next
  if (!chosen.length || (chosen.length === previous.length && previous.every((value) => chosen.includes(value)))) {
    next[dimension] = [...new Set(chosen.length ? chosen : previous)]
    next[alias] = []
  }
  return next
}

export function resolveFilterFields(fields: readonly ConfiguredFilterField[], dimension: ComparisonDimension): ResolvedFilterField[] {
  const seen = new Set<SelectionFilterKey>()
  // Organization owns its dimension even when a saved configuration places it last.
  if (fields.some((field) => field.key === 'organization')) seen.add(dimension)
  return fields.flatMap((field) => {
    if (field.key === 'time') return []
    const selectionKey = field.key === 'organization' ? dimension : field.key
    if (field.key !== 'organization' && seen.has(selectionKey)) return []
    seen.add(selectionKey)
    return [{ ...field, selectionKey }]
  })
}

export function countSelectedFilters(filters: FilterState): number {
  return Object.values(filters).reduce((count: number, value) => count + (Array.isArray(value) ? value.length : 0), 0)
}

export function selectedFilterKeys(filters: FilterState): SelectionFilterKey[] {
  return (Object.keys(filters) as Array<keyof FilterState>).filter((key): key is SelectionFilterKey => Array.isArray(filters[key]) && filters[key].length > 0)
}

export function optionsWithSelections<T extends string | { id: number; title: string }>(options: readonly T[], selected: readonly string[]): Array<T | string> {
  const present = new Set(options.map((option) => typeof option === 'string' ? option : String(option.id)))
  return [...options, ...selected.filter((value, index) => !present.has(value) && selected.indexOf(value) === index)]
}
