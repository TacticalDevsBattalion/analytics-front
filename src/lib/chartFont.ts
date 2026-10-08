/** Per-widget chart typography. Pure helpers: this file must only use `import type`. */
export const CHART_FONT_SIZES = [10, 12, 14, 16, 18, 20, 24] as const

export type ChartFont = { size: number | null; bold: boolean }

export function readChartFont(options: Record<string, unknown> | undefined | null): ChartFont {
  const raw = Number(options?.chart_font_size)
  const size = Number.isFinite(raw) && raw >= 8 && raw <= 32 ? Math.round(raw) : null
  return { size, bold: options?.chart_font_bold === true }
}

const TEXT_KEYS = new Set(['textStyle', 'axisLabel', 'label', 'nameTextStyle', 'pageTextStyle', 'subtextStyle'])

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype

/** Returns a copy of an ECharts option with the requested font applied to every text element. */
export function applyChartFont<T>(option: T, font: ChartFont): T {
  if (font.size === null && !font.bold) return option
  const style = (current: Record<string, unknown>) => ({
    ...current,
    ...(font.size !== null ? { fontSize: font.size } : {}),
    ...(font.bold ? { fontWeight: 'bold' } : {}),
  })
  const walk = (value: unknown, key?: string): unknown => {
    if (Array.isArray(value)) return value.map(item => walk(item))
    if (!isPlain(value)) return value
    const result: Record<string, unknown> = {}
    for (const [name, child] of Object.entries(value)) result[name] = walk(child, name)
    if (key && TEXT_KEYS.has(key)) return style(result)
    if (key === 'legend' && !isPlain(result.textStyle)) result.textStyle = style({})
    if (result.type === 'pie' && !isPlain(result.label)) result.label = style({})
    return result
  }
  const root = walk(option) as Record<string, unknown>
  root.textStyle = style(isPlain(root.textStyle) ? root.textStyle : {})
  return root as T
}
