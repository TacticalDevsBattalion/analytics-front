import { useEffect, useMemo, useState } from 'react'
import { Download, Share2, X } from 'lucide-react'
import { useLanguage } from '../i18n/LanguageContext'
import { getFrontendConfig } from '../config'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

function isIosDevice() {
  const ua = window.navigator.userAgent.toLowerCase()
  return /iphone|ipad|ipod/.test(ua)
}

function isStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean(
      (window.navigator as Navigator & { standalone?: boolean })
        .standalone,
    )
  )
}

export function PwaInstallButton() {
  const { tr } = useLanguage()
  const pwaEnabled = getFrontendConfig().pwa.enabled
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [showIosHelp, setShowIosHelp] = useState(false)
  const [installed, setInstalled] = useState(false)

  const ios = useMemo(() => {
    if (typeof window === 'undefined') return false
    return isIosDevice()
  }, [])

  useEffect(() => {
    setInstalled(isStandaloneMode())

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }

    const handleInstalled = () => {
      setInstalled(true)
      setInstallEvent(null)
      setShowIosHelp(false)
    }

    window.addEventListener(
      'beforeinstallprompt',
      handleBeforeInstallPrompt,
    )
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt,
      )
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  if (!pwaEnabled || installed) return null

  const handleInstall = async () => {
    if (installEvent) {
      await installEvent.prompt()
      const choice = await installEvent.userChoice

      if (choice.outcome === 'accepted') {
        setInstallEvent(null)
      }

      return
    }

    setShowIosHelp(true)
  }

  return (
    <>
      <button
        type="button"
        className="pwa-install-button"
        onClick={handleInstall}
        title={tr('Встановити як додаток', 'Install as app')}
      >
        <Download size={15} />
        <span>{tr('Встановити додаток', 'Install app')}</span>
      </button>

      {showIosHelp && (
        <div className="pwa-install-help-backdrop">
          <div
            className="pwa-install-help"
            role="dialog"
            aria-modal="true"
            aria-label={tr(
              'Як встановити додаток',
              'How to install the app',
            )}
          >
            <button
              type="button"
              className="pwa-install-help__close"
              onClick={() => setShowIosHelp(false)}
              aria-label={tr('Закрити', 'Close')}
            >
              <X size={17} />
            </button>

            <div className="pwa-install-help__icon">
              <Share2 size={22} />
            </div>

            <strong>
              {tr('Встановити на цей пристрій', 'Install on this device')}
            </strong>

            {ios ? (
              <p>
                {tr(
                  'У Safari натисни «Поділитися», потім вибери «Додати на початковий екран».',
                  'In Safari, tap Share, then choose “Add to Home Screen”.',
                )}
              </p>
            ) : (
              <p>
                {tr(
                  'Якщо системне встановлення ще недоступне, відкрий меню браузера та вибери «Встановити додаток» або «Додати на головний екран». Для встановлення сайт має працювати через HTTPS.',
                  'If system installation is not available yet, open the browser menu and choose “Install app” or “Add to Home screen”. The site must use HTTPS for installation.',
                )}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
