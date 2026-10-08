import type { AppConfiguration } from '../config/appConfiguration'

type PurposeRule = AppConfiguration['kpi']['purpose_rules'][number]

export function normalizePurposeKpiValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/ß/g, 'ss').replace(/ς/g, 'σ')
}

export function uniquePurposeKpiValues(values: string[]): string[] {
  return [...new Map(values.map(value => [normalizePurposeKpiValue(value), value])).values()]
}

export function validatePurposeKpi(kpi: AppConfiguration['kpi']): string | null {
  const purposes = new Set<string>()
  if (kpi.purpose_rules.length > 500) return 'Можна налаштувати не більше 500 окремих мет вильоту.'
  for (const rule of kpi.purpose_rules) {
    if (!rule.purpose.trim()) return 'У кожного правила KPI має бути мета вильоту.'
    if (rule.purpose.trim().length > 256) return 'Назва мети вильоту має містити не більше 256 символів.'
    const normalizedPurpose = normalizePurposeKpiValue(rule.purpose)
    if (purposes.has(normalizedPurpose)) return `Для мети «${rule.purpose}» задано більше одного правила.`
    purposes.add(normalizedPurpose)
    if (!Number.isFinite(rule.usefulness_percent) || rule.usefulness_percent < 0 || rule.usefulness_percent > 100) return `Для мети «${rule.purpose}» частка корисної дії має бути числом від 0 до 100%.`
    if (!Number.isFinite(rule.coefficient) || rule.coefficient < 0 || rule.coefficient > 100) return `Для мети «${rule.purpose}» коефіцієнт має бути числом від 0 до 100.`
    if (!['source', 'results'].includes(rule.success_mode)) return `Для мети «${rule.purpose}» оберіть спосіб визначення успішного вильоту.`
    if (rule.success_mode === 'results' && (!rule.successful_results.length || rule.successful_results.some(value => !value.trim()))) return `Для мети «${rule.purpose}» оберіть хоча б один успішний результат.`
    if (rule.success_mode === 'source' && rule.successful_results.length) return `Для мети «${rule.purpose}» ознака джерела не потребує обраних результатів.`
    if (rule.successful_results.length > 500 || rule.successful_results.some(value => value.trim().length > 256)) return `Для мети «${rule.purpose}» можна обрати до 500 результатів, кожен до 256 символів.`
    if (new Set(rule.successful_results.map(normalizePurposeKpiValue)).size !== rule.successful_results.length) return `Для мети «${rule.purpose}» результати не повинні повторюватися.`
  }
  return null
}

export function purposeKpiSample(rule: PurposeRule, flights: number, successful: number) {
  if (![flights, successful, rule.usefulness_percent, rule.coefficient].every(Number.isFinite) || !Number.isInteger(flights) || !Number.isInteger(successful) || flights < 0 || successful < 0 || successful > flights) return null
  const points = successful * rule.usefulness_percent / 100 * rule.coefficient
  const capacity = flights * rule.coefficient
  return { points, capacity, value: capacity > 0 ? 100 * points / capacity : null }
}
