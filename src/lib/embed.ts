// K2 Workspace module contract (kk-workspace docs/modules.md): the Workspace opens this
// application in an iframe under its own header. Embedded mode is on only when the page is
// framed AND the frame's first load had ?k2-embed=1 (kept in the frame tab's sessionStorage,
// since later addresses of the application go without it). Standalone nothing changes.

export const EMBED_PARAM = 'k2-embed'
/** The Workspace origins of both environments; messages go to each by its exact origin, never '*'. */
export const DEFAULT_WORKSPACE_ORIGINS = ['https://workspace.kub.k2.lan', 'https://workspace.arckos.net']
const FLAG_KEY = 'analytics-k2-embed'
const ROUTE_KEY = 'analytics-k2-embed-route'
const NEED_LOGIN_KEY = 'analytics-k2-embed-need-login'
/** A second automatic «need login» this soon means the sign-in did not stick: stop and wait for a click. */
export const NEED_LOGIN_PAUSE_MS = 30000

type EmbedWindow = Pick<Window, 'location' | 'history' | 'sessionStorage' | 'parent' | 'top' | 'self'>

let embedded = false
let origins: readonly string[] = DEFAULT_WORKSPACE_ORIGINS
let host: EmbedWindow | null = null

export function inFrame(win: EmbedWindow): boolean {
  try { return win.top !== win.self } catch { return true }
}

function storage(win: EmbedWindow): Storage | null {
  try { return win.sessionStorage } catch { return null }
}

/** Call once before the application renders. Returns whether embedded mode is on. */
export function initEmbed(win: EmbedWindow, workspaceOrigins: readonly string[] = DEFAULT_WORKSPACE_ORIGINS): boolean {
  host = win
  origins = workspaceOrigins.filter(origin => /^https:\/\/[^/?#\s]+$/.test(origin))
  embedded = false
  if (!inFrame(win)) return false
  const url = new URL(win.location.href)
  const asked = url.searchParams.get(EMBED_PARAM) === '1'
  const store = storage(win)
  try {
    if (asked) store?.setItem(FLAG_KEY, '1')
    embedded = asked || store?.getItem(FLAG_KEY) === '1'
  } catch { embedded = asked }
  if (!embedded) return false
  if (asked) {
    url.searchParams.delete(EMBED_PARAM)
    win.history.replaceState(win.history.state, '', url.href)
  }
  // Back from the silent sign-in (it returns to the application's root): reopen the page it left.
  try {
    const route = store?.getItem(ROUTE_KEY)
    store?.removeItem(ROUTE_KEY)
    if (route && route.startsWith('#') && !win.location.hash) win.history.replaceState(win.history.state, '', route)
  } catch { /* storage may be blocked */ }
  return true
}

export function isEmbedded(): boolean {
  return embedded
}

/** pathname + search + hash, without k2-embed: the module's address the Workspace mirrors. */
export function routePath(href: string): string {
  const url = new URL(href)
  url.searchParams.delete(EMBED_PARAM)
  return url.pathname + url.search + url.hash
}

function post(message: Record<string, unknown>) {
  if (!embedded || !host) return
  for (const origin of origins) {
    try { host.parent.postMessage(message, origin) } catch { /* a closed parent */ }
  }
}

export function notifyReady(title?: string) {
  post({ type: 'k2:ready', ...(title ? { title } : {}) })
}

export function notifyRoute(title?: string) {
  if (!host) return
  post({ type: 'k2:route', path: routePath(host.location.href), ...(title ? { title } : {}) })
}

/** Before the silent sign-in: the page to reopen after it. */
export function rememberRoute() {
  if (!embedded || !host) return
  try { if (host.location.hash) storage(host)?.setItem(ROUTE_KEY, host.location.hash) } catch { /* storage may be blocked */ }
}

/** The silent sign-in was refused: the Workspace takes the whole tab to the interactive login.
 *  `automatic` asks are paused after one, so a session that does not stick never loops the tab. */
export function requestLogin(login: string, automatic: boolean, now = Date.now()): boolean {
  if (!embedded || !host) return false
  const store = storage(host)
  if (automatic) {
    try {
      if (now - Number(store?.getItem(NEED_LOGIN_KEY) || 0) < NEED_LOGIN_PAUSE_MS) return false
    } catch { return false }
  }
  try { store?.setItem(NEED_LOGIN_KEY, String(now)) } catch { /* storage may be blocked */ }
  post({ type: 'k2:need-login', login })
  return true
}
