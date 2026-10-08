import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Copy, GripVertical, LockKeyhole, Maximize2, Settings2, Trash2 } from 'lucide-react'
import type { WidgetDefinition, WidgetLayout } from '../../lib/biTypes'
import { BI_GRID_COLUMNS, BI_GRID_ROW_HEIGHT, BI_GRID_GAP, changedWidgetLayouts, constrainWidgetLayout, reflowWidgetLayouts } from '../../lib/widgetGrid'
import { useLanguage } from '../../i18n/LanguageContext'
import './bi.css'

export { BI_GRID_COLUMNS, BI_GRID_ROW_HEIGHT, BI_GRID_GAP, constrainWidgetLayout } from '../../lib/widgetGrid'
type Props = {
  widgets: WidgetDefinition[]; editable?: boolean; manageWidgets?: boolean
  canManageWidget?: (widget: WidgetDefinition) => boolean
  canEditWidget?: (widget: WidgetDefinition) => boolean
  canDeleteWidget?: (widget: WidgetDefinition) => boolean
  frameless?: boolean | ((widget: WidgetDefinition) => boolean)
  gap?: number
  rowHeight?: number
  renderWidget: (widget: WidgetDefinition) => ReactNode
  onLayoutChange?: (widgetId: string, layout: WidgetLayout) => void
  onLayoutsChange?: (layouts: Record<string, WidgetLayout>) => void
  onEdit?: (widget: WidgetDefinition) => void; onDuplicate?: (widget: WidgetDefinition) => void; onDelete?: (widget: WidgetDefinition) => void
}
type Interaction = { id: string; mode: 'move' | 'resize'; startX: number; startY: number; columnSize: number; layout: WidgetLayout; pointerId: number }

