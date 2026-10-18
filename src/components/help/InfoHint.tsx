import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Info, X } from 'lucide-react'
import './help.css'

// The last input kind: a tap on a tablet also fires hover and focus events, which
// must not open or close cards there.
let lastPointer = 'mouse'
if (typeof document !== 'undefined') document.addEventListener('pointerdown', event => { lastPointer = event.pointerType || 'mouse' }, true)
export const touchInput = () => lastPointer === 'touch' || lastPointer === 'pen'

// A card next to its trigger, in a portal so widget borders never cut it off. On touch
// screens it is a sheet at the bottom of the screen, away from the finger.
export function HintCard({ anchor, children, onEnter, onLeave, onClose, sheet = false, id }: { anchor: HTMLElement; children: ReactNode; onEnter?: () => void; onLeave?: () => void; onClose?: () => void; sheet?: boolean; id?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<{ top: number; left: number; placement: 'top' | 'bottom' }>({ top: -9999, left: -9999, placement: 'bottom' })
  useLayoutEffect(() => {
    if (sheet) return
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
  }, [anchor, sheet])
  const fromMouse = (handler?: () => void) => handler && ((event: ReactPointerEvent) => { if (event.pointerType === 'mouse') handler() })
  return createPortal(<div ref={ref} id={id} role={sheet ? 'dialog' : 'tooltip'} className={sheet ? 'hint-card hint-card--sheet' : `hint-card hint-card--${style.placement}${onClose ? ' hint-card--pinned' : ''}`}
    style={sheet ? undefined : { top: style.top, left: style.left }} onPointerEnter={fromMouse(onEnter)} onPointerLeave={fromMouse(onLeave)}>
    {onClose && <button type="button" className="hint-card__close" onClick={onClose} aria-label="Закрити"><X size={sheet ? 18 : 14} aria-hidden="true" /></button>}
    {children}
  </div>, document.body)
}

/**
 * Mouse: hover shows the card, a click keeps it open. Touch: a tap opens it as a
 * sheet that stays until closed, a tap outside or Escape.
 */
export function useHoverCard(anchor: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [sheet, setSheet] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const close = useCallback(() => { window.clearTimeout(timer.current); setOpen(false); setPinned(false); setSheet(false) }, [])
  const show = useCallback(() => { window.clearTimeout(timer.current); setOpen(true) }, [])
  // A short delay lets the pointer move from the trigger onto the card.
  const hide = useCallback(() => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), 120) }, [])
  const toggle = useCallback(() => {
    window.clearTimeout(timer.current)
    if (pinned) { close(); return }
    setOpen(true); setPinned(true); setSheet(touchInput())
  }, [pinned, close])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    if (!pinned) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target?.closest?.('.hint-card') || anchor.current?.contains(target)) return
      close()
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape) }
  }, [pinned, close, anchor])
  const trigger = {
    onPointerEnter: (event: ReactPointerEvent) => { if (event.pointerType === 'mouse') show() },
    onPointerLeave: (event: ReactPointerEvent) => { if (event.pointerType === 'mouse' && !pinned) hide() },
    onFocus: () => { if (!touchInput()) show() },
    onBlur: () => { if (!pinned) hide() },
  }
  const card = { onEnter: show, onLeave: pinned ? undefined : hide, onClose: pinned ? close : undefined, sheet }
  return { open, pinned, toggle, close, trigger, card }
}

export function InfoHint({ title, children, label = 'Як рахується', size = 13 }: { title?: ReactNode; children: ReactNode; label?: string; size?: number }) {
  const ref = useRef<HTMLButtonElement>(null)
  const id = useId()
  const { open, close, toggle, trigger, card } = useHoverCard(ref)
  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open, close])
  return <>
    <button ref={ref} type="button" className="info-hint" aria-label={label} aria-describedby={open ? id : undefined} aria-expanded={open}
      {...trigger}
      onKeyDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); toggle() }}>
      <Info size={size} aria-hidden="true" />
    </button>
    {open && ref.current && <HintCard anchor={ref.current} id={id} {...card}>
      {title && <strong className="hint-card__title">{title}</strong>}
      <div className="hint-card__body">{children}</div>
    </HintCard>}
  </>
}
