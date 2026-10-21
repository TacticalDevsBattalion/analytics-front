import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { withApiBase } from '../config'
import { useAuth } from './AuthContext'
import { readViewAs } from '../lib/viewAs'

// Settings kept per user on the server, so every device shows the same filters,
// periods and display choices.
export type PreferenceSection = 'filters' | 'ui' | 'map' | 'whats_new' | 'comparison' | 'ranking'
type Stored = Partial<Record<PreferenceSection, { value: unknown; revision: number }>>
type PreferencesValue = {
  /** True once the user's saved settings are known (or there is no signed-in user). */
  ready: boolean
  get: <T>(section: PreferenceSection) => T | undefined
  save: (section: PreferenceSection, value: unknown) => void
}

const Context = createContext<PreferencesValue>({ ready: true, get: () => undefined, save: () => {} })
const DELAY_MS = 800

async function load(signal?: AbortSignal): Promise<Stored> {
  const response = await fetch(withApiBase('/api/v1/me/preferences'), { credentials: 'include', cache: 'no-store', signal, headers: { Accept: 'application/json' } })
  if (!response.ok) return {}
  return response.json() as Promise<Stored>
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const userId = auth.user?.id
  const stored = useQuery({ queryKey: ['user-preferences', userId], queryFn: ({ signal }) => load(signal), enabled: !!userId, staleTime: Infinity, gcTime: Infinity, retry: 1 })
  const pending = useRef(new Map<PreferenceSection, { value: unknown; timer: number }>())
  const latest = useRef<Stored>({})
  useEffect(() => { if (stored.data) latest.current = { ...stored.data, ...latest.current } }, [stored.data])

  const flush = useCallback((section: PreferenceSection) => {
    const entry = pending.current.get(section)
    if (!entry) return
    pending.current.delete(section)
    window.clearTimeout(entry.timer)
    // keepalive lets the last change reach the server when the page is closing.
    void fetch(withApiBase(`/api/v1/me/preferences/${section}`), { method: 'PUT', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ value: entry.value }) }).catch(() => { /* retried with the next change */ })
  }, [])

  const save = useCallback((section: PreferenceSection, value: unknown) => {
    if (!userId || readViewAs()) return  // Viewing as another user is read-only.
    const previous = latest.current[section]
    if (previous && JSON.stringify(previous.value) === JSON.stringify(value)) return
    latest.current = { ...latest.current, [section]: { value, revision: (previous?.revision ?? 0) + 1 } }
    const current = pending.current.get(section)
    if (current) window.clearTimeout(current.timer)
    pending.current.set(section, { value, timer: window.setTimeout(() => flush(section), DELAY_MS) })
  }, [userId, flush])

  useEffect(() => {
    const flushAll = () => { for (const section of [...pending.current.keys()]) flush(section) }
    const hidden = () => { if (document.visibilityState === 'hidden') flushAll() }
    window.addEventListener('pagehide', flushAll)
    document.addEventListener('visibilitychange', hidden)
    return () => { flushAll(); window.removeEventListener('pagehide', flushAll); document.removeEventListener('visibilitychange', hidden) }
  }, [flush])

  const ready = !userId || stored.isFetched
  const value = useMemo<PreferencesValue>(() => ({
    ready,
    get: <T,>(section: PreferenceSection) => (latest.current[section]?.value ?? stored.data?.[section]?.value) as T | undefined,
    save,
  }), [ready, stored.data, save])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export const usePreferences = () => useContext(Context)

/**
 * Restores a section once the user's settings arrive, then saves every later change.
 * `apply` receives the stored value; `current` is what to store now.
 */
export function usePreferenceSync<T>(section: PreferenceSection, current: T, apply: (value: T) => void) {
  const preferences = usePreferences()
  const [restored, setRestored] = useState(false)
  const applyRef = useRef(apply)
  applyRef.current = apply
  useEffect(() => {
    if (!preferences.ready || restored) return
    const saved = preferences.get<T>(section)
    if (saved !== undefined) applyRef.current(saved)
    // Same batch as the applied value: the next render already shows it.
    setRestored(true)
  }, [preferences, section, restored])
  const encoded = JSON.stringify(current)
  useEffect(() => {
    // Nothing is saved before the stored value is applied, or the defaults would overwrite it.
    if (restored) preferences.save(section, JSON.parse(encoded))
  }, [encoded, preferences, section, restored])
}
