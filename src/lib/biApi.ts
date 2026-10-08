import { withApiBase } from '../config'
import type { AnalyticsComparison, AnalyticsComparisonRequest, AnalyticsHierarchy, AnalyticsMetadata, DashboardDefinition, DashboardOverrides, DashboardQueryResult, DashboardType, DateRange, QueryFilter, QueryResult, WidgetDefinition } from './biTypes'
import type { AnalyticsCatalog, PersonalAppearance, PersonalDashboard } from './biTypes'
import { personalAppearancePayload } from './semanticCatalog'
import type { PersonalDashboardPreferences } from './dashboardPreferences'
import { withApiBase as apiBase } from '../config'

export class BiApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'BiApiError' }
}
export async function biRequest<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(withApiBase(`/api/v1/analytics${path}`), {
    method, credentials: 'include', signal, cache: 'no-store',
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('analytics-session-expired'))
    let detail: unknown
    try { detail = (await response.json() as { detail?: unknown }).detail } catch { detail = undefined }
    const message = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(item => typeof item === 'object' && item && 'msg' in item ? String(item.msg) : String(item)).join('; ') : `API ${response.status}`
    throw new BiApiError(message, response.status)
  }
  return response.json() as Promise<T>
}
export const biApi = {
  catalog: (signal?: AbortSignal) => biRequest<AnalyticsCatalog>('/catalog', 'GET', undefined, signal),
  catalogOptions: (range: DateRange, signal?: AbortSignal) => biRequest<Record<string, AnalyticsCatalog['filters'][number]['values']> & { options?: Record<string, AnalyticsCatalog['filters'][number]['values']> }>('/catalog/options', 'POST', range, signal),
  previewWidget: (body: { widget: WidgetDefinition; date_range: DateRange; filters: QueryFilter[]; time_from?: string; time_to?: string }) => biRequest<QueryResult>('/widgets/preview', 'POST', body),
  page: (page: 'dashboard' | 'statistics', signal?: AbortSignal) => biRequest<DashboardDefinition>(`/pages/${page}`, 'GET', undefined, signal),
  savePage: (page: 'dashboard' | 'statistics', definition: DashboardDefinition) => biRequest<DashboardDefinition>(`/pages/${page}`, 'PUT', definition),
  pageQuery: (page: 'dashboard' | 'statistics', request: { date_range: DateRange; filters: QueryFilter[]; time_from?: string; time_to?: string }, signal?: AbortSignal) => biRequest<DashboardQueryResult>(`/pages/${page}/query`, 'POST', request, signal),
  personalDashboard: (signal?: AbortSignal) => biRequest<PersonalDashboard>('/personal-dashboard', 'GET', undefined, signal),
  savePersonalDashboard: (body: { expected_revision: number; appearance?: PersonalAppearance; overrides?: DashboardOverrides['overrides']; hidden_widget_ids?: string[] }) => biRequest<PersonalDashboard>('/personal-dashboard', 'PUT', { ...body, ...(body.appearance ? { appearance: personalAppearancePayload(body.appearance) } : {}) }),
  migratePersonalDashboard: (body: { legacy_preferences?: PersonalDashboardPreferences | null; saved_views?: Array<{ id: string; name: string; filters: unknown; target: string }> }) => biRequest<PersonalDashboard>('/personal-dashboard/migrate', 'POST', body),
  personalWidget: (widget: WidgetDefinition) => biRequest<WidgetDefinition>('/personal-dashboard/widgets', 'POST', widget),
  removePersonalWidget: (widget: WidgetDefinition) => biRequest<{ deleted: boolean }>(`/personal-dashboard/widgets/${encodeURIComponent(widget.id)}?expected_revision=${widget.revision ?? 0}`, 'DELETE'),
  personalQuery: (request: { date_range: DateRange; filters: QueryFilter[]; time_from?: string; time_to?: string }, signal?: AbortSignal) => biRequest<DashboardQueryResult>('/personal-dashboard/query', 'POST', request, signal),
  uploadPersonalAsset: async (file: File) => {
    const response = await fetch(apiBase('/api/v1/analytics/personal-dashboard/assets'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type }, body: file })
    if (!response.ok) { if (response.status === 401) window.dispatchEvent(new Event('analytics-session-expired')); let detail: unknown; try { detail = (await response.json() as { detail?: unknown }).detail } catch { detail = undefined }; throw new BiApiError(typeof detail === 'string' ? detail : `API ${response.status}`, response.status) }
    return response.json() as Promise<{ asset_id: string; url: string }>
  },
  metadata: (signal?: AbortSignal) => biRequest<AnalyticsMetadata>('/metadata', 'GET', undefined, signal),
  hierarchy: (signal?: AbortSignal) => biRequest<AnalyticsHierarchy>('/hierarchy', 'GET', undefined, signal),
  dashboards: (type: DashboardType, signal?: AbortSignal) => biRequest<DashboardDefinition[]>(`/dashboards?type=${encodeURIComponent(type)}`, 'GET', undefined, signal),
  comparison: (request: AnalyticsComparisonRequest, signal?: AbortSignal) => biRequest<AnalyticsComparison>('/comparison', 'POST', request, signal),
}
