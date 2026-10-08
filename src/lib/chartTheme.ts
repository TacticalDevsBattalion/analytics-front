/**
 * Neutral chart colours and text sizes, read from the design tokens (src/styles/tokens.css).
 * Series/data colours stay in dashboardChartPresentation.ts; this only covers axes, grid,
 * tooltips and legend text so charts follow the same palette as the rest of the UI.
 */
export type ChartTheme = {
  text1: string
  text2: string
  text3: string
  tooltipBg: string
  tooltipBorder: string
  axisLine: string
  splitLine: string
  accent: string
  /** px; matches --fs-xs / --fs-sm */
  fontXs: number
  fontSm: number
}

function cssVar(name: string, fallback: string) {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function cssPx(name: string, fallback: number) {
  const parsed = Number.parseFloat(cssVar(name, String(fallback)))
  return Number.isFinite(parsed) ? parsed : fallback
}

let cached: ChartTheme | null = null

/** Call after the tokens change at runtime (e.g. a theme switch) so charts re-read them. */
export function resetChartTheme() {
  cached = null
}

export function chartTheme(): ChartTheme {
  if (cached) return cached
  const theme: ChartTheme = {
    text1: cssVar('--text-1', '#e6eef6'),
    text2: cssVar('--text-2', '#b3c3d1'),
    text3: cssVar('--text-3', '#8fa5b7'),
    tooltipBg: cssVar('--bg-3', '#112433'),
    tooltipBorder: cssVar('--border-3', '#2a4560'),
    axisLine: cssVar('--border-3', '#2a4560'),
    splitLine: cssVar('--border-1', '#172b3b'),
    accent: cssVar('--accent', '#4a9bff'),
    fontXs: cssPx('--fs-xs', 11),
    fontSm: cssPx('--fs-sm', 12),
  }
  if (typeof document !== 'undefined') cached = theme
  return theme
}
