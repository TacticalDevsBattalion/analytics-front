import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Crosshair,
  Eye,
  Gauge,
  Plane,
  X,
} from 'lucide-react'

import type { Metric, MetricBreakdownItem } from '../lib/types'
import { filterNativeKpiBreakdown, nativeKpiCardVisible, nativeKpiHasSecondary, nativeKpiValueVisible } from '../lib/nativeKpiPresentation'
import { useAppConfiguration } from '../config/AppConfigurationContext'
import { configurationLabel } from '../config/appConfiguration'
import './KpiCardDetails.css'

const iconMap = {
  flights: Plane,
  effective: CheckCircle2,
  detected: Eye,
  affected: Crosshair,
  destroyed: Activity,
  efficiency: Gauge,
  weighted_efficiency: Gauge,
}

type PopoverPosition = {
  top?: number
  bottom?: number
  left: number
  width: number
  maxHeight: number
  placement: 'top' | 'bottom'
}

function formatNumber(value: number | null, unit?: string | null) {
  if (value == null || !Number.isFinite(value)) return '—'
  const formatted = new Intl.NumberFormat('uk-UA', {
    maximumFractionDigits: unit === '%' ? 1 : 0,
  }).format(value)

  return unit === '%'
    ? `${formatted}%`
    : unit
      ? `${formatted} ${unit}`
      : formatted
}

function formatValue(metric: Metric) {
  return formatNumber(metric.value, metric.unit)
}

function NestedBreakdownRows({ item, collapsibleGroups, hideZeroValues }: { item: MetricBreakdownItem; collapsibleGroups: boolean; hideZeroValues: boolean }) {
  const items = useMemo(() => [item], [item])
  return <BreakdownRows items={items} collapsibleGroups={collapsibleGroups} hideZeroValues={hideZeroValues} />
}

