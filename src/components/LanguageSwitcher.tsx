import { Languages } from 'lucide-react'
import { useLanguage } from '../i18n/LanguageContext'

export function LanguageSwitcher() {
  const { language, setLanguage, tr } = useLanguage()

  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={tr('Мова інтерфейсу', 'Interface language')}
    >
      <Languages size={15} className="language-switcher__icon" />

      <button
        type="button"
        className={language === 'uk' ? 'active' : ''}
        onClick={() => setLanguage('uk')}
        aria-pressed={language === 'uk'}
        title="Українська"
      >
        UA
      </button>

      <span>/</span>

      <button
        type="button"
        className={language === 'en' ? 'active' : ''}
        onClick={() => setLanguage('en')}
        aria-pressed={language === 'en'}
        title="English"
      >
        EN
      </button>
    </div>
  )
}
