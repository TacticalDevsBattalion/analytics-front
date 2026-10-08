import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getFrontendConfig, type AppLanguage } from '../config'

export type { AppLanguage }

type LanguageContextValue = {
  language: AppLanguage
  locale: string
  setLanguage: (language: AppLanguage) => void
  tr: (uk: string, en: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function initialLanguage(): AppLanguage {
  const { language } = getFrontendConfig().app

  try {
    const stored = localStorage.getItem(language.storage_key)
    if (stored === 'en' || stored === 'uk') return stored
  } catch {
    // ignore storage access errors
  }

  return language.default
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const config = getFrontendConfig().app.language
  const [language, setLanguage] = useState<AppLanguage>(initialLanguage)

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dataset.language = language

    try {
      localStorage.setItem(config.storage_key, language)
    } catch {
      // ignore storage access errors
    }
  }, [language, config.storage_key])

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    locale: config.locales[language],
    setLanguage,
    tr: (uk: string, en: string) => (language === 'uk' ? uk : en),
  }), [language, config.locales])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)

  if (!context) {
    throw new Error('useLanguage must be used inside LanguageProvider')
  }

  return context
}
