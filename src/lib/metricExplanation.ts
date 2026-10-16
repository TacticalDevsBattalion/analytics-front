// Plain-language explanation generated from a metric definition, so the text
// always matches the actual calculation, including administrator-made metrics.

export type ExplainableMetric = {
  key: string
  title?: string
  source?: string
  aggregation?: string
  field?: string | null
  filters?: Array<{ field: string; operator: string; value?: unknown }>
  numerator?: string | null
  denominator?: string | null
  formula?: unknown
  normalization?: string | null
  normalization_metric?: string | null
  category_mode?: string | null
  category_field?: string | null
  format?: { type?: string }
  direction?: string
}

export type MetricExplanation = {
  // What is calculated, as one sentence.
  calculation: string
  // Rate metrics are comparable between units of different size; counts are not.
  kind: 'rate' | 'count'
  direction: string
}

const SOURCES: Record<string, string> = { flights: 'вильотів', events: 'записів результатів', ammunition: 'записів таблиці БК', lost_devices: 'записів втрат засобів' }
const SOURCE_TABLES: Record<string, string> = { flights: 'вильотах', events: 'записах результатів', ammunition: 'таблиці БК', lost_devices: 'таблиці втрат засобів' }
const DISTINCT: Record<string, string> = { flight_id: 'вильотів', target_id: 'цілей', crew: 'екіпажів', team_id: 'екіпажів', department_id: 'ББАК', bbak_id: 'ББАК', date: 'днів' }
const FIELDS: Record<string, string> = {
  bc_count: '«кількість»', field_300: '«300»', field_200: '«200»', mission_successful: 'успішність місії', is_effective: 'результативність', norm_result: 'результат',
  result: 'результат', norm_bc_name: 'назва БК', bc_name: 'назва БК', is_personnel: 'особовий склад', target_class: 'клас цілі', category: 'кафедра', device_type: 'кафедра',
  purpose: 'мета вильоту', main_purpose: 'мета вильоту', direction: 'напрямок', units: 'зона відповідальності',
}
const OPERATORS: Record<string, string> = { eq: '=', neq: '≠', in: 'одне з', not_in: 'не одне з', gt: '>', gte: '≥', lt: '<', lte: '≤', contains: 'містить', not_contains: 'не містить', between: 'між' }
const AGGREGATES: Record<string, string> = { SUM: 'Сума', AVG: 'Середнє', MIN: 'Мінімум', MAX: 'Максимум' }
const RATE_AGGREGATIONS = new Set(['RATIO', 'AVG'])
const RATE_NORMALIZATIONS = new Set(['PER_OPERATION', 'PER_100_OPERATIONS', 'PERCENT_OF_TOTAL', 'RATIO', 'MIN_MAX'])

export const AGGREGATION_LABELS: Record<string, string> = {
  COUNT: 'Кількість записів', COUNT_DISTINCT: 'Кількість унікальних значень', SUM: 'Сума поля', AVG: 'Середнє поля', MIN: 'Мінімум поля', MAX: 'Максимум поля',
  RATIO: 'Співвідношення двох метрик', FORMULA: 'Формула з метрик', WEIGHTED_SUM: 'Зважена сума категорій',
}
export const DIRECTION_LABELS: Record<string, string> = { HIGHER_IS_BETTER: 'Краще більше', LOWER_IS_BETTER: 'Краще менше', NEUTRAL: 'Без оцінки (довідковий)' }
export const SOURCE_LABELS: Record<string, string> = { flights: 'Вильоти', events: 'Результати по цілях', ammunition: 'Таблиця БК', lost_devices: 'Втрати засобів' }
export const FORMAT_LABELS: Record<string, string> = { number: 'Число', percent: 'Відсоток', currency: 'Грошова сума', duration: 'Тривалість' }

const fieldLabel = (field: string) => FIELDS[field] ?? `«${field}»`
const valueLabel = (value: unknown): string => Array.isArray(value) ? value.map(valueLabel).join(', ') : value === true ? 'так' : value === false ? 'ні' : `«${String(value)}»`

function filterText(filter: { field: string; operator: string; value?: unknown }) {
  if (filter.field === 'mission_successful' && filter.operator === 'eq') return filter.value === false ? 'місію не позначено успішною' : 'місію позначено успішною'
  if (filter.field === 'is_personnel' && filter.operator === 'eq') return filter.value === false ? 'ціль — не особовий склад' : 'ціль — особовий склад'
  if (filter.operator === 'is_null') return `${fieldLabel(filter.field)} не заповнено`
  if (filter.operator === 'is_not_null') return `${fieldLabel(filter.field)} заповнено`
  return `${fieldLabel(filter.field)} ${OPERATORS[filter.operator] ?? filter.operator} ${valueLabel(filter.value)}`
}

