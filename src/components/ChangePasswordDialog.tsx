import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { accountApi } from '../lib/accountApi'
import { useLanguage } from '../i18n/LanguageContext'

/** A local account changes its own password; other sessions of the account end. */
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { tr } = useLanguage()
  const [current, setCurrent] = useState(''), [next, setNext] = useState(''), [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    first.current?.focus()
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [onClose])
  const mismatch = repeat.length > 0 && next !== repeat
  const short = next.length > 0 && next.length < 12
  const submit = () => {
    if (busy || mismatch || short || !current || !next) return
    setBusy(true); setError('')
    accountApi.changePassword(current, next)
      .then(() => { setDone(true); setCurrent(''); setNext(''); setRepeat('') })
      .catch(reason => setError(reason instanceof Error ? reason.message : tr('Не вдалося змінити пароль.', 'Could not change the password.')))
      .finally(() => setBusy(false))
  }
  return <div className="account-dialog-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="panel account-dialog" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
      <header><h2 id="change-password-title">{tr('Зміна пароля', 'Change password')}</h2><button type="button" className="account-dialog__close" aria-label={tr('Закрити', 'Close')} onClick={onClose}><X size={18} /></button></header>
      {done ? <>
        <p role="status">{tr('Пароль змінено. На інших пристроях потрібно буде увійти знову.', 'Your password has been changed. Other devices will need to sign in again.')}</p>
        <button type="button" className="primary" onClick={onClose}>{tr('Готово', 'Done')}</button>
      </> : <form className="account-user-form account-dialog__form" onSubmit={event => { event.preventDefault(); submit() }}>
        <label>{tr('Поточний пароль', 'Current password')}<input ref={first} type="password" autoComplete="current-password" required maxLength={128} value={current} disabled={busy} onChange={event => setCurrent(event.target.value)} /></label>
        <label>{tr('Новий пароль', 'New password')}<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={next} disabled={busy} onChange={event => setNext(event.target.value)} /></label>
        {short && <small className="account-error">{tr('Щонайменше 12 символів.', 'At least 12 characters.')}</small>}
        <label>{tr('Повторіть новий пароль', 'Repeat the new password')}<input type="password" autoComplete="new-password" required maxLength={128} value={repeat} disabled={busy} onChange={event => setRepeat(event.target.value)} /></label>
        {mismatch && <small className="account-error">{tr('Паролі не збігаються.', 'The passwords do not match.')}</small>}
        {error && <p className="account-error" role="alert">{error}</p>}
        <div className="account-dialog__actions"><button type="button" className="secondary" onClick={onClose} disabled={busy}>{tr('Скасувати', 'Cancel')}</button><button type="submit" className="primary" disabled={busy || mismatch || short || !current || !next || !repeat}>{busy ? tr('Збереження…', 'Saving…') : tr('Змінити пароль', 'Change password')}</button></div>
      </form>}
    </section>
  </div>
}
