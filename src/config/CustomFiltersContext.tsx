import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useAppConfiguration } from './AppConfigurationContext'
import type { QueryFilter } from '../lib/biTypes'
import { customFiltersToQuery, pruneCustomValues, type CustomFilterDefinition, type CustomFilterValues } from '../lib/customFilters'

type ContextValue = {
  definitions: CustomFilterDefinition[]
  values: CustomFilterValues
  setValues: (values: CustomFilterValues) => void
  /** Ready-to-send BI query filters for the currently applied custom values. */
  queryFilters: QueryFilter[]
}

const noDefinitions: CustomFilterDefinition[] = []
const fallback: ContextValue = { definitions: noDefinitions, values: {}, setValues: () => {}, queryFilters: [] }
const Context = createContext<ContextValue>(fallback)

export function CustomFiltersProvider({ children }: { children: ReactNode }) {
  const { config } = useAppConfiguration()
  const definitions = config.filters.custom ?? noDefinitions
  const [stored, setStored] = useState<CustomFilterValues>({})
  // Values of deleted or edited filters are dropped at read time, never sent to the API.
  const values = useMemo(() => pruneCustomValues(definitions, stored), [definitions, stored])
  const setValues = useCallback((next: CustomFilterValues) => setStored(next), [])
  const queryFilters = useMemo(() => customFiltersToQuery(definitions, values), [definitions, values])
  const value = useMemo(() => ({ definitions, values, setValues, queryFilters }), [definitions, values, setValues, queryFilters])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export const useCustomFilters = () => useContext(Context)
