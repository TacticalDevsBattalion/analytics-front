import { getFrontendConfig, withApiBase, type FrontendApiConfig } from '../config'
import type { ComparisonRequest, ComparisonResponse, EventRow, FilterOptions, FilterState, GeoFeatureCollection, KpiOptions, KpiPreview, Metric, SourceStatus, TimelinePoint } from './types'
import type { KpiConfiguration } from '../config/appConfiguration'

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('analytics-session-expired'))
    let detail = ''
    try {
      const payload = await res.json() as { detail?: unknown }
      detail = Array.isArray(payload.detail)
        ? payload.detail.map(item => item && typeof item === 'object' && 'msg' in item ? String(item.msg) : String(item)).join('; ')
        : payload?.detail == null ? '' : String(payload.detail)
    } catch {
      try { detail = await res.text() } catch { detail = '' }
    }
    throw new Error(detail ? `API ${res.status}: ${detail}` : `API ${res.status}`)
  }
  return res.json() as Promise<T>
}

const endpoint = (key: keyof FrontendApiConfig['endpoints']) =>
  withApiBase(getFrontendConfig().api.endpoints[key])

export const api = {
  sourceStatus: () => json<SourceStatus>(endpoint('source_status')),
  options: () => json<FilterOptions>(endpoint('filter_options')),
  overview: (filters: FilterState) => json<Metric[]>(endpoint('overview'), { method: 'POST', body: JSON.stringify(filters) }),
  comparison: (request: ComparisonRequest, signal?: AbortSignal) => json<ComparisonResponse>(endpoint('comparison'), { method: 'POST', body: JSON.stringify(request), signal }),
  timeline: (filters: FilterState) => json<TimelinePoint[]>(endpoint('timeline'), { method: 'POST', body: JSON.stringify(filters) }),
  events: (filters: FilterState) => json<EventRow[]>(endpoint('events'), { method: 'POST', body: JSON.stringify(filters) }),
  map: (filters: FilterState) => json<GeoFeatureCollection>(endpoint('map'), { method: 'POST', body: JSON.stringify(filters) }),
  kpiOptions: () => json<KpiOptions>(withApiBase('/api/analytics/kpi-options')),
  kpiPreview: (request: { filters: FilterState; kpi: KpiConfiguration }, signal?: AbortSignal) => json<KpiPreview>(withApiBase('/api/analytics/kpi-preview'), { method: 'POST', body: JSON.stringify(request), signal }),
}
