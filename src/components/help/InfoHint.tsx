import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import './help.css'

// A small "i" that explains how a number is calculated. Opens on hover, focus or
// tap, in a portal so widget borders never cut it off.
export function HintCard({ anchor, children, onEnter, onLeave, id }: { anchor: HTMLElement; children: ReactNode; onEnter?: () => void; onLeave?: () => void; id?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<{ top: number; left: number; placement: 'top' | 'bottom' }>({ top: -9999, left: -9999, placement: 'bottom' })
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.getBoundingClientRect()
      const card = ref.current?.getBoundingClientRect()
      const width = card?.width ?? 300
      const height = card?.height ?? 120
      const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8)
      const below = rect.bottom + 8 + height <= window.innerHeight - 8 || rect.top < height + 16
      setStyle({ top: below ? rect.bottom + 8 : rect.top - height - 8, left, placement: below ? 'bottom' : 'top' })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place) }
  }, [anchor])
  return createPortal(<div ref={ref} id={id} role="tooltip" className={`hint-card hint-card--${style.placement}`} style={{ top: style.top, left: style.left }} onPointerEnter={onEnter} onPointerLeave={onLeave}>{children}</div>, document.body)
}

export function useHoverCard() {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback(() => { window.clearTimeout(timer.current); setOpen(true) }, [])
  // A short delay lets the pointer move from the trigger onto the card.
  const hide = useCallback(() => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), 120) }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return { open, setOpen, show, hide }
}

export function InfoHint({ title, children, label = 'Як рахується', size = 13 }: { title?: ReactNode; children: ReactNode; label?: string; size?: number }) {
  const ref = useRef<HTMLButtonElement>(null)
  const id = useId()
  const { open, setOpen, show, hide } = useHoverCard()
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [open, setOpen])
  return <>
    <button ref={ref} type="button" className="info-hint" aria-label={label} aria-describedby={open ? id : undefined} aria-expanded={open}
      onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}
      onKeyDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); setOpen(current => !current) }}>
      <Info size={size} aria-hidden="true" />
    </button>
    {open && ref.current && <HintCard anchor={ref.current} id={id} onEnter={show} onLeave={hide}>
      {title && <strong className="hint-card__title">{title}</strong>}
      <div className="hint-card__body">{children}</div>
    </HintCard>}
  </>
}