function formulaText(node: unknown, title: (key: string) => string, nested = false): string {
  if (!node || typeof node !== 'object') return String(node)
  const item = node as { op?: string; args?: unknown[]; metric?: string; value?: unknown }
  if (item.metric) return title(item.metric)
  if (item.op == null) return String(item.value ?? '')
  const args = (item.args ?? []).map(arg => formulaText(arg, title, true))
  const infix: Record<string, string> = { add: ' + ', sub: ' − ', mul: ' × ', div: ' ÷ ' }
  if (infix[item.op]) { const text = args.join(infix[item.op]); return nested ? `(${text})` : text }
  const names: Record<string, string> = { min: 'мінімум', max: 'максимум', abs: 'модуль', neg: 'мінус', coalesce: 'перше наявне з', clamp: 'обмежити', normalize: 'нормувати' }
  return `${names[item.op] ?? item.op}(${args.join('; ')})`
}

export function isRateDefinition(metric: Pick<ExplainableMetric, 'aggregation' | 'normalization' | 'format'>) {
  return metric.format?.type === 'percent' || RATE_AGGREGATIONS.has(String(metric.aggregation)) || RATE_NORMALIZATIONS.has(String(metric.normalization))
}

export function explainMetric(metric: ExplainableMetric, catalog: ExplainableMetric[] = []): MetricExplanation {
  const title = (key: string) => `«${catalog.find(item => item.key === key)?.title || key}»`
  const source = metric.source || 'flights'
  const percent = metric.format?.type === 'percent'
  let calculation: string
  switch (metric.aggregation) {
    case 'COUNT': calculation = `Кількість ${SOURCES[source] ?? `записів «${source}»`}`; break
    case 'COUNT_DISTINCT': calculation = `Кількість унікальних ${metric.field ? DISTINCT[metric.field] ?? `значень ${fieldLabel(metric.field)}` : 'значень'}${source !== 'flights' || metric.field !== 'flight_id' ? ` у ${SOURCE_TABLES[source] ?? source}` : ''}`; break
    case 'SUM': case 'AVG': case 'MIN': case 'MAX': calculation = `${AGGREGATES[metric.aggregation]} поля ${metric.field ? fieldLabel(metric.field) : '—'} у ${SOURCE_TABLES[source] ?? source}`; break
    case 'RATIO': calculation = `${metric.numerator ? title(metric.numerator) : '?'} ÷ ${metric.denominator ? title(metric.denominator) : '?'}${percent ? ' × 100%' : ''}`; break
    case 'FORMULA': calculation = formulaText(metric.formula, title); break
    case 'WEIGHTED_SUM': calculation = `Сума ваг за категоріями (${fieldLabel(metric.category_field || 'category')}) у ${SOURCE_TABLES[source] ?? source}`; break
    default: calculation = metric.aggregation ? AGGREGATION_LABELS[metric.aggregation] ?? metric.aggregation : 'Обчислення не задано'
  }
  const conditions = metric.aggregation === 'RATIO' || metric.aggregation === 'FORMULA' ? [] : (metric.filters ?? []).map(filterText)
  if (conditions.length) calculation += `, де ${conditions.join(' і ')}`
  if (metric.aggregation === 'FORMULA' && metric.normalization && metric.normalization !== 'NONE') {
    const by = metric.normalization_metric ? title(metric.normalization_metric) : '?'
    calculation += metric.normalization === 'PER_100_OPERATIONS' ? `, на 100 одиниць ${by}` : metric.normalization === 'PERCENT_OF_TOTAL' ? `, у % від ${by}` : metric.normalization === 'MIN_MAX' ? ', нормовано до 0–1' : `, ÷ ${by}`
  }
  if (metric.category_mode === 'GENERAL') calculation += ' (без категорій, які показуються окремо, напр. особового складу)'
  if (metric.category_mode === 'SEPARATE') calculation += ' (лише категорії, які показуються окремо)'
  return { calculation: calculation + '.', kind: isRateDefinition(metric) ? 'rate' : 'count', direction: DIRECTION_LABELS[metric.direction ?? 'NEUTRAL'] ?? metric.direction ?? '' }
}
