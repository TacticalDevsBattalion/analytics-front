import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { accountApi, type AppUser, type AuthSession } from '../lib/accountApi'
import { useAppConfiguration } from './AppConfigurationContext'

type AuthValue = AuthSession & { loading: boolean; error: string; refresh: () => Promise<void>; login: (username: string, password: string) => Promise<void>; logout: () => Promise<void> }
const Context = createContext<AuthValue | null>(null)
export type { AppUser }
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { refresh: refreshConfiguration, clearPreview } = useAppConfiguration()
  const [session, setSession] = useState<AuthSession>({ enabled: true, user: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const previousIdentity = useRef<string | null | undefined>(undefined)
  const transitionBusy = useRef(false)
  const apply = useCallback(async (next: AuthSession, current: number) => {
    const identity = next.user ? `${next.user.id}:${next.user.role}` : null
    if (previousIdentity.current !== identity) {
      setLoading(true)
      queryClient.clear()
      clearPreview()
      // Anonymous and signed-in configuration snapshots can share a revision.
      await refreshConfiguration({ force: true })
    }
    if (current !== generation.current) return
    previousIdentity.current = identity
    setSession(next)
    setError('')
  }, [queryClient, clearPreview, refreshConfiguration])
  const refresh = useCallback(async () => {
    if (transitionBusy.current) return
    const current = ++generation.current
    try { const next = await accountApi.session(); if (current === generation.current) await apply(next, current) }
    catch (reason) { if (current === generation.current) setError(reason instanceof Error ? reason.message : 'Не вдалося перевірити вхід.') }
    finally { if (current === generation.current) setLoading(false) }
  }, [apply])
  const login = useCallback(async (username: string, password: string) => {
    if (transitionBusy.current) return
    transitionBusy.current = true
    const current = ++generation.current
    try { const next = await accountApi.login(username, password); if (current === generation.current) await apply(next, current) }
    catch (reason) { if (current === generation.current && previousIdentity.current !== null) setError(reason instanceof Error ? reason.message : 'Не вдалося завантажити налаштування.'); throw reason }
    finally { transitionBusy.current = false; if (current === generation.current) setLoading(false) }
  }, [apply])
  const logout = useCallback(async () => {
    if (transitionBusy.current) return
    transitionBusy.current = true
    const current = ++generation.current
    try {
      const next = await accountApi.logout()
      try { sessionStorage.removeItem('analytics-app-admin-session') } catch { /* Storage can be unavailable. */ }
      if (current === generation.current) await apply(next, current)
    }
    catch (reason) { if (current === generation.current) setError(reason instanceof Error ? reason.message : 'Не вдалося завершити вхід.'); throw reason }
    finally { transitionBusy.current = false; if (current === generation.current) setLoading(false) }
  }, [apply])
  useEffect(() => {
    const quietly = () => { void refresh() }
    void refresh()
    const interval = window.setInterval(quietly, 30000)
    window.addEventListener('focus', quietly)
    window.addEventListener('analytics-session-expired', quietly)
    return () => { ++generation.current; window.clearInterval(interval); window.removeEventListener('focus', quietly); window.removeEventListener('analytics-session-expired', quietly) }
  }, [refresh])
  return <Context.Provider value={{ ...session, loading, error, refresh, login, logout }}>{children}</Context.Provider>
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error('AuthProvider is required'); return value }
