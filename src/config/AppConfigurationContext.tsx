import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { configurationApi } from '../lib/configurationApi'
import { defaultAppConfiguration, setCurrentAppConfiguration, type AppConfiguration, type PublicAppConfiguration } from './appConfiguration'

let initialConfiguration: PublicAppConfiguration | null = null
export async function loadAppConfiguration() {
  try { initialConfiguration = await configurationApi.public() }
  catch { initialConfiguration = { config: defaultAppConfiguration(), revision: 0, administration_enabled: false } }
  setCurrentAppConfiguration(initialConfiguration.config)
}
type ContextValue = {
  config: AppConfiguration; publishedConfig: AppConfiguration; revision: number; isPreview: boolean; administrationEnabled: boolean
  previewConfig: (config: AppConfiguration) => void; clearPreview: () => void; refresh: (options?: { force?: boolean }) => Promise<void>
}
const Context = createContext<ContextValue | null>(null)

export function AppConfigurationProvider({ children }: { children: ReactNode }) {
  const [published, setPublished] = useState<PublicAppConfiguration>(() => initialConfiguration ?? { config: defaultAppConfiguration(), revision: 0, administration_enabled: false })
  const [preview, setPreview] = useState<AppConfiguration | null>(null)
  const requestGeneration = useRef(0)
  const forcedRefreshes = useRef(0)
  const config = preview ?? published.config
  const refresh = useCallback(async (options?: { force?: boolean }) => {
    if (!options?.force && forcedRefreshes.current) return
    if (options?.force) ++forcedRefreshes.current
    const generation = ++requestGeneration.current
    try {
      const next = await configurationApi.public()
      if (generation !== requestGeneration.current) return
      if (options?.force) setCurrentAppConfiguration(next.config)
      setPublished(current => !options?.force && current.revision === next.revision && current.administration_enabled === next.administration_enabled ? current : next)
    } finally { if (options?.force) --forcedRefreshes.current }
  }, [])
  const clearPreview = useCallback(() => setPreview(null), [])
  const previewConfig = useCallback((next: AppConfiguration) => setPreview(structuredClone(next)), [])
  useEffect(() => {
    setCurrentAppConfiguration(config)
    document.title = config.appearance.title
  }, [config])
  useEffect(() => {
    const refreshQuietly = () => { refresh().catch(() => {}) }
    const interval = window.setInterval(refreshQuietly, 30000)
    window.addEventListener('focus', refreshQuietly)
    return () => { ++requestGeneration.current; window.clearInterval(interval); window.removeEventListener('focus', refreshQuietly) }
  }, [refresh])
  const value = useMemo(() => ({ config, publishedConfig: published.config, revision: published.revision, isPreview: preview !== null, administrationEnabled: published.administration_enabled, refresh, previewConfig, clearPreview }), [config, published, preview, refresh, previewConfig, clearPreview])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useAppConfiguration() {
  const value = useContext(Context)
  if (!value) throw new Error('AppConfigurationProvider is required')
  return value
}
