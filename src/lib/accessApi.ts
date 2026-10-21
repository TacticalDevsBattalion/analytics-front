import { withApiBase } from '../config'
import { BiApiError } from './biApi'

export type AccessProfile = 'company' | 'battalion' | 'command' | 'admin'
export type AccessUser = {
  id: string; username: string; display_name: string; role: string; active: boolean; created_at: string
  status: 'pending' | 'assigned' | 'custom'; profile: AccessProfile | null
  battalion_id: string | null; company_id: string | null; battalion: string | null; company: string | null
  coordinates: boolean; revision: number; summary: string
}
export type AccessList = {
  profiles: Array<{ id: AccessProfile; title: string }>
  battalions: Array<{ id: string; title: string }>
  companies: Array<{ id: string; title: string; department_id: string }>
  users: AccessUser[]
}
export type AccessAssignment = { profile: AccessProfile; battalion_id: string | null; company_id: string | null; coordinates: boolean }
export type AccessAuditEntry = { changed_at: string; actor: string | null; before: (AccessAssignment & { revision: number }) | null; after: AccessAssignment & { revision: number } }

export async function v1Request<T>(path: string, method = 'GET', body?: unknown, token?: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(withApiBase(`/api/v1${path}`), { method, credentials: 'include', signal, cache: 'no-store', headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { 'X-App-Admin-Token': token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('analytics-session-expired'))
    let detail: unknown
    try { detail = (await response.json() as { detail?: unknown }).detail } catch { detail = undefined }
    throw new BiApiError(typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(item => item?.msg ?? String(item)).join('; ') : `API ${response.status}`, response.status)
  }
  return response.json() as Promise<T>
}

export const accessApi = {
  list: (token?: string, signal?: AbortSignal) => v1Request<AccessList>('/admin/access', 'GET', undefined, token, signal),
  assign: (userId: string, body: AccessAssignment & { expected_revision: number | null }, token?: string) => v1Request<AccessUser>(`/admin/access/${encodeURIComponent(userId)}`, 'PUT', body, token),
  assignMany: (body: AccessAssignment & { user_ids: string[] }, token?: string) => v1Request<{ users: AccessUser[]; errors: Array<{ user_id: string; error: string }> }>('/admin/access', 'PUT', body, token),
  audit: (userId: string, token?: string, signal?: AbortSignal) => v1Request<AccessAuditEntry[]>(`/admin/access/${encodeURIComponent(userId)}/audit`, 'GET', undefined, token, signal),
}
