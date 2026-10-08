import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/tokens.css'
import './styles/index.css'
import './styles/header.css'
import './styles/polish.css'
import App from './App'
import { LanguageProvider } from './i18n/LanguageContext'
import { loadFrontendConfig } from './config'
import { AppConfigurationProvider, loadAppConfiguration } from './config/AppConfigurationContext'
import { CustomFiltersProvider } from './config/CustomFiltersContext'
import { AuthProvider } from './config/AuthContext'
import { AuthGate } from './components/AuthGate'

async function bootstrap() {
  const config = await loadFrontendConfig()
  await loadAppConfiguration()

  document.title = config.app.branding.app_name
  document.documentElement.lang = config.app.language.default

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: config.app.query.stale_time_ms,
        refetchOnWindowFocus: config.app.query.refetch_on_window_focus,
        retry: config.app.query.retry_count,
      },
    },
  })

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <LanguageProvider>
        <QueryClientProvider client={queryClient}>
          <AppConfigurationProvider><CustomFiltersProvider><AuthProvider><AuthGate><App /></AuthGate></AuthProvider></CustomFiltersProvider></AppConfigurationProvider>
        </QueryClientProvider>
      </LanguageProvider>
    </React.StrictMode>,
  )

  if (config.pwa.enabled && 'serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(config.pwa.service_worker.path, { scope: config.pwa.service_worker.scope })
        .catch((error) => {
          console.error('Service Worker registration failed:', error)
        })
    })
  }
}

bootstrap().catch((error) => {
  console.error('Frontend bootstrap failed:', error)
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = '<div style="padding:24px;font-family:system-ui;color:#fff;background:#07101a;min-height:100vh">Frontend configuration could not be loaded.</div>'
  }
})
