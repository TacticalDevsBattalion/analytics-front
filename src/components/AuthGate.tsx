import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { KeyRound, RefreshCcw, X } from 'lucide-react'
import { useAuth } from '../config/AuthContext'
import { useAppConfiguration } from '../config/AppConfigurationContext'
import { useLanguage } from '../i18n/LanguageContext'
import { useQuery } from '@tanstack/react-query'
import { withApiBase } from '../config'
import { AccountApiError } from '../lib/accountApi'
import './Accounts.css'

// The Keycloak callback reports failures as ?auth_error=…; read it once and clean the address.
function takeProviderError() {
  const url = new URL(window.location.href)
  const reason = url.searchParams.get('auth_error')
  if (reason === null) return ''
  url.searchParams.delete('auth_error')
  window.history.replaceState(window.history.state, '', url)
  return reason
}

// After a password change on Keycloak's page the callback adds ?auth_notice=password_updated.
function takeProviderNotice() {
  const url = new URL(window.location.href)
  const notice = url.searchParams.get('auth_notice')
  if (notice === null) return ''
  url.searchParams.delete('auth_notice')
  window.history.replaceState(window.history.state, '', url)
  return notice
}

export function useAuthProvider() {
  const { tr } = useLanguage()
  return useQuery({ queryKey: ['authentication-provider'], queryFn: async () => {
    const response = await fetch(withApiBase('/api/auth/provider'), { credentials: 'include', cache: 'no-store' })
    if (!response.ok) throw new Error(tr('Не вдалося визначити спосіб входу.', 'Could not load the sign-in provider.'))
    return response.json() as Promise<{provider: 'local' | 'keycloak' | 'k2auth'; login_url: string | null; password_login?: boolean}>
  }, retry: false, staleTime: Infinity })
}

/** Keycloak's own page: finishes account setup, or with an action changes the password. */
export function keycloakPageUrl(options: { action?: 'password'; username?: string } = {}) {
  const query = new URLSearchParams()
  if (options.action) query.set('action', options.action)
  if (options.username) query.set('login_hint', options.username)
  const search = query.toString()
  return withApiBase('/api/auth/keycloak/login' + (search ? '?' + search : ''))
}

function PasswordUpdatedNotice() {
  const { tr } = useLanguage()
  const [notice, setNotice] = useState(takeProviderNotice)
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 8000)
    return () => window.clearTimeout(timer)
  }, [notice])
  if (notice !== 'password_updated') return null
  return <div className="account-notice" role="status"><span>{tr('Пароль змінено.', 'Your password has been changed.')}</span><button type="button" aria-label={tr('Закрити', 'Close')} onClick={() => setNotice('')}><X size={16} /></button></div>
}

// K2 Auth: the sign-in page leaves for the shared K2 login at once. A second automatic
// trip within a short time means the session did not stick: stop and show the button.
const K2_REDIRECT_KEY = 'analytics-k2auth-redirect'
const K2_REDIRECT_PAUSE_MS = 30000
function mayRedirectToK2Auth() {
  try {
    const last = Number(sessionStorage.getItem(K2_REDIRECT_KEY) || 0)
    if (Date.now() - last < K2_REDIRECT_PAUSE_MS) return false
    sessionStorage.setItem(K2_REDIRECT_KEY, String(Date.now()))
    return true
  } catch { return false }
}

