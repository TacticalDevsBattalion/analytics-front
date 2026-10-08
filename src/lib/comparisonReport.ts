import type { AppConfiguration, PurposeKpiRule } from '../config/appConfiguration'
import type { ComparisonResponse, ComparisonSelection, FilterOptions, FilterState, Metric, MetricBreakdownItem } from './types'

export type ComparisonReportContext = {
  config: AppConfiguration
  options?: FilterOptions
  sourceLabel: string
  createdAt?: string
  language?: 'uk' | 'en'
}
export type ReportFilter = { key: string; label: string; rawValues: string[]; labels: string[] }
export type ReportSelection = {
  id: string; label: string; rawLabel: string; groupId: string; periodId: string; periodLabel: string
  dateFrom: string; dateTo: string; timeFrom: string; timeTo: string
  isPartial: boolean; isCurrent: boolean; isFuture: boolean
  referenceId: string; referenceLabel: string; referencePeriod: string
  filters: ReportFilter[]; rawFilters: FilterState
}
export type ReportMetric = { id: string; key: string; label: string; context: string; secondary: boolean; unit: string }
export type ReportValueStatus = 'available' | 'unavailable' | 'zero_weight'
export type ReportDifferenceStatus = 'available' | 'no_reference' | 'missing_value' | 'zero_reference'
export type ReportRow = {
  selectionId: string; metricId: string; metricKey: string; metricLabel: string; metricContext: string
  scope: 'primary' | 'secondary' | 'category' | 'purpose' | 'breakdown'
  depth: number; pathKeys: string[]; pathLabels: string[]; rawPathLabels: string[]
  category: string; purpose: string; unit: string; value: number | null; valueStatus: ReportValueStatus
  referenceId: string; referenceValue: number | null; referenceValueStatus: ReportValueStatus
  absoluteDifference: number | null; differenceUnit: string; relativeDifference: number | null
  differenceStatus: ReportDifferenceStatus; numerator: number | null; denominator: number | null
}
export type ComparisonReport = {
  title: string; createdAt: string; language: 'uk' | 'en'; source: string; sourceLabel: string
  mode: ComparisonResponse['mode']; dimension: ComparisonResponse['dimension']; granularity: string
  configurationRevision: number | null; fingerprint: string; kpiRules: PurposeKpiRule[] | null
  kpiFormula: string; kpiDefaultRule: string
  referenceExplanation: string; notes: string[]
  periods: NonNullable<ComparisonResponse['periods']>; selections: ReportSelection[]; metrics: ReportMetric[]; rows: ReportRow[]
}

const numeric = (value: number | null | undefined): number | null => value != null && Number.isFinite(value) ? value : null
const knownMetricLabels: Record<string, [string, string]> = {
  flights: ['Вильоти', 'Flights'], effective: ['Результативні', 'Successful flights'], detected: ['Виявлено', 'Detected'],
  affected: ['Уражено', 'Affected'], destroyed: ['Знищено', 'Destroyed'], efficiency: ['Ефективність', 'Efficiency'],
  weighted_efficiency: ['Зважений KPI', 'Weighted KPI'], avg_flights_per_position: ['Вильотів на позицію за добу', 'Flights per position per day'],
}
const filterNames: Record<string, [string, string]> = {
  direction: ['Напрямок', 'Direction'], unit: ['Зона відповідальності', 'Responsibility zone'], category: ['Кафедра', 'Device type'],
  asset: ['Конкретний засіб', 'Asset'], group: ['Екіпаж', 'Crew'], bbak: ['ББАК', 'BBAK'], rota: ['Рота', 'Company'],
  battalion: ['Батальйон', 'Battalion'], purpose: ['Мета вильоту', 'Flight purpose'], class_name: ['Клас цілі', 'Target class'], result: ['Результат', 'Result'],
}

export function reportPeriodLabel(period: { dateFrom: string; dateTo: string; timeFrom?: string; timeTo?: string }): string {
  return period.dateFrom + (period.timeFrom ? ` ${period.timeFrom}` : '') + ' — ' + period.dateTo + (period.timeTo ? ` ${period.timeTo}` : '')
}

