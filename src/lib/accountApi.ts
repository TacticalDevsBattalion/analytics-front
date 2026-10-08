import { withApiBase } from '../config'
import type { PersonalDashboardPreferences } from './dashboardPreferences'

export type AppUser = { id: string; username: string; display_name: string; role: 'administrator' | 'viewer' }
export type ManagedUser = AppUser & { active: boolean; created_at: string }
export type AuthSession = { enabled: boolean; user: AppUser | null }
export type DashboardSnapshot = { revision: number; preferences: PersonalDashboardPreferences | null }
export class AccountApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'AccountApiError' }
}
const accountMessages: Record<string, string> = {
  'The first account must be an administrator': 'Перший обліковий запис має бути адміністратором.',
  'This username is already in use': 'Такий логін уже використовується.',
  'The last active administrator cannot be disabled or demoted': 'Останнього активного адміністратора не можна вимкнути або змінити його роль.',
  'Personal dashboard settings changed elsewhere; reload before saving': 'Дашборд уже змінено в іншому вікні. Завантажте збережену версію перед збереженням.',
  'Account was not found': 'Обліковий запис не знайдено.',
  'Account storage is temporarily unavailable': 'Сховище облікових записів тимчасово недоступне. Спробуйте ще раз.',
  'Request origin is not allowed': 'Не вдалося підтвердити джерело запиту. Оновіть сторінку й спробуйте ще раз.',
  'Administrator authentication is required': 'Для цієї дії потрібен обліковий запис адміністратора.',
}
function readableAccountMessage(message: string) {
  if (accountMessages[message]) return accountMessages[message]
  if (message.includes('Password must contain 12–128 characters')) return 'Пароль має містити від 12 до 128 символів.'
  if (message.includes('Username must contain 3–64')) return 'Логін має містити 3–64 символи: латинські літери, цифри, крапку, дефіс або підкреслення.'
  return message
}
async function request<T>(path: string, method = 'GET', body?: unknown, token?: string, expectedUserId?: string): Promise<T> {
  const response = await fetch(withApiBase('/api/' + path), {
    method, credentials: 'include', cache: 'no-store',
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { 'X-App-Admin-Token': token } : {}), ...(expectedUserId ? { 'X-Analytics-User-Id': expectedUserId } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    let detail: unknown
    try { detail = (await response.json()).detail } catch { detail = undefined }
    const message = Array.isArray(detail) ? detail.map(item => readableAccountMessage(item?.msg || '')).join('; ') : typeof detail === 'string' ? readableAccountMessage(detail) : ''
    if (response.status === 401 && path !== 'auth/login') window.dispatchEvent(new Event('analytics-session-expired'))
    const fallback = response.status === 401 ? path === 'auth/login' ? 'Перевірте логін і пароль.' : 'Сесію завершено або обліковий запис змінився. Увійдіть ще раз.' : response.status === 403 ? 'Недостатньо прав для цієї дії.' : response.status === 409 ? 'Дані вже змінено. Оновіть їх перед збереженням.' : response.status === 429 ? 'Забагато спроб входу. Спробуйте пізніше.' : 'Не вдалося виконати запит. Спробуйте ще раз.'
    throw new AccountApiError(response.status === 401 || response.status === 429 ? fallback : message || fallback, response.status)
  }
  return response.json() as Promise<T>
}
export const accountApi = {
  session: () => request<AuthSession>('auth/session'),
  login: (username: string, password: string) => request<AuthSession>('auth/login', 'POST', { username, password }),
  logout: () => request<AuthSession>('auth/logout', 'POST'),
  dashboard: (expectedUserId: string) => request<DashboardSnapshot>('me/dashboard', 'GET', undefined, undefined, expectedUserId),
  users: (token?: string) => request<{ users: ManagedUser[] }>('admin/users', 'GET', undefined, token),
  createUser: (body: { username: string; display_name: string; password: string; role: AppUser['role'] }, token?: string) => request<ManagedUser>('admin/users', 'POST', body, token),
  updateUser: (id: string, body: { display_name?: string; password?: string; role?: AppUser['role']; active?: boolean }, token?: string) => request<ManagedUser>('admin/users/' + encodeURIComponent(id), 'PATCH', body, token),
}