function BreakdownRows({
  items,
  collapsibleGroups = false,
  hideZeroValues = false,
}: {
  items: MetricBreakdownItem[]
  collapsibleGroups?: boolean
  hideZeroValues?: boolean
}) {
  const { config } = useAppConfiguration()
  const visibleItems = useMemo(() => filterNativeKpiBreakdown(items, hideZeroValues), [items, hideZeroValues])
  const itemLabel = (item: MetricBreakdownItem) => configurationLabel(config, 'category', item.label, configurationLabel(config, 'purpose', item.label))
  const hasNestedGroups = visibleItems.some(
    (item) => (item.children?.length ?? 0) > 0,
  )

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(),
  )

  useEffect(() => {
    // Every time another KPI / breakdown is opened, start collapsed.
    setExpandedGroups(new Set())
  }, [visibleItems])

  const toggleGroup = (key: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current)

      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }

      return next
    })
  }

  if (hasNestedGroups) {
    return (
      <div className="kpi-breakdown__groups">
        {visibleItems.map((group) => {
          const hasChildren = (group.children?.length ?? 0) > 0
          const expanded =
            !collapsibleGroups || expandedGroups.has(group.key)

          return (
            <section
              className={`kpi-breakdown__group ${
                expanded ? 'kpi-breakdown__group--expanded' : ''
              }`}
              key={group.key}
            >
              {collapsibleGroups && hasChildren ? (
                <button
                  type="button"
                  className="kpi-breakdown__group-head kpi-breakdown__group-toggle"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={expanded}
                >
                  <span className="kpi-breakdown__group-title">
                    <ChevronDown
                      className="kpi-breakdown__group-chevron"
                      size={15}
                      strokeWidth={2}
                    />
                    <span>{itemLabel(group)}</span>
                  </span>

                  {nativeKpiValueVisible(group.value, hideZeroValues) && <strong>
                    {formatNumber(group.value, group.unit)}
                  </strong>}
                </button>
              ) : (
                <div className="kpi-breakdown__group-head">
                  <span>{itemLabel(group)}</span>
                  {nativeKpiValueVisible(group.value, hideZeroValues) && <strong>
                    {formatNumber(group.value, group.unit)}
                  </strong>}
                </div>
              )}

              {expanded && hasChildren && (
                <div className="kpi-breakdown__group-items">
                  {(group.children ?? []).map((item) => item.children?.length ? (
                    <NestedBreakdownRows key={`${group.key}:${item.key}`} item={item} collapsibleGroups={collapsibleGroups} hideZeroValues={hideZeroValues} />
                  ) : (
                    <div
                      className="kpi-breakdown__group-row"
                      key={`${group.key}:${item.key}`}
                    >
                      <span>{itemLabel(item)}</span>
                      {nativeKpiValueVisible(item.value, hideZeroValues) && <strong>
                        {formatNumber(item.value, item.unit)}
                      </strong>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    )
  }

  const maxValue = Math.max(...visibleItems.map((item) => item.value ?? 0), 0)

  return (
    <div className="kpi-breakdown__rows">
      {visibleItems.map((item) => {
        const width =
          maxValue > 0 && item.value != null
            ? Math.max(4, Math.min(100, (item.value / maxValue) * 100))
            : 0

        return (
          <div className="kpi-breakdown__row" key={item.key}>
            <div className="kpi-breakdown__meta">
              <span>{itemLabel(item)}</span>
              {nativeKpiValueVisible(item.value, hideZeroValues) && <strong>{formatNumber(item.value, item.unit)}</strong>}
            </div>

            <div className="kpi-breakdown__track">
              <span style={{ width: `${width}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

type OpenCardDetails = { key: string; origin: 'hover' | 'keyboard' | 'click' }

export function KpiCards({ metrics = [], onDrill, hideZeroValues = false }: { metrics?: Metric[]; onDrill?: (metric: Metric) => void; hideZeroValues?: boolean }) {
  const { config } = useAppConfiguration()
  const settings = config.appearance.card_details ?? { interaction: 'auto', hover_delay_ms: 0, width: 'standard' }
  const enabled = settings.interaction !== 'disabled'
  const [openDetails, setOpenDetails] = useState<OpenCardDetails | null>(null)
  const [canHover, setCanHover] = useState(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches)
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null)
  const cardRefs = useRef<Record<string, HTMLElement | null>>({})
  const panelRef = useRef<HTMLDivElement>(null)
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const hoveredCard = useRef<string | null>(null)
  const focusPanel = useRef(false)
  const restoringFocus = useRef(false)
  const currentOpen = useRef(openDetails)
  currentOpen.current = openDetails
  const panelId = useId()
  const headingId = useId()
  const summaryId = useId()
  const autoHover = enabled && settings.interaction === 'auto' && canHover
  const delay = Number.isInteger(settings.hover_delay_ms) && settings.hover_delay_ms >= 0 && settings.hover_delay_ms <= 1500 ? settings.hover_delay_ms : 0
  const visibleMetrics = useMemo(() => metrics.filter(metric => nativeKpiCardVisible(metric, hideZeroValues)), [metrics, hideZeroValues])
  const openMetric = useMemo(() => visibleMetrics.find(metric => metric.key === openDetails?.key) ?? null, [visibleMetrics, openDetails?.key])
  const openBreakdown = useMemo(() => filterNativeKpiBreakdown(openMetric?.breakdown ?? [], hideZeroValues), [openMetric?.breakdown, hideZeroValues])

  const cancelOpenTimer = useCallback(() => {
    if (openTimer.current !== null) { window.clearTimeout(openTimer.current); openTimer.current = null }
  }, [])
  const cancelCloseTimer = useCallback(() => {
    if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null }
  }, [])
  const cancelTimers = useCallback(() => { cancelOpenTimer(); cancelCloseTimer() }, [cancelOpenTimer, cancelCloseTimer])
  const closeDetails = useCallback((restoreFocus = false) => {
    cancelTimers()
    hoveredCard.current = null
    focusPanel.current = false
    const trigger = currentOpen.current ? cardRefs.current[currentOpen.current.key] : null
    setOpenDetails(null)
    if (restoreFocus && trigger?.isConnected) {
      restoringFocus.current = true
      trigger.focus({ preventScroll: true })
      restoringFocus.current = false
    }
  }, [cancelTimers])

  useEffect(() => {
    const media = window.matchMedia('(hover: hover) and (pointer: fine)')
    const update = () => { cancelTimers(); setCanHover(media.matches) }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [cancelTimers])
  useEffect(() => {
    closeDetails()
    return cancelTimers
  }, [settings.interaction, settings.hover_delay_ms, settings.width, closeDetails, cancelTimers])
  useEffect(() => {
    if (openDetails && (!openMetric || (!openBreakdown.length && !(hideZeroValues && onDrill)))) closeDetails()
    if (hoveredCard.current && !visibleMetrics.some(metric => metric.key === hoveredCard.current && (filterNativeKpiBreakdown(metric.breakdown ?? [], hideZeroValues).length || (hideZeroValues && onDrill)))) {
      hoveredCard.current = null
      cancelOpenTimer()
    }
  }, [visibleMetrics, hideZeroValues, onDrill, openDetails, openMetric, openBreakdown, closeDetails, cancelOpenTimer])

  const scheduleOpen = (key: string) => {
    cancelTimers()
    if (currentOpen.current && currentOpen.current.origin !== 'hover') return
    if (!delay) { setOpenDetails({ key, origin: 'hover' }); return }
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null
      if (hoveredCard.current === key && (!currentOpen.current || currentOpen.current.origin === 'hover')) setOpenDetails({ key, origin: 'hover' })
    }, delay)
  }
  const scheduleClose = (key: string) => {
    cancelCloseTimer()
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      if (currentOpen.current?.key === key && currentOpen.current.origin === 'hover') closeDetails()
    }, 180)
  }
  const activate = (key: string, keyboard = false) => {
    const metric = visibleMetrics.find(item => item.key === key)
    if (canHover && onDrill && metric) { closeDetails(); onDrill(metric); return }
    cancelTimers()
    focusPanel.current = keyboard && canHover && !(currentOpen.current?.key === key && currentOpen.current.origin === 'click')
    setOpenDetails(current => current?.key === key && current.origin === 'click' ? null : { key, origin: 'click' })
  }

  const updatePopoverPosition = useCallback(() => {
    if (!enabled || !canHover || !openDetails) { setPopoverPosition(null); return }
    const card = cardRefs.current[openDetails.key]
    if (!card) return
    const rect = card.getBoundingClientRect()
    const edge = 12
    const gap = 8
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    if (rect.bottom <= 0 || rect.top >= viewportHeight) { closeDetails(); return }
    const width = Math.min(settings.width === 'wide' ? 560 : 390, Math.max(0, viewportWidth - edge * 2))
    const left = Math.max(edge, Math.min(rect.left, viewportWidth - width - edge))
    const availableBelow = Math.max(0, viewportHeight - rect.bottom - gap - edge)
    const availableAbove = Math.max(0, rect.top - gap - edge)
    const placement = availableBelow >= 260 || availableBelow >= availableAbove ? 'bottom' : 'top'
    const maxHeight = Math.max(80, Math.min(430, placement === 'bottom' ? availableBelow : availableAbove))
    setPopoverPosition({ top: placement === 'bottom' ? rect.bottom + gap : undefined, bottom: placement === 'top' ? viewportHeight - rect.top + gap : undefined, left, width, maxHeight, placement })
  }, [enabled, canHover, openDetails?.key, settings.width, closeDetails])
  useLayoutEffect(() => {
    updatePopoverPosition()
    if (!openDetails || !canHover || !enabled) return
    window.addEventListener('resize', updatePopoverPosition)
    window.addEventListener('scroll', updatePopoverPosition, true)
    return () => { window.removeEventListener('resize', updatePopoverPosition); window.removeEventListener('scroll', updatePopoverPosition, true) }
  }, [updatePopoverPosition, openDetails?.key, canHover, enabled])

  useEffect(() => {
    if (!enabled || !openDetails || !openMetric) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeDetails(true) }
    }
    const onOutsidePointer = (event: PointerEvent) => {
      if (!canHover || !(event.target instanceof Node)) return
      const trigger = cardRefs.current[currentOpen.current?.key ?? '']
      if (!panelRef.current?.contains(event.target) && !trigger?.contains(event.target)) closeDetails()
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onOutsidePointer)
    return () => { document.removeEventListener('keydown', onKeyDown, true); document.removeEventListener('pointerdown', onOutsidePointer) }
  }, [enabled, openDetails?.key, openMetric, canHover, closeDetails])

  useLayoutEffect(() => {
    if (!enabled || !canHover || !openDetails || !popoverPosition || !focusPanel.current || !panelRef.current) return
    focusPanel.current = false
    ;(panelRef.current.querySelector<HTMLElement>('button') ?? panelRef.current).focus({ preventScroll: true })
  }, [enabled, canHover, openDetails, popoverPosition !== null])

  useEffect(() => {
    if (!enabled || canHover || !openMetric || !openDetails) return
    const trigger = cardRefs.current[openDetails.key]
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => (panelRef.current?.querySelector<HTMLElement>('button') ?? panelRef.current)?.focus({ preventScroll: true }))
    const onTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(element => element.getClientRects().length > 0)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first) { event.preventDefault(); panelRef.current.focus(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onTab, true)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onTab, true)
      document.body.style.overflow = previousOverflow
      if (trigger?.isConnected) {
        restoringFocus.current = true
        trigger.focus({ preventScroll: true })
        restoringFocus.current = false
      }
    }
  }, [enabled, canHover, openDetails?.key, closeDetails])

  const hasOpenDetails = enabled && openMetric && (openBreakdown.length > 0 || Boolean(hideZeroValues && onDrill))
  const detailsContent = openMetric && <>
    <div className="kpi-breakdown__head"><div><strong id={headingId}>{openMetric.breakdown_title || 'Деталізація'}</strong><span id={summaryId}>{openMetric.label}{nativeKpiValueVisible(openMetric.value, hideZeroValues) && <> · {formatValue(openMetric)}</>}</span></div><button type="button" className="kpi-breakdown__close" onClick={() => closeDetails(true)} aria-label="Закрити деталізацію"><X size={18} /></button></div>
    <BreakdownRows items={openBreakdown} collapsibleGroups={openMetric.key === 'flights' || openMetric.key === 'weighted_efficiency'} hideZeroValues={hideZeroValues} />
    {onDrill && <button className="secondary kpi-details-link" type="button" onClick={() => { closeDetails(); onDrill(openMetric) }}>Детально →</button>}
  </>

  if (hideZeroValues && !visibleMetrics.length) return null

  return <>
    <section className="kpi-grid">
      {visibleMetrics.map(metric => {
        const Icon = iconMap[metric.key as keyof typeof iconMap] ?? Activity
        const hasSecondary = hideZeroValues ? nativeKpiHasSecondary(metric) && nativeKpiValueVisible(metric.secondary_value, true) : metric.secondary_value != null && Boolean(metric.secondary_label)
        const showPrimary = nativeKpiValueVisible(metric.value, hideZeroValues)
        const interactive = enabled && (filterNativeKpiBreakdown(metric.breakdown ?? [], hideZeroValues).length > 0 || Boolean(onDrill && (canHover || hideZeroValues)))
        const expanded = interactive && openDetails?.key === metric.key
        return <article
          ref={node => { cardRefs.current[metric.key] = node }}
          className={`kpi-card kpi-card--${metric.key} ${hasSecondary ? 'kpi-card--split' : ''} ${interactive ? 'kpi-card--interactive' : ''} ${expanded ? 'kpi-card--expanded' : ''}`}
          key={metric.key} tabIndex={interactive ? 0 : undefined} role={interactive ? 'button' : undefined}
          aria-expanded={interactive ? expanded : undefined} aria-controls={expanded ? panelId : undefined} aria-haspopup={interactive ? 'dialog' : undefined}
          onMouseEnter={() => { if (autoHover && interactive) { hoveredCard.current = metric.key; scheduleOpen(metric.key) } }}
          onMouseLeave={() => { if (autoHover && interactive) { hoveredCard.current = null; cancelOpenTimer(); if (currentOpen.current?.key === metric.key && currentOpen.current.origin === 'hover') scheduleClose(metric.key) } }}
          onFocus={event => { if (!restoringFocus.current && autoHover && interactive && event.currentTarget.matches(':focus-visible')) { cancelTimers(); setOpenDetails({ key: metric.key, origin: 'keyboard' }) } }}
          onBlur={event => { if (currentOpen.current?.key === metric.key && currentOpen.current.origin === 'keyboard' && event.relatedTarget instanceof Node && !panelRef.current?.contains(event.relatedTarget)) closeDetails() }}
          onClick={() => { if (interactive) activate(metric.key) }}
          onKeyDown={event => { if (interactive && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); activate(metric.key, true) } }}
        >
          <div className="kpi-card__top"><div className="kpi-card__icon"><Icon size={22} strokeWidth={1.8} /></div><span className="kpi-card__label">{metric.label}</span></div>
          {showPrimary && metric.primary_label && <div className="kpi-card__primary-label">{metric.primary_label}</div>}
          {showPrimary && <div className="kpi-card__value">{formatValue(metric)}</div>}
          {hasSecondary && <div className="kpi-card__secondary"><span>{metric.secondary_label || 'Додаткове значення'}</span><strong>{formatNumber(metric.secondary_value ?? null)}</strong></div>}
          {metric.delta != null && nativeKpiValueVisible(metric.delta, hideZeroValues) && <div className="kpi-card__delta"><span aria-hidden="true">{metric.delta > 0 ? '▲' : metric.delta < 0 ? '▼' : '■'}</span>{metric.delta > 0 ? '+' : ''}{metric.delta}%</div>}
          {interactive && <div className="kpi-card__drill-hint">{autoHover ? 'Наведи або натисни для деталізації' : 'Натисни для деталізації'}</div>}
        </article>
      })}
    </section>
    {hasOpenDetails && canHover && popoverPosition && createPortal(<div
      className={`kpi-breakdown kpi-breakdown--portal-popover kpi-breakdown--${popoverPosition.placement} kpi-card-details kpi-card-details--${settings.width}`}
      ref={panelRef} id={panelId} tabIndex={-1} role="dialog" aria-labelledby={headingId} aria-describedby={summaryId}
      onMouseEnter={cancelCloseTimer} onMouseLeave={() => { if (currentOpen.current?.origin === 'hover') scheduleClose(currentOpen.current.key) }}
      onBlur={event => { const next = event.relatedTarget; if (next instanceof Node && !event.currentTarget.contains(next) && !cardRefs.current[currentOpen.current?.key ?? '']?.contains(next)) closeDetails() }}
      style={{ top: popoverPosition.top, bottom: popoverPosition.bottom, left: popoverPosition.left, width: popoverPosition.width, maxHeight: popoverPosition.maxHeight }}
    >{detailsContent}</div>, document.body)}
    {hasOpenDetails && !canHover && createPortal(<>
      <button type="button" className="kpi-breakdown-backdrop" tabIndex={-1} aria-label="Закрити деталізацію" onClick={() => closeDetails(true)} />
      <div className={`kpi-breakdown kpi-breakdown--sheet kpi-card-details kpi-card-details--${settings.width}`} ref={panelRef} id={panelId} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={headingId} aria-describedby={summaryId}>{detailsContent}</div>
    </>, document.body)}
  </>
}
