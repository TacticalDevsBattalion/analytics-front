import { withApiBase } from '../config'
import type { AdministrationConfiguration, AppConfiguration, PublicAppConfiguration } from '../config/appConfiguration'

async function request<T>(path: string, token?: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(withApiBase('/api/'+path), {
    method: method ?? (body === undefined ? 'GET' : 'POST'), cache: 'no-store', credentials: 'include',
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { 'X-App-Admin-Token': token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    let detail: unknown
    try { detail = (await response.json()).detail } catch { detail = undefined }
    const readable = Array.isArray(detail) ? detail.map(item => item.msg ?? '').join('; ') : typeof detail === 'string' ? detail : ''
    if (response.status === 403 || response.status === 401) {
      if (!token) window.dispatchEvent(new Event('analytics-session-expired'))
      throw new Error(token ? 'Ключ адміністратора не підходить. Перевірте його й увійдіть ще раз.' : 'Адміністративний доступ завершено. Увійдіть до облікового запису адміністратора ще раз.')
    }
    if (response.status === 409) throw new Error('Налаштування вже змінилися в іншому вікні. Оновіть версію перед збереженням.')
    throw new Error(readable || `Не вдалося виконати запит (${response.status}).`)
  }
  return response.json() as Promise<T>
}

export const configurationApi = {
  filterColumns: (token: string) => request<{ columns: { column: string; field: string }[] }>('admin/filter-columns', token),
  public: () => request<PublicAppConfiguration>('app-configuration'),
  status: (token: string) => request<AdministrationConfiguration>('admin/app-configuration', token),
  saveDraft: (token: string, body: { config: AppConfiguration; base_revision: number; expected_draft_version: number }) => request<AdministrationConfiguration>('admin/app-configuration/draft', token, body, 'PUT'),
  preview: (token: string, body: { config: AppConfiguration; base_revision: number }) => request<{ valid: boolean; revision: number; config: AppConfiguration }>('admin/app-configuration/preview', token, body),
  publish: (token: string, body: { base_revision: number; expected_draft_version: number }) => request<AdministrationConfiguration>('admin/app-configuration/publish', token, body),
  rollback: (token: string, body: { target_revision: number; base_revision: number }) => request<AdministrationConfiguration>('admin/app-configuration/rollback', token, body),
}
