// An administrator can open the application with another user's access, read-only.
// The choice lives in this tab only; every API request then carries the header.
const KEY = 'analytics.view_as'
export const VIEW_AS_HEADER = 'X-Analytics-View-As'
export type ViewAs = { id: string; name: string }

export function readViewAs(): ViewAs | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
    return value && typeof value === 'object' && typeof (value as ViewAs).id === 'string' ? value as ViewAs : null
  } catch { return null }
}

export function startViewAs(value: ViewAs) {
  try { sessionStorage.setItem(KEY, JSON.stringify(value)) } catch { /* storage may be blocked */ }
  window.location.hash = '#dashboard'
  window.location.reload()
}

export function stopViewAs() {
  try { sessionStorage.removeItem(KEY) } catch { /* storage may be blocked */ }
  window.location.hash = '#administration'
  window.location.reload()
}

/** Adds the header to this application's API requests while viewing as someone else. */
export function installViewAs(apiPrefix: string) {
  const viewAs = readViewAs()
  if (!viewAs) return
  const original = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const path = url.startsWith(window.location.origin) ? url.slice(window.location.origin.length) : url
    if (!path.startsWith(apiPrefix) || path.includes('/auth/')) return original(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set(VIEW_AS_HEADER, viewAs.id)
    return original(input, { ...init, headers })
  }
}