export function reportStatusLabel(status: ReportValueStatus | ReportDifferenceStatus, language: 'uk' | 'en' = 'uk'): string {
  const labels: Record<string, [string, string]> = {
    available: ['Є дані', 'Available'], unavailable: ['Немає даних', 'Unavailable'], zero_weight: ['Немає вильотів із додатною вагою', 'No positive-weight flights'],
    no_reference: ['Немає попередньої бази', 'No reference'], missing_value: ['Немає даних для різниці', 'Missing comparison value'], zero_reference: ['База дорівнює нулю; відносна зміна не визначена', 'Zero reference; relative change undefined'],
  }
  return labels[status]?.[language === 'uk' ? 0 : 1] || status
}

export function reportMetricTitle(metric: Pick<ReportMetric, 'label' | 'context'>): string {
  return metric.label + (metric.context ? ` · ${metric.context}` : '')
}

function referenceSelection(result: ComparisonResponse, selection: ComparisonSelection): ComparisonSelection | undefined {
  if (result.mode !== 'units_over_time') return result.selections.find(item => item.id === result.baseline_id)
  const periods = result.periods || []
  const index = periods.findIndex(period => period.id === selection.period_id)
  return index > 0 && selection.group_id ? result.selections.find(item => item.group_id === selection.group_id && item.period_id === periods[index - 1].id) : undefined
}

function totals(items: MetricBreakdownItem[]): { numerator: number | null; denominator: number | null } {
  if (!items.length || items.some(item => numeric(item.numerator) == null || numeric(item.denominator) == null)) return { numerator: null, denominator: null }
  return { numerator: items.reduce((total, item) => total + (item.numerator || 0), 0), denominator: items.reduce((total, item) => total + (item.denominator || 0), 0) }
}

function metricWeights(metric?: Metric): { numerator: number | null; denominator: number | null } {
  if (numeric(metric?.numerator) != null && numeric(metric?.denominator) != null) return { numerator: numeric(metric?.numerator), denominator: numeric(metric?.denominator) }
  return totals(metric?.breakdown || [])
}

