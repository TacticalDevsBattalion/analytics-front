import {
  BarChart3,
  GitCompareArrows,
  LayoutDashboard,
  Map,
  Settings,
  SlidersHorizontal,
  Table2,
  Settings2,
} from 'lucide-react'
import { Ellipsis } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { getFrontendConfig } from '../config'
import { useAppConfiguration } from '../config/AppConfigurationContext'
import { useAuth } from '../config/AuthContext'
import '../styles/mobile-nav.css'

export type PageId =
  | 'dashboard'
  | 'statistics'
  | 'comparison'
  | 'map'
  | 'table'
  | 'personal'
  | 'dictionaries'
  | 'settings'
  | 'administration'

export function Sidebar({
  active,
  onNavigate,
  permissions,
}: {
  active: PageId
  onNavigate: (page: PageId) => void
  permissions?: string[]
}) {
  const { tr } = useLanguage()
  const { branding } = getFrontendConfig().app
  const { config } = useAppConfiguration()
  const auth = useAuth()
  const pagePermissions: Partial<Record<PageId, string>> = { dashboard: 'dashboard.view', statistics: 'statistics.view', comparison: 'comparison.view', personal: 'personal_dashboard.view', map: 'dashboard.view', table: 'statistics.view', dictionaries: 'metric.view', administration: 'analytics.admin' }
  const allowed = (id: PageId) => !permissions || !pagePermissions[id] || permissions.includes('*') || permissions.includes(pagePermissions[id]!)

  const items: Array<[PageId, string, typeof LayoutDashboard]> = [
    ['dashboard', tr('Дашборд', 'Dashboard'), LayoutDashboard],
    ['statistics', tr('Статистика', 'Statistics'), BarChart3],
    ['comparison', tr('Порівняння', 'Comparison'), GitCompareArrows],
    ['map', tr('Карта', 'Map'), Map],
    ['table', tr('Таблиця', 'Table'), Table2],
    ['personal', tr('Мій дашборд', 'My dashboard'), LayoutDashboard],
    ['dictionaries', tr('Довідники', 'Dictionaries'), SlidersHorizontal],
    ['settings', tr('Налаштування', 'Settings'), Settings],
  ]

  const serviceItems: Array<[PageId, string, typeof LayoutDashboard]> = [
    ['administration', tr('Адміністрування', 'Administration'), Settings2],
  ]

  const mainVisible = items.filter(([id]) => (id === 'personal' || config.appearance.menu.includes(id)) && allowed(id)).sort((a, b) => (a[0] === 'personal' ? config.appearance.menu.indexOf('saved') : config.appearance.menu.indexOf(a[0])) - (b[0] === 'personal' ? config.appearance.menu.indexOf('saved') : config.appearance.menu.indexOf(b[0])))
  const serviceVisible = serviceItems.filter(([id]) => id === 'administration' ? !auth.enabled || auth.user?.role === 'administrator' || permissions?.includes('analytics.admin') : config.appearance.menu.includes(id) && allowed(id)).sort((a, b) => config.appearance.menu.indexOf(a[0]) - config.appearance.menu.indexOf(b[0]))

  // Phone: bottom tab bar with the first four sections and a "More" menu for the rest.
  const mobileAll = [...mainVisible, ...serviceVisible]
  const mobilePrimary = mobileAll.length <= 5 ? mobileAll : mobileAll.slice(0, 4)
  const mobileMore = mobileAll.length <= 5 ? [] : mobileAll.slice(4)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!moreOpen) return
    const outside = (event: PointerEvent) => { if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMoreOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [moreOpen])
  const go = (id: PageId) => { setMoreOpen(false); onNavigate(id) }
  const moreActive = mobileMore.some(([id]) => id === active)

  return (
    <>
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">{branding.short_name.slice(0, 1).toUpperCase()}</div>
        <div>
          <strong>{config.appearance.title}</strong>
          <span>{config.appearance.subtitle}</span>
        </div>
      </div>

      <nav className="side-nav" aria-label={tr('Основна навігація', 'Main navigation')}>
        {mainVisible.map(([id, label, Icon]) => (
          <button
            className={active === id ? 'active' : ''}
            key={id}
            aria-label={label}
            onClick={() => onNavigate(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="side-spacer" />
      <div className="side-label">{tr('СЕРВІС', 'SERVICE')}</div>

      <nav className="side-nav" aria-label={tr('Сервісна навігація', 'Service navigation')}>
        {serviceVisible.map(([id, label, Icon]) => (
          <button
            className={active === id ? 'active' : ''}
            key={id}
            aria-label={label}
            onClick={() => onNavigate(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="side-footer">{branding.sidebar_version}</div>
    </aside>

    <nav className="mobile-tabbar" aria-label={tr('Основна навігація', 'Main navigation')}>
      {mobilePrimary.map(([id, label, Icon]) => (
        <button key={id} type="button" className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined} onClick={() => go(id)}>
          <Icon size={20} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
      {mobileMore.length > 0 && (
        <div className="mobile-tabbar__more-wrap" ref={moreRef}>
          <button type="button" className={moreActive ? 'active' : ''} aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen((open) => !open)}>
            <Ellipsis size={20} aria-hidden="true" />
            <span>{tr('Ще', 'More')}</span>
          </button>
          {moreOpen && (
            <div className="mobile-tabbar__menu" role="menu">
              {mobileMore.map(([id, label, Icon]) => (
                <button key={id} type="button" role="menuitem" className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined} onClick={() => go(id)}>
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
    </>
  )
}
