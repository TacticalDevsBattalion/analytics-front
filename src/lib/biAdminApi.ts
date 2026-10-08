import { withApiBase } from '../config'
import { BiApiError } from './biApi'
import type { AnalyticsCatalog, AnalyticsHierarchy, AnalyticsMetadata, DashboardDefinition, MetricDefinition, MetricFormat, QueryFilter, QueryRequest, QueryResult, WidgetDefinition } from './biTypes'

export type BiEntity = 'dashboards' | 'widgets' | 'metrics' | 'kpis' | 'category_weights' | 'weight_sets' | 'roles' | 'user_access'
export type BiVersioned = { id: string; revision: number; created_at?: string | null; updated_at?: string | null }
export type BiMetric = MetricDefinition & BiVersioned & { numerator?: string | null; denominator?: string | null; category_field?: string; direction?: string; percentage_difference?: string; permissions?: string[]; is_active?: boolean }
export type BiKpi = BiVersioned & { key: string; title: string; description: string; metrics: Array<{ key: string }>; weights: Record<string, number>; formula: Record<string, unknown>; normalization: string; normalization_metric?: string | null; minimum?: number | null; maximum?: number | null; format: MetricFormat; direction: string; permissions: string[]; is_active: boolean }
export type BiWeight = BiVersioned & { weight_set_id?: string; category: string; weight: number; display_separately: boolean; include_in_weighted_total: boolean; include_in_general_total?: boolean; excluded_from_general_total: boolean }
export type BiWeightSet = BiVersioned & { key: string; title: string; description: string; is_active: boolean }
export type PolicyComponent = { key: string; label: string; metric_key: string | null; direction: 'positive' | 'negative'; weight: number; scale: number; normalization?: { min: number; max: number; direction?: string } | null; threshold?: { operator: string; value: number; else_value: number } | null; formula?: unknown; zone?: string | null }
export type PolicyRule = { id: string; version: number; name: string; active: boolean; valid_from: string; valid_to?: string | null; context: Record<string, string | undefined>; components: PolicyComponent[]; score_formula?: unknown }
export type PolicyRules = { rules: PolicyRule[]; builtin_metrics: Array<{ key: string; label: string }> }
export type PolicySimulation = { score: number | null; rule_set_id: string | null; rule_version: number | null; calculation_mode: string; components: Array<{ key: string; label: string; metric_key: string; raw_value: number | null; normalized_value: number | null; weight: number; scale: number; contribution: number | null; direction: string; zone?: string | null }> }
export type BiRole = BiVersioned & { key: string; title: string; permissions: string[] }
export type BiScope = { scope_type: 'ALL' | 'DEPARTMENT' | 'GROUP' | 'TEAM' | 'SELF' | 'CUSTOM' | 'NONE'; scope_ids: string[]; filters: QueryFilter[] }
export type BiUserAccess = BiVersioned & { user_id: string; role_ids: string[]; permissions: string[]; denied_permissions: string[]; data_scope: BiScope; comparison_precision: string }
export type BiUser = { id: string; username: string; display_name: string; role: string; active?: boolean; auth_provider?: string; [key: string]: unknown }
export type BiUsers = { users: BiUser[]; access: BiUserAccess[]; roles: BiRole[]; permissions: string[] }
export type CacheTarget = 'PERIOD' | 'CURRENT_PERIOD' | 'METRIC' | 'KPI' | 'DICTIONARY' | 'ALL'
export type CachePeriod = 'CURRENT_MONTH' | 'PREVIOUS_MONTH' | 'LAST_HORIZON' | 'CUSTOM'
export type CacheRange = { from: string; to: string }
export type CacheInvalidation = { target: CacheTarget; date_range?: CacheRange; key?: string }
export type CacheWarmRequest = { periods: CachePeriod[]; date_range?: CacheRange; metric_keys: string[] }
export type CacheJob = { id: string; status: string; completed_queries: number; total_queries: number; error_code?: string | null; request: CacheWarmRequest; created_at: string; updated_at: string; requested_by?: string | null }
export type CacheStatus = { cache: Record<string, boolean | number | string | null>; policy: { horizon_days: number; hot_days: number; warm_days: number; hot_ttl_seconds: number; warm_ttl_seconds: number; historical_ttl_seconds: number; raw_max_rows: number } }

