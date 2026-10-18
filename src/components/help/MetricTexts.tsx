import { createContext, useContext } from 'react'
import type { MetricText } from '../../lib/widgetExplanations'

// Metric titles and descriptions from the catalog, for "how it is calculated" hints.
export const MetricTextsContext = createContext<Record<string, MetricText>>({})
export const useMetricTexts = () => useContext(MetricTextsContext)
