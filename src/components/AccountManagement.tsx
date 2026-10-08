import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCcw, UserPlus } from 'lucide-react'
import { accountApi, type AppUser, type ManagedUser } from '../lib/accountApi'
import { useAuth } from '../config/AuthContext'
import './Accounts.css'

export function AccountManagement({ token = '', authorized }: { token?: string; authorized: boolean }) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [users, setUsers] = useState<ManagedUser[]>([]), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false)
  const [hasUserList, setHasUserList] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [username, setUsername] = useState(''), [displayName, setDisplayName] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('')
  const [role, setRole] = useState<AppUser['role']>('viewer')
  async function refresh() {
    setLoading(true)
    try { const result = await accountApi.users(token); setUsers(result.users); setHasUserList(true); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не вдалося завантажити користувачів.') }
    finally { setLoading(false) }
  }
  useEffect(() => { if (authorized) void refresh() }, [authorized, token])
  async function perform(operation: () => Promise<void>): Promise<boolean> {
    if (busy) return false
    setBusy(true); setError(''); setNotice('')
    try {
      await operation()
      await refresh()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bi-admin', 'users'] }),
        queryClient.invalidateQueries({ queryKey: ['bi-metadata'] }),
      ])
      return true
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не вдалося виконати дію.'); return false }
    finally { setBusy(false) }
  }
  if (!authorized) return <p className="admin-hint">Увійдіть як адміністратор, щоб створювати користувачів і керувати доступом.</p>
  return <div className="account-management"><div className="admin-section-heading"><UserPlus size={20} /><div><h3>Облікові записи користувачів</h3><p>Кожен користувач має власний дашборд. Адміністратор керує доступом і спільними налаштуваннями.</p></div></div>
    {error && <p className="account-error" role="alert">{error}</p>}{notice && <p className="account-notice" role="status">{notice}</p>}
    <form className="account-user-form" onSubmit={event => { event.preventDefault(); if (!hasUserList || loading) return; if (password !== confirmation) { setError('Паролі не збігаються.'); return }; void perform(async () => { await accountApi.createUser({ username: username.trim(), display_name: displayName.trim(), password, role: users.length ? role : 'administrator' }, token); setUsername(''); setDisplayName(''); setPassword(''); setConfirmation(''); setNotice('Обліковий запис створено. Пароль передайте користувачу особисто.'); await auth.refresh() }) }}>
      <h4>Створити користувача</h4><label>Логін<input required minLength={3} maxLength={64} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,63}" autoComplete="off" value={username} disabled={busy || loading} onChange={event => setUsername(event.target.value)} /></label><label>Ім’я для відображення<input required maxLength={120} value={displayName} disabled={busy || loading} onChange={event => setDisplayName(event.target.value)} /></label>
      <label>Новий пароль<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} disabled={busy || loading} onChange={event => setPassword(event.target.value)} /></label><label>Повторіть пароль<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} disabled={busy || loading} onChange={event => setConfirmation(event.target.value)} /></label>
      <label>Роль<select aria-label="Роль нового користувача" disabled={busy || loading || !users.length} value={users.length ? role : 'administrator'} onChange={event => setRole(event.target.value as AppUser['role'])}><option value="viewer">Користувач</option><option value="administrator">Адміністратор</option></select></label><p className="admin-hint">Пароль — від 12 символів. Логін — латинські літери, цифри, крапка, дефіс або підкреслення. Перший обліковий запис має бути адміністратором.</p><button className="admin-button admin-button-primary" type="submit" disabled={busy || loading || !hasUserList}>Створити обліковий запис</button>
    </form><button className="admin-button" type="button" disabled={busy || loading} onClick={() => void refresh()}><RefreshCcw size={16} /> {loading ? 'Завантаження…' : 'Оновити список'}</button>
    <div className="account-user-list">{users.map(user => <ManagedUserCard key={user.id} user={user} current={user.id === auth.user?.id} busy={busy} update={body => perform(async () => { await accountApi.updateUser(user.id, body, token); setNotice('Обліковий запис оновлено.'); if (user.id === auth.user?.id) await auth.refresh() })} />)}</div>
  </div>
}

function ManagedUserCard({ user, current, busy, update }: { user: ManagedUser; current: boolean; busy: boolean; update: (body: { password?: string; role?: AppUser['role']; active?: boolean }) => Promise<boolean> }) {
  const [showPassword, setShowPassword] = useState(false), [password, setPassword] = useState('')
  return <article className="account-user-card"><div><h4>{user.display_name}{current ? ' · ваш обліковий запис' : ''}</h4><small>{user.username} · {user.active ? 'Доступ увімкнено' : 'Доступ вимкнено'}</small></div><div className="account-user-actions"><label><span className="admin-sr-only">Роль: {user.username}</span><select aria-label={`Роль: ${user.username}`} value={user.role} disabled={busy} onChange={event => void update({ role: event.target.value as AppUser['role'] })}><option value="viewer">Користувач</option><option value="administrator">Адміністратор</option></select></label><button type="button" disabled={busy} onClick={() => void update({ active: !user.active })}>{user.active ? 'Вимкнути доступ' : 'Увімкнути доступ'}</button><button type="button" disabled={busy} onClick={() => { setShowPassword(!showPassword); setPassword('') }}>Змінити пароль</button></div>{showPassword && <form className="account-password-form" onSubmit={event => { event.preventDefault(); void update({ password }).then(saved => { setPassword(''); if (saved) setShowPassword(false) }) }}><input aria-label={`Новий пароль: ${user.username}`} type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /><button type="submit" className="admin-button" disabled={busy}>Зберегти новий пароль</button></form>}</article>
}