export function buildComparisonReport(
  result: ComparisonResponse,
  context: ComparisonReportContext,
): ComparisonReport {
  const language = context.language || 'uk'
  const tr = (uk: string, en: string) => language === 'uk' ? uk : en
  const alias = (field: string, value: string, fallback?: string) => context.config.dictionaries.labels[field]?.[value] || fallback || value
  const label = (key: string, fallback: string) => context.config.filters.fields.find(field => field.key === key)?.label || fallback
  const displaySelection = (selection: ComparisonSelection) => result.mode === 'periods'
    ? selection.id === 'current' ? tr('Поточний період', 'Current period') : selection.id === 'previous' ? tr('Період порівняння', 'Reference period') : selection.label
    : alias(result.dimension, selection.filters[result.dimension]?.[0] || selection.label, selection.label)
  const selections: ReportSelection[] = result.selections.map(selection => {
    const period = result.periods?.find(item => item.id === selection.period_id)
    const reference = referenceSelection(result, selection)
    const filters = Object.entries(filterNames).flatMap(([key, names]) => {
      const rawValues = selection.filters[key as keyof FilterState]
      if (!Array.isArray(rawValues) || !rawValues.length) return []
      const choices = key === 'bbak' ? context.options?.bbak : key === 'battalion' ? context.options?.battalion : undefined
      return [{ key, label: label(key === context.config.filters.organization_dimension ? 'organization' : key, tr(...names)), rawValues: [...rawValues], labels: rawValues.map(value => alias(key, value, choices?.find(choice => String(choice.id) === value)?.title)) }]
    })
    const exactPeriod = { dateFrom: selection.filters.date_from, dateTo: selection.filters.date_to, timeFrom: selection.filters.time_from || '', timeTo: selection.filters.time_to || '' }
    return {
      id: selection.id, label: displaySelection(selection), rawLabel: selection.label, groupId: selection.group_id || '', periodId: selection.period_id || '',
      periodLabel: reportPeriodLabel(exactPeriod), ...exactPeriod,
      isPartial: !!period?.is_partial, isCurrent: !!period?.is_current, isFuture: !!period?.is_future,
      referenceId: reference?.id || '', referenceLabel: reference ? displaySelection(reference) : '',
      referencePeriod: reference ? reportPeriodLabel({ dateFrom: reference.filters.date_from, dateTo: reference.filters.date_to, timeFrom: reference.filters.time_from, timeTo: reference.filters.time_to }) : '',
      filters, rawFilters: structuredClone(selection.filters),
    }
  })
  const metricDefinitions = new Map<string, ReportMetric>()
  for (const selection of result.selections) for (const metric of selection.metrics) {
    const metricLabel = knownMetricLabels[metric.key]?.[language === 'uk' ? 0 : 1] || metric.label
    if (!metricDefinitions.has(metric.key)) metricDefinitions.set(metric.key, { id: metric.key, key: metric.key, label: metricLabel, context: metric.primary_label || '', secondary: false, unit: metric.unit || '' })
    if ((metric.secondary_label || metric.secondary_value != null) && !metricDefinitions.has(`${metric.key}:secondary`)) metricDefinitions.set(`${metric.key}:secondary`, { id: `${metric.key}:secondary`, key: metric.key, label: metricLabel, context: metric.secondary_label || tr('Додатковий показник', 'Additional metric'), secondary: true, unit: '' })
  }
  const rows: ReportRow[] = []
  for (const definition of metricDefinitions.values()) {
    if (!definition.unit && definition.context === 'ОС') definition.unit = tr('осіб', 'people')
    else if (!definition.unit && ['flights', 'effective', 'detected', 'affected', 'destroyed'].includes(definition.key)) definition.unit = tr('кількість', 'count')
    else if (!definition.unit && definition.key === 'avg_flights_per_position') definition.unit = tr('вильотів/позицію/добу', 'flights/position/day')
  }
  for (const definition of metricDefinitions.values()) {
    const metricBySelection = new Map(result.selections.map(selection => [selection.id, selection.metrics.find(metric => metric.key === definition.key)]))
    const paths = new Map<string, { keys: string[]; labels: string[]; items: Map<string, MetricBreakdownItem> }>()
    if (!definition.secondary) for (const selection of result.selections) {
      const visit = (items: MetricBreakdownItem[], keys: string[] = [], labels: string[] = []) => {
        for (const item of items) {
          const pathKeys = [...keys, item.key], pathLabels = [...labels, item.label], pathId = JSON.stringify(pathKeys)
          const entry = paths.get(pathId) || { keys: pathKeys, labels: pathLabels, items: new Map<string, MetricBreakdownItem>() }
          entry.items.set(selection.id, item); paths.set(pathId, entry)
          visit(item.children || [], pathKeys, pathLabels)
        }
      }
      visit(metricBySelection.get(selection.id)?.breakdown || [])
    }
    const append = (selection: ReportSelection, keys: string[], rawLabels: string[], item?: MetricBreakdownItem, referenceItem?: MetricBreakdownItem) => {
      const metric = metricBySelection.get(selection.id)
      const referenceMetric = metricBySelection.get(selection.referenceId)
      const value = numeric(keys.length ? item?.value : definition.secondary ? metric?.secondary_value : metric?.value)
      const referenceValue = numeric(keys.length ? referenceItem?.value : definition.secondary ? referenceMetric?.secondary_value : referenceMetric?.value)
      const weights = keys.length ? { numerator: numeric(item?.numerator), denominator: numeric(item?.denominator) } : definition.key === 'weighted_efficiency' ? metricWeights(metric) : { numerator: null, denominator: null }
      const refWeights = keys.length ? { denominator: numeric(referenceItem?.denominator) } : definition.key === 'weighted_efficiency' ? metricWeights(referenceMetric) : { denominator: null }
      const status = (v: number | null, denominator: number | null): ReportValueStatus => v != null ? 'available' : definition.key === 'weighted_efficiency' && denominator === 0 ? 'zero_weight' : 'unavailable'
      const pathLabels = rawLabels.map((value, index) => alias(index === 0 ? 'category' : 'purpose', value))
      const unit = (keys.length ? item?.unit || referenceItem?.unit || definition.unit : definition.unit) || ''
      const absoluteDifference = value != null && referenceValue != null ? value - referenceValue : null
      const differenceStatus: ReportDifferenceStatus = !selection.referenceId ? 'no_reference' : absoluteDifference == null ? 'missing_value' : referenceValue === 0 ? 'zero_reference' : 'available'
      rows.push({
        selectionId: selection.id, metricId: definition.id, metricKey: definition.key, metricLabel: definition.label, metricContext: definition.context,
        scope: keys.length === 0 ? definition.secondary ? 'secondary' : 'primary' : keys.length === 1 ? 'category' : keys.length === 2 ? 'purpose' : 'breakdown',
        depth: keys.length, pathKeys: [...keys], pathLabels, rawPathLabels: [...rawLabels], category: pathLabels[0] || '', purpose: pathLabels.slice(1).join(' → '),
        unit, value, valueStatus: status(value, weights.denominator), referenceId: selection.referenceId, referenceValue,
        referenceValueStatus: status(referenceValue, refWeights.denominator), absoluteDifference, differenceUnit: unit === '%' ? tr('в.п.', 'pp') : unit,
        relativeDifference: absoluteDifference != null && referenceValue !== 0 ? absoluteDifference / Math.abs(referenceValue!) * 100 : null,
        differenceStatus, numerator: weights.numerator, denominator: weights.denominator,
      })
    }
    for (const selection of selections) append(selection, [], [])
    for (const path of paths.values()) for (const selection of selections) append(selection, path.keys, path.labels, path.items.get(selection.id), path.items.get(selection.referenceId))
  }
  return {
    title: tr('Звіт порівняння', 'Comparison report'), createdAt: context.createdAt || new Date().toISOString(), language,
    source: result.source || '', sourceLabel: context.sourceLabel || result.source || tr('Не вказано', 'Not specified'),
    mode: result.mode, dimension: result.dimension, granularity: result.granularity || '',
    configurationRevision: result.configuration_revision ?? null, fingerprint: result.kpi_fingerprint || '',
    // Never substitute today's rules for the rules actually used by this response.
    kpiRules: result.kpi_configuration ? structuredClone(result.kpi_configuration.purpose_rules) : null,
    kpiFormula: tr('Зважений KPI = 100 × Σ(результативні вильоти × корисна дія / 100 × коефіцієнт) / Σ(усі вильоти × коефіцієнт).', 'Weighted KPI = 100 × Σ(successful flights × usefulness / 100 × coefficient) / Σ(all flights × coefficient).'),
    kpiDefaultRule: tr('Без окремого правила: результативність із джерела, корисна дія 100%, коефіцієнт 1. Коефіцієнт 0 виключає тільки внесок у зважений KPI. Якщо зважених вильотів немає, показник не визначено.', 'Without an individual rule: source success, 100% usefulness and coefficient 1. Coefficient 0 excludes only the weighted KPI contribution. With no weighted flights, the KPI is undefined.'),
    referenceExplanation: result.mode === 'units_over_time' ? tr('Попередній період того самого підрозділу; перший період не має бази.', 'Previous period of the same unit; the first period has no reference.') : tr('Визначена базова вибірка; рядки бази порівнюються самі із собою.', 'The designated reference selection; reference rows compare with themselves.'),
    notes: [
      tr('Експорт містить усі отримані показники та розрізи незалежно від видимих карток.', 'All received metrics and breakdowns are exported regardless of visible cards.'),
      tr('Відсоткові показники та середні не підсумовуються між періодами або вибірками.', 'Percentages and averages are not summed across periods or selections.'),
      tr('Батьківські рядки розрізів уже містять дочірні. Їх не можна складати разом.', 'Parent breakdown rows already include their children and must not be added together.'),
      tr('Порожнє значення означає недоступні дані; справжній нуль зберігається числом 0.', 'Blank values indicate unavailable data; actual zeros remain numeric zero.'),
      tr('Різниця відсотків подається у відсоткових пунктах; відносна зміна — окремо у %. За нульової бази вона не визначена.', 'Percentage differences use percentage points; relative changes use %. A zero reference has no defined relative change.'),
      tr('Поточні, часткові й майбутні періоди можуть мати неповні дані.', 'Current, partial and future periods may have incomplete data.'),
    ], periods: structuredClone(result.periods || []), selections, metrics: [...metricDefinitions.values()], rows,
  }
}
