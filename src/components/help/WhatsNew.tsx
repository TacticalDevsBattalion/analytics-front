import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Sparkles, X } from 'lucide-react'
import { WHATS_NEW, activeEntries, entriesFor, formatBuild, type WhatsNewEntry } from '../../lib/whatsNew'
import { HintCard, useHoverCard } from './InfoHint'
import './help.css'

const SEEN_KEY = 'analytics.whats_new.seen'

function readSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') as string[]) } catch { return new Set() }
}

export const BUILD_LABEL = formatBuild(__APP_VERSION__, __APP_BUILD_DATE__, __APP_COMMIT__)

type WhatsNewState = {
  /** Changes not yet acknowledged and not older than the highlight period. */
  active: WhatsNewEntry[]
  markSeen: (ids: string[]) => void
  openDialog: () => void
  onNavigate?: (page: string, section?: string) => void
}
const WhatsNewContext = createContext<WhatsNewState>({ active: [], markSeen: () => {}, openDialog: () => {} })

export function WhatsNewProvider({ children, onNavigate }: { children: ReactNode; onNavigate?: (page: string, section?: string) => void }) {
  const [seen, setSeen] = useState(readSeen)
  const [dialog, setDialog] = useState(false)
  const active = useMemo(() => activeEntries(WHATS_NEW, seen), [seen])
  const markSeen = useCallback((ids: string[]) => setSeen(current => {
    const next = new Set([...current, ...ids])
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...next])) } catch { /* storage may be blocked */ }
    return next
  }), [])
  const value = useMemo(() => ({ active, markSeen, openDialog: () => setDialog(true), onNavigate }), [active, markSeen, onNavigate])
  return <WhatsNewContext.Provider value={value}>
    {children}
    {dialog && <WhatsNewDialog onClose={() => setDialog(false)} />}
  </WhatsNewContext.Provider>
}

export const useWhatsNew = () => useContext(WhatsNewContext)

/** Unseen changes on a page, a statistics section or a widget. */
export function useNewFor(where: Parameters<typeof entriesFor>[1]) {
  const { active } = useWhatsNew()
  return entriesFor(active, where)
}

/** A "Нове" pill; hovering it tells what changed, "Зрозуміло" hides it. */
export function NewBadge({ entries, compact = false }: { entries: WhatsNewEntry[]; compact?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const { markSeen } = useWhatsNew()
  const { open, close, toggle, trigger, card } = useHoverCard(ref)
  if (!entries.length) return null
  return <>
    <span ref={ref} className={`new-badge${compact ? ' new-badge--dot' : ''}`} tabIndex={compact ? -1 : 0} role={compact ? undefined : 'button'} aria-label={compact ? 'Є нове' : 'Що нового тут'}
      {...(compact ? {} : trigger)}
      onClick={event => { if (compact) return; event.stopPropagation(); toggle() }}>
      {compact ? '' : 'Нове'}
    </span>
    {open && ref.current && <HintCard anchor={ref.current} {...card}>
      {entries.map(entry => <div className="hint-card__entry" key={entry.id}><strong className="hint-card__title">{entry.title}</strong><div className="hint-card__body">{entry.text}</div></div>)}
      <button type="button" className="hint-card__action" onClick={() => { markSeen(entries.map(entry => entry.id)); close() }}>Зрозуміло</button>
    </HintCard>}
  </>
}

/** Sidebar footer: the build and a dot while there are unseen changes. */
export function VersionButton() {
  const { active, openDialog } = useWhatsNew()
  return <button type="button" className="version-button" onClick={openDialog} title="Що нового">
    <span>{BUILD_LABEL}</span>
    {active.length > 0 && <span className="version-button__new"><Sparkles size={12} aria-hidden="true" />{active.length}</span>}
  </button>
}

function WhatsNewDialog({ onClose }: { onClose: () => void }) {
  const { active, markSeen, onNavigate } = useWhatsNew()
  const fresh = new Set(active.map(entry => entry.id))
  const versions = [...new Set(WHATS_NEW.map(entry => entry.version))]
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [onClose])
  const pages: Record<string, string> = { dashboard: 'Дашборд', statistics: 'Статистика', comparison: 'Порівняння', map: 'Карта', table: 'Таблиця' }
  return <div className="whats-new-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="whats-new" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
      <header><div><h2 id="whats-new-title">Що нового</h2><small>{BUILD_LABEL}</small></div><button type="button" className="icon-button" onClick={onClose} aria-label="Закрити"><X size={16} /></button></header>
      <div className="whats-new__list">
        {versions.map(version => <div key={version}>
          <h3>Версія {version}</h3>
          {WHATS_NEW.filter(entry => entry.version === version).map(entry => <article key={entry.id} className={fresh.has(entry.id) ? 'whats-new__item whats-new__item--fresh' : 'whats-new__item'}>
            <div className="whats-new__meta">{fresh.has(entry.id) && <span className="new-badge">Нове</span>}<time>{new Date(`${entry.date}T00:00:00`).toLocaleDateString('uk-UA')}</time></div>
            <strong>{entry.title}</strong>
            <p>{entry.text}</p>
            {entry.target?.page && onNavigate && pages[entry.target.page] && <button type="button" className="whats-new__go" onClick={() => { markSeen([entry.id]); onNavigate(entry.target!.section && entry.target!.page !== 'dashboard' ? 'statistics' : entry.target!.page!, entry.target!.section); onClose() }}>Перейти: {entry.target.section && entry.target.page !== 'dashboard' ? 'Статистика' : pages[entry.target.page]} →</button>}
          </article>)}
        </div>)}
      </div>
      <footer><button type="button" className="secondary" disabled={!active.length} onClick={() => markSeen(active.map(entry => entry.id))}>Позначити все переглянутим</button><button type="button" className="primary" onClick={onClose}>Закрити</button></footer>
    </section>
  </div>
}
