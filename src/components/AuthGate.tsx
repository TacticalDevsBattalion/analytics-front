import { Fragment, useState, type ReactNode } from 'react'
import { KeyRound, RefreshCcw } from 'lucide-react'
import { useAuth } from '../config/AuthContext'
import { useAppConfiguration } from '../config/AppConfigurationContext'
import { useLanguage } from '../i18n/LanguageContext'
import { useQuery } from '@tanstack/react-query'
import { withApiBase } from '../config'
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

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const { config } = useAppConfiguration()
  const { tr } = useLanguage()
  const provider = useQuery({ queryKey: ['authentication-provider'], queryFn: async () => {
    const response = await fetch(withApiBase('/api/auth/provider'), { credentials: 'include', cache: 'no-store' })
    if (!response.ok) throw new Error(tr('Не вдалося визначити спосіб входу.', 'Could not load the sign-in provider.'))
    return response.json() as Promise<{provider: 'local' | 'keycloak'; login_url: string | null; password_login?: boolean}>
  }, retry: false })
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [providerError] = useState(takeProviderError)
  if (auth.loading || auth.error) return <main className="account-entry"><section className="panel account-entry-card" role="status"><h1>{config.appearance.title}</h1><p>{auth.loading ? tr('Перевірка входу…', 'Checking sign-in…') : auth.error}</p>{!auth.loading && <button className="secondary" onClick={() => void auth.refresh()}><RefreshCcw size={16} /> {tr('Спробувати ще раз', 'Try again')}</button>}</section></main>
  if (!auth.enabled || auth.user) return <Fragment key={auth.user?.id ?? 'bootstrap'}>{children}</Fragment>
  if (provider.isPending || provider.error) return <main className="account-entry"><section className="panel account-entry-card"><h1>{config.appearance.title}</h1><p>{provider.error instanceof Error ? provider.error.message : tr('Завантаження способу входу…', 'Loading sign-in…')}</p>{provider.error && <button className="secondary" onClick={() => void provider.refetch()}>{tr('Спробувати ще раз', 'Try again')}</button>}</section></main>
  if (provider.data.provider === 'keycloak' && !provider.data.password_login) return <main className="account-entry"><section className="panel account-entry-card"><KeyRound size={25} /><h1>{config.appearance.title}</h1><h2>{tr('Вхід через Keycloak', 'Sign in with Keycloak')}</h2><p>{tr('Після входу адміністратор визначає доступні функції та підрозділи.', 'Your administrator assigns features and data areas after sign-in.')}</p>{providerError && <p className="account-error" role="alert">{providerError === 'cancelled' ? tr('Вхід скасовано.', 'Sign-in was cancelled.') : providerError === 'unavailable' ? tr('Сервіс входу тимчасово недоступний. Спробуйте пізніше.', 'Sign-in is temporarily unavailable. Try again later.') : tr('Не вдалося завершити вхід. Спробуйте ще раз.', 'Could not complete sign-in. Try again.')}</p>}<a className="primary" href={withApiBase(provider.data.login_url ?? '/api/auth/keycloak/login')}>{tr('Увійти', 'Sign in')}</a></section></main>
  // With Keycloak the same form is used; the backend checks the password there. Sign-in
  // and sign-out never leave the application.
  const keycloak = provider.data.provider === 'keycloak'
  return <main className="account-entry"><section className="panel account-entry-card"><KeyRound size={25} /><h1>{config.appearance.title}</h1><h2>{tr('Вхід до облікового запису', 'Sign in to your account')}</h2><p>{keycloak ? tr('Використовуйте свій обліковий запис Keycloak. Доступні функції та підрозділи визначає адміністратор.', 'Use your Keycloak account. Your administrator assigns features and data areas.') : tr('Ваш дашборд і оформлення зберігаються у вашому обліковому записі.', 'Your dashboard and appearance are saved in your account.')}</p>{providerError && <p className="account-error" role="alert">{providerError === 'cancelled' ? tr('Вхід скасовано.', 'Sign-in was cancelled.') : providerError === 'unavailable' ? tr('Сервіс входу тимчасово недоступний. Спробуйте пізніше.', 'Sign-in is temporarily unavailable. Try again later.') : tr('Не вдалося завершити вхід. Спробуйте ще раз.', 'Could not complete sign-in. Try again.')}</p>}<form onSubmit={event => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); void auth.login(username.trim(), password, keycloak).then(() => setPassword('')).catch(reason => { setError(reason instanceof Error ? reason.message : tr('Не вдалося увійти.', 'Could not sign in.')); setPassword('') }).finally(() => setBusy(false)) }}><label>{tr('Логін', 'Username')}<input name="username" autoComplete="username" autoFocus required minLength={keycloak ? 1 : 3} maxLength={keycloak ? 255 : 64} value={username} disabled={busy} onChange={event => setUsername(event.target.value)} /></label><label>{tr('Пароль', 'Password')}<input name="password" type="password" autoComplete="current-password" required maxLength={keycloak ? 1024 : 128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>{error && <p className="account-error" role="alert">{error}</p>}<button className="primary" type="submit" disabled={busy || !username.trim() || !password}>{busy ? tr('Вхід…', 'Signing in…') : tr('Увійти', 'Sign in')}</button></form><small>{tr('Якщо доступу ще немає, зверніться до адміністратора.', 'Contact your administrator if you do not have access yet.')}</small></section></main>
}