function K2AuthEntry({ title, loginUrl, providerError }: { title: string; loginUrl: string; providerError: string }) {
  const { tr } = useLanguage()
  const [leaving] = useState(() => !providerError && mayRedirectToK2Auth())
  useEffect(() => { if (leaving) window.location.assign(loginUrl) }, [leaving, loginUrl])
  return <main className="account-entry"><section className="panel account-entry-card"><KeyRound size={25} /><h1>{title}</h1><h2>{tr('Вхід через K2 Auth', 'Sign in with K2 Auth')}</h2>
    {leaving
      ? <p role="status">{tr('Переходимо на сторінку входу K2…', 'Opening the K2 sign-in page…')}</p>
      : <><p>{tr('Вхід — на спільній сторінці K2: пароль і passkey. Доступні функції та підрозділи визначає адміністратор.', 'Sign in on the shared K2 page with your password and passkey. Your administrator assigns features and data areas.')}</p>
        {providerError && <p className="account-error" role="alert">{providerError === 'cancelled' ? tr('Вхід скасовано.', 'Sign-in was cancelled.') : providerError === 'unavailable' ? tr('Сервіс входу тимчасово недоступний. Спробуйте пізніше.', 'Sign-in is temporarily unavailable. Try again later.') : tr('Не вдалося завершити вхід. Спробуйте ще раз.', 'Could not complete sign-in. Try again.')}</p>}
        <a className="primary" href={loginUrl}>{tr('Увійти', 'Sign in')}</a></>}
  </section></main>
}

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const { config } = useAppConfiguration()
  const { tr } = useLanguage()
  const provider = useAuthProvider()
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  // Keycloak wants something the form cannot do (a temporary password, OTP…): finish it on its page.
  const [setupRequired, setSetupRequired] = useState(false)
  const [providerError] = useState(takeProviderError)
  if (auth.loading || auth.error) return <main className="account-entry"><section className="panel account-entry-card" role="status"><h1>{config.appearance.title}</h1><p>{auth.loading ? tr('Перевірка входу…', 'Checking sign-in…') : auth.error}</p>{!auth.loading && <button className="secondary" onClick={() => void auth.refresh()}><RefreshCcw size={16} /> {tr('Спробувати ще раз', 'Try again')}</button>}</section></main>
  if (!auth.enabled || auth.user) return <Fragment key={auth.user?.id ?? 'bootstrap'}><PasswordUpdatedNotice />{children}</Fragment>
  if (provider.isPending || provider.error) return <main className="account-entry"><section className="panel account-entry-card"><h1>{config.appearance.title}</h1><p>{provider.error instanceof Error ? provider.error.message : tr('Завантаження способу входу…', 'Loading sign-in…')}</p>{provider.error && <button className="secondary" onClick={() => void provider.refetch()}>{tr('Спробувати ще раз', 'Try again')}</button>}</section></main>
  if (provider.data.provider === 'k2auth') return <K2AuthEntry title={config.appearance.title} loginUrl={withApiBase(provider.data.login_url ?? '/api/auth/keycloak/login')} providerError={providerError} />
  if (provider.data.provider === 'keycloak' && !provider.data.password_login) return <main className="account-entry"><section className="panel account-entry-card"><KeyRound size={25} /><h1>{config.appearance.title}</h1><h2>{tr('Вхід через Keycloak', 'Sign in with Keycloak')}</h2><p>{tr('Після входу адміністратор визначає доступні функції та підрозділи.', 'Your administrator assigns features and data areas after sign-in.')}</p>{providerError && <p className="account-error" role="alert">{providerError === 'cancelled' ? tr('Вхід скасовано.', 'Sign-in was cancelled.') : providerError === 'unavailable' ? tr('Сервіс входу тимчасово недоступний. Спробуйте пізніше.', 'Sign-in is temporarily unavailable. Try again later.') : tr('Не вдалося завершити вхід. Спробуйте ще раз.', 'Could not complete sign-in. Try again.')}</p>}<a className="primary" href={withApiBase(provider.data.login_url ?? '/api/auth/keycloak/login')}>{tr('Увійти', 'Sign in')}</a></section></main>
  // With Keycloak the same form is used; the backend checks the password there. Sign-in
  // and sign-out never leave the application.
  const keycloak = provider.data.provider === 'keycloak'
  return <main className="account-entry"><section className="panel account-entry-card"><KeyRound size={25} /><h1>{config.appearance.title}</h1><h2>{tr('Вхід до облікового запису', 'Sign in to your account')}</h2><p>{keycloak ? tr('Використовуйте свій обліковий запис Keycloak. Доступні функції та підрозділи визначає адміністратор.', 'Use your Keycloak account. Your administrator assigns features and data areas.') : tr('Ваш дашборд і оформлення зберігаються у вашому обліковому записі.', 'Your dashboard and appearance are saved in your account.')}</p>{providerError && <p className="account-error" role="alert">{providerError === 'cancelled' ? tr('Вхід скасовано.', 'Sign-in was cancelled.') : providerError === 'unavailable' ? tr('Сервіс входу тимчасово недоступний. Спробуйте пізніше.', 'Sign-in is temporarily unavailable. Try again later.') : tr('Не вдалося завершити вхід. Спробуйте ще раз.', 'Could not complete sign-in. Try again.')}</p>}<form onSubmit={event => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); setSetupRequired(false); void auth.login(username.trim(), password, keycloak).then(() => setPassword('')).catch(reason => { setSetupRequired(keycloak && reason instanceof AccountApiError && reason.status === 409); setError(reason instanceof Error ? reason.message : tr('Не вдалося увійти.', 'Could not sign in.')); setPassword('') }).finally(() => setBusy(false)) }}><label>{tr('Логін', 'Username')}<input name="username" autoComplete="username" autoFocus required minLength={keycloak ? 1 : 3} maxLength={keycloak ? 255 : 64} value={username} disabled={busy} onChange={event => setUsername(event.target.value)} /></label><label>{tr('Пароль', 'Password')}<input name="password" type="password" autoComplete="current-password" required maxLength={keycloak ? 1024 : 128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>{error && <p className="account-error" role="alert">{error}</p>}{setupRequired && <a className="primary account-setup-link" href={keycloakPageUrl({ username: username.trim() })}>{tr('Продовжити в Keycloak', 'Continue in Keycloak')}</a>}<button className={setupRequired ? 'secondary' : 'primary'} type="submit" disabled={busy || !username.trim() || !password}>{busy ? tr('Вхід…', 'Signing in…') : tr('Увійти', 'Sign in')}</button></form><small>{tr('Якщо доступу ще немає, зверніться до адміністратора.', 'Contact your administrator if you do not have access yet.')}</small></section></main>
}