async function request<T>(path: string, method = 'GET', body?: unknown, token?: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(withApiBase(`/api/v1${path}`), { method, credentials: 'include', signal, cache: 'no-store', headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { 'X-App-Admin-Token': token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('analytics-session-expired'))
    let detail: unknown
    try { detail = (await response.json() as { detail?: unknown }).detail } catch { detail = undefined }
    throw new BiApiError(typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(item => item?.msg ?? String(item)).join('; ') : `API ${response.status}`, response.status)
  }
  return response.json() as Promise<T>
}
export const biAdminApi = {
  list: <T>(entity: BiEntity, token?: string, signal?: AbortSignal) => request<T[]>(`/admin/bi/${entity}`, 'GET', undefined, token, signal),
  save: <T>(entity: BiEntity, value: T, token?: string) => request<T>(`/admin/bi/${entity}`, 'POST', value, token),
  remove: (entity: BiEntity, value: BiVersioned, token?: string) => request<{ deleted: boolean }>(`/admin/bi/${entity}/${encodeURIComponent(value.id)}?expected_revision=${value.revision}`, 'DELETE', undefined, token),
  users: (token?: string, signal?: AbortSignal) => request<BiUsers>('/admin/bi/users', 'GET', undefined, token, signal),
  metadata: (token?: string, signal?: AbortSignal) => request<AnalyticsMetadata>('/analytics/metadata', 'GET', undefined, token, signal),
  catalog: (token?: string, signal?: AbortSignal) => request<AnalyticsCatalog>('/analytics/catalog', 'GET', undefined, token, signal),
  hierarchy: (token?: string, signal?: AbortSignal) => request<AnalyticsHierarchy>('/analytics/hierarchy', 'GET', undefined, token, signal),
  query: (value: QueryRequest, token?: string, signal?: AbortSignal) => request<QueryResult>('/analytics/query', 'POST', value, token, signal),
  previewWidget: (body: { widget: WidgetDefinition; date_range: { from: string; to: string }; filters: QueryFilter[]; time_from?: string; time_to?: string }, token?: string) => request<QueryResult>('/analytics/widgets/preview', 'POST', body, token),
  batch: (queries: QueryRequest[], token?: string) => request<{ results: Array<{ status: 'success' | 'empty' | 'error'; data?: QueryResult; error?: { message?: string } }> }>('/analytics/query/batch', 'POST', { queries }, token),
  previewDefinition: (entity: 'metrics' | 'kpis', definition: BiMetric | BiKpi, query: QueryRequest, token?: string) => request<QueryResult>('/admin/bi/preview', 'POST', { entity, definition, query }, token),
  cacheStatus: (token?: string, signal?: AbortSignal) => request<CacheStatus>('/admin/cache/status', 'GET', undefined, token, signal),
  invalidateCache: (value: CacheInvalidation, token?: string) => request<{ target: CacheTarget; invalidated_entries?: number; affected_partitions?: number; generation_updates?: Record<string, number> }>('/admin/cache/invalidate', 'POST', value, token),
  warmCache: (value: CacheWarmRequest, token?: string) => request<CacheJob>('/admin/cache/warm', 'POST', value, token),
  cacheJob: (id: string, token?: string, signal?: AbortSignal) => request<CacheJob>(`/admin/cache/jobs/${encodeURIComponent(id)}`, 'GET', undefined, token, signal),
  catalogOptions: (range: { from: string; to: string }, token?: string, signal?: AbortSignal) => request<Record<string, AnalyticsCatalog['filters'][number]['values']>>('/analytics/catalog/options', 'POST', range, token, signal),
  policyRules: (token?: string, signal?: AbortSignal, history = false) => request<PolicyRules>(`/admin/kpi/rules${history ? '?include_versions=true' : ''}`, 'GET', undefined, token, signal),
  savePolicyRule: (rule: PolicyRule, token?: string) => request<PolicyRule>('/admin/kpi/rules', 'POST', rule, token),
  simulatePolicy: (body: { rule?: PolicyRule; context: { date: string; category?: string; purpose?: string; zones?: string[]; device_type?: string; bbak_id?: string; device?: string }; metrics: Record<string, number | null>; zone_metrics?: Record<string, Record<string, number | null>>; mode: 'CURRENT_RULE' | 'HISTORICAL_RULE' }, token?: string) => request<PolicySimulation>('/admin/kpi/simulate', 'POST', body, token),
}
export type { DashboardDefinition }