export function DashboardGrid({ widgets, editable = false, manageWidgets = false, canManageWidget, canEditWidget, canDeleteWidget, frameless = false, gap = BI_GRID_GAP, rowHeight = BI_GRID_ROW_HEIGHT, renderWidget, onLayoutChange, onLayoutsChange, onEdit, onDuplicate, onDelete }: Props) {
  const { tr } = useLanguage()
  const ref = useRef<HTMLDivElement>(null)
  const interaction = useRef<Interaction | null>(null)
  const [draft, setDraft] = useState<{ id: string; layouts: Record<string, WidgetLayout> } | null>(null)
  const draftRef = useRef<typeof draft>(null)
  const spacing = Number.isFinite(gap) ? Math.max(0, Math.min(40, gap)) : BI_GRID_GAP
  const gridRowHeight = Number.isFinite(rowHeight) ? Math.max(20, Math.min(100, rowHeight)) : BI_GRID_ROW_HEIGHT
  const displayed = widgets.map(widget => draft?.layouts[widget.id] ? { ...widget, layout: draft.layouts[widget.id] } : widget)
  const rowCount = Math.max(4, ...displayed.map(widget => widget.layout.y + widget.layout.h))
  const allowed = (widget: WidgetDefinition, mode: Interaction['mode']) => editable && !widget.is_locked && (mode === 'move' ? widget.movable !== false : widget.resizable !== false)
  const publish = (layouts: Record<string, WidgetLayout>) => {
    const changes = changedWidgetLayouts(widgets, layouts)
    if (!Object.keys(changes).length) return
    if (onLayoutsChange) onLayoutsChange(changes)
    else for (const [id, layout] of Object.entries(changes)) onLayoutChange?.(id, layout)
  }
  const begin = (event: PointerEvent<HTMLButtonElement>, widget: WidgetDefinition, mode: Interaction['mode']) => {
    if (!allowed(widget, mode) || !ref.current || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    interaction.current = { id: widget.id, mode, startX: event.clientX, startY: event.clientY, columnSize: (ref.current.clientWidth + spacing) / BI_GRID_COLUMNS, layout: { ...widget.layout }, pointerId: event.pointerId }
  }
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const active = interaction.current
    if (!active || active.pointerId !== event.pointerId) return
    const dx = Math.round((event.clientX - active.startX) / active.columnSize)
    const dy = Math.round((event.clientY - active.startY) / (gridRowHeight + spacing))
    const next = active.mode === 'move' ? { ...active.layout, x: active.layout.x + dx, y: active.layout.y + dy } : { ...active.layout, w: Math.max(1, Math.min(BI_GRID_COLUMNS - active.layout.x, active.layout.w + dx)), h: active.layout.h + dy }
    draftRef.current = { id: active.id, layouts: reflowWidgetLayouts(widgets, { id: active.id, layout: constrainWidgetLayout(next) }, false) }
    setDraft(draftRef.current)
  }
  const finish = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const active = interaction.current
    if (!active || active.pointerId !== event.pointerId) return
    interaction.current = null
    const completed = draftRef.current
    if (!cancel && completed?.id === active.id) {
      const preview = widgets.map(widget => ({ ...widget, layout: completed.layouts[widget.id] ?? widget.layout }))
      publish(reflowWidgetLayouts(preview))
    }
    draftRef.current = null
    setDraft(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, widget: WidgetDefinition, mode: Interaction['mode']) => {
    if (!allowed(widget, mode) || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const dx = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    const dy = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    const layout = widget.layout
    publish(reflowWidgetLayouts(widgets, { id: widget.id, layout: constrainWidgetLayout(mode === 'move' ? { ...layout, x: layout.x + dx, y: layout.y + dy } : { ...layout, w: Math.min(BI_GRID_COLUMNS - layout.x, layout.w + dx), h: layout.h + dy }) }))
  }
  return <div ref={ref} className={`bi-dashboard-grid${editable ? ' bi-dashboard-grid-editable' : ''}`} style={{ height: rowCount * (gridRowHeight + spacing) - spacing, backgroundSize: `calc(100% / ${BI_GRID_COLUMNS}) ${gridRowHeight + spacing}px`, '--bi-grid-row-height': `${gridRowHeight}px` } as CSSProperties}>
    {displayed.map(widget => {
      const layout = constrainWidgetLayout(widget.layout)
      const style: CSSProperties = {
        left: `calc(${layout.x / BI_GRID_COLUMNS * 100}% + ${layout.x * spacing / BI_GRID_COLUMNS}px)`,
        top: layout.y * (gridRowHeight + spacing),
        width: `calc(${layout.w / BI_GRID_COLUMNS * 100}% + ${layout.w * spacing / BI_GRID_COLUMNS - spacing}px)`,
        height: layout.h * (gridRowHeight + spacing) - spacing,
        background: widget.appearance?.background, color: widget.appearance?.color,
        opacity: widget.appearance?.opacity ?? 'var(--ia-widget-opacity, 1)',
        borderRadius: widget.appearance?.radius !== undefined ? `${widget.appearance.radius}px` : 'var(--ia-card-radius, 12px)',
        boxShadow: 'var(--ia-shadow, 0 6px 20px #00000012)',
        '--bi-widget-column-span': layout.w,
      } as CSSProperties
      const bare = !editable && !manageWidgets && (typeof frameless === 'function' ? frameless(widget) : frameless)
      const manageable = !canManageWidget || canManageWidget(widget)
      if (bare) { style.background = 'transparent'; style.border = 0; style.boxShadow = 'none' }
      return <article className={`bi-widget${bare ? ' bi-widget-frameless' : ''}${draft?.id === widget.id ? ' bi-widget-active' : ''}`} key={widget.id} style={style} data-builtin={widget.builtin ?? undefined} aria-label={widget.title}>
        {!bare && <header className="bi-widget-header">
          {allowed(widget, 'move') && <button type="button" className="bi-drag-handle" title={tr('Перемістити. Також доступні клавіші зі стрілками.', 'Move. Arrow keys are also supported.')} aria-label={`${tr('Перемістити', 'Move')} ${widget.title}`} onPointerDown={event => begin(event, widget, 'move')} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onKeyDown={event => keyboard(event, widget, 'move')}><GripVertical size={17} /></button>}
          <h3>{widget.title}</h3>{widget.is_locked && <LockKeyhole size={14} aria-label={tr('Заблоковано', 'Locked')} />}
          {manageWidgets && <div className="bi-widget-actions">{onEdit && (canEditWidget ? canEditWidget(widget) : manageable) && <button type="button" aria-label={`${tr('Налаштувати', 'Configure')} ${widget.title}`} onClick={() => onEdit(widget)}><Settings2 size={15} /></button>}{onDuplicate && manageable && <button type="button" aria-label={`${tr('Дублювати', 'Duplicate')} ${widget.title}`} onClick={() => onDuplicate(widget)}><Copy size={15} /></button>}{onDelete && (canDeleteWidget ? canDeleteWidget(widget) : manageable) && !widget.is_locked && widget.removable !== false && !widget.mandatory && <button type="button" aria-label={`${tr('Видалити', 'Delete')} ${widget.title}`} onClick={() => onDelete(widget)}><Trash2 size={15} /></button>}</div>}
        </header>}
        <div className="bi-widget-content">{renderWidget(widget)}</div>
        {allowed(widget, 'resize') && <button type="button" className="bi-resize-handle" aria-label={`${tr('Змінити розмір', 'Resize')} ${widget.title}`} title={tr('Змінити розмір. Також доступні клавіші зі стрілками.', 'Resize. Arrow keys are also supported.')} onPointerDown={event => begin(event, widget, 'resize')} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onKeyDown={event => keyboard(event, widget, 'resize')}><Maximize2 size={13} /></button>}
      </article>
    })}
  </div>
}
