import type { WidgetDefinition, WidgetLayout } from './biTypes'

export const BI_GRID_COLUMNS = 12
export const BI_GRID_ROW_HEIGHT = 44
export const BI_GRID_GAP = 12
export function constrainWidgetLayout(layout: WidgetLayout): WidgetLayout {
  const round = (value: number, fallback: number) => Number.isFinite(value) ? Math.round(value) : fallback
  const w = Math.max(1, Math.min(BI_GRID_COLUMNS, round(layout.w, 6)))
  return { x: Math.max(0, Math.min(BI_GRID_COLUMNS - w, round(layout.x, 0))), y: Math.max(0, Math.min(10000, round(layout.y, 0))), w, h: Math.max(1, Math.min(100, round(layout.h, 4))) }
}
type GridWidget = Pick<WidgetDefinition, 'id' | 'layout' | 'is_locked' | 'movable' | 'resizable'>
export function layoutsOverlap(a: WidgetLayout, b: WidgetLayout): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}
const sameLayout = (a: WidgetLayout, b: WidgetLayout) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
function firstFree(layout: WidgetLayout, occupied: WidgetLayout[], minimum: number): WidgetLayout | null {
  const candidates = [...new Set([minimum, ...occupied.filter(other => layout.x < other.x + other.w && layout.x + layout.w > other.x).map(other => other.y + other.h)])].filter(y => y >= minimum && y <= 10000).sort((a, b) => a - b)
  for (const y of candidates) { const next = { ...layout, y }; if (!occupied.some(other => layoutsOverlap(next, other))) return next }
  return null
}
/** Move collisions down, then compact movable neighbours without moving pinned cards. */
export function reflowWidgetLayouts(widgets: GridWidget[], change?: { id: string; layout: WidgetLayout }, compactActive = true): Record<string, WidgetLayout> {
  const original = Object.fromEntries(widgets.map(widget => [widget.id, constrainWidgetLayout(widget.layout)]))
  const layouts = Object.fromEntries(Object.entries(original).map(([id, layout]) => [id, { ...layout }]))
  const active = widgets.find(widget => widget.id === change?.id)
  if (active && change) {
    if (active.is_locked) return original
    const requested = constrainWidgetLayout(change.layout)
    layouts[active.id] = {
      ...requested, x: active.movable === false ? original[active.id].x : requested.x,
      y: active.movable === false ? original[active.id].y : requested.y,
      w: active.resizable === false ? original[active.id].w : requested.w,
      h: active.resizable === false ? original[active.id].h : requested.h,
    }
    // A pinned position and a wider requested size must still remain inside the grid.
    layouts[active.id].w = Math.min(layouts[active.id].w, BI_GRID_COLUMNS - layouts[active.id].x)
  }
  const fixed = widgets.filter(widget => widget.id !== active?.id && (widget.is_locked || widget.movable === false))
  const occupied = fixed.map(widget => layouts[widget.id])
  if (active) {
    const next = firstFree(layouts[active.id], occupied, layouts[active.id].y)
    if (!next || (active.movable === false && next.y !== original[active.id].y)) return original
    layouts[active.id] = next
    occupied.push(next)
  }
  const sorted = widgets.filter(widget => widget.id !== active?.id && !fixed.includes(widget)).sort((a, b) => layouts[a.id].y - layouts[b.id].y || layouts[a.id].x - layouts[b.id].x || a.id.localeCompare(b.id))
  for (const widget of sorted) {
    const next = firstFree(layouts[widget.id], occupied, 0)
    if (!next) return original
    layouts[widget.id] = next; occupied.push(next)
  }
  if (active && compactActive && active.movable !== false) {
    const next = firstFree(layouts[active.id], widgets.filter(widget => widget.id !== active.id).map(widget => layouts[widget.id]), 0)
    if (next) layouts[active.id] = next
  }
  return layouts
}
export function changedWidgetLayouts(widgets: GridWidget[], layouts: Record<string, WidgetLayout>): Record<string, WidgetLayout> {
  return Object.fromEntries(widgets.filter(widget => layouts[widget.id] && !sameLayout(widget.layout, layouts[widget.id])).map(widget => [widget.id, layouts[widget.id]]))
}
