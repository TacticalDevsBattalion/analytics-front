import { Fragment, useState, type ReactNode } from 'react'
import { KeyRound, RefreshCcw } from 'lucide-react'
import { useAuth } from '../config/AuthContext'
import { useAppConfiguration } from '../config/AppConfigurationContext'
import { useLanguage } from '../i18n/LanguageContext'
import { useQuery } from '@tanstack/react-query'
import { withApiBase } from '../config'
import './Accounts.css'

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const { config } = useAppConfiguration()
  const { tr } = useLanguage()
  const provider = useQuery({ queryKey: ['authentication-provider'], queryFn: async () => {
    const response = await fetch(withApiBase('/api/auth/provider'), { credentials: 'include', cache: 'no-store' })
    if (!response.ok) throw new Error(tr('Не вдалося визначити спосіб входу.', 'Could not load the sign-in provider.'))
    return response.json() as Promise<{provider: 'local' | 'keycloak'; login_url: string | null}>
  }, retry: false })
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  if (auth.loading || auth.error) return <main className="account-entry"><section className="panel account-entry-card" role="status"><h1>{config.appearance.title}</h1><p>{auth.loading ? tr('Перевірка входу…', 'Checking sign-in…') : auth.error}</p>{!auth.loading && <button className="secondary" onClick={() => void auth.refresh()}><RefreshCcw size={16} /> {tr('Спробувати ще раз', 'Try again')}</button>}</section></main>
  if (!auth.enabled || auth.user) return <Fragment key={auth.user?.id ?? 'bootstrap'}>{children}</Fragment>
  if (provider.isPending || provider.error) return <main className="account-entry"><section className="panel account-entry-card"><h1>{config.appearance.title}</h1><p>{provider.error instanceof Error ? provider.error.message : tr('Завантаження способу входу…', 'Loading sign-in…')}</p>{provider.error && <button className="secondary" onClick={() => void provider.refetch()}>{tr('Спробувати ще раз', 'Try again')}</button>}</section></main>
  if (provider.data.provider === 'keycloak') return <main className="account-entry"><section className="panel account-entry-card"><KeyRound size={25} /><h1>{config.appearance.title}</h1><h2>{tr('Вхід через Keycloak', 'Sign in with Keycloak')}</h2><p>{tr('Після входу адміністратор визначає доступні функції та підрозділи.', 'Your administrator assigns features and data areas after sign-in.')}</p><a className="primary" href={withApiBase(provider.data.login_url ?? '/api/auth/keycloak/login')}>{tr('Увійти', 'Sign in')}</a></section></main>
  return <main className="account-entry"><section className="panel account-entry-card"><KeyRound size={25} /><h1>{config.appearance.title}</h1><h2>{tr('Вхід до облікового запису', 'Sign in to your account')}</h2><p>{tr('Ваш дашборд і оформлення зберігаються у вашому обліковому записі.', 'Your dashboard and appearance are saved in your account.')}</p><form onSubmit={event => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); void auth.login(username.trim(), password).then(() => setPassword('')).catch(reason => { setError(reason instanceof Error ? reason.message : tr('Не вдалося увійти.', 'Could not sign in.')); setPassword('') }).finally(() => setBusy(false)) }}><label>{tr('Логін', 'Username')}<input name="username" autoComplete="username" autoFocus required minLength={3} maxLength={64} value={username} disabled={busy} onChange={event => setUsername(event.target.value)} /></label><label>{tr('Пароль', 'Password')}<input name="password" type="password" autoComplete="current-password" required maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>{error && <p className="account-error" role="alert">{error}</p>}<button className="primary" type="submit" disabled={busy || !username.trim() || !password}>{busy ? tr('Вхід…', 'Signing in…') : tr('Увійти', 'Sign in')}</button></form><small>{tr('Якщо доступу ще немає, зверніться до адміністратора.', 'Contact your administrator if you do not have access yet.')}</small></section></main>
}
