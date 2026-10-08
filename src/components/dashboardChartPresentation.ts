export const dashboardChartPalette = ['#59b8dd', '#bda0ea', '#e5b653', '#5dc3a9', '#ee9380', '#91a9df', '#d991be', '#9abf6c']

export function escapeChartHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] ?? character))
}

export function dashboardCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export function distributionChartEntries(data: [string, number][]) {
  return data.map(([label, value], index) => ({ label, value: dashboardCount(value), index }))
}

export function observeDashboardChartSize(element: HTMLElement, chart: { resize(): void }) {
  let disposed = false
  let pendingFrame: number | null = null
  const resize = () => {
    if (disposed || pendingFrame !== null) return
    pendingFrame = window.requestAnimationFrame(() => {
      pendingFrame = null
      if (!disposed && element.clientWidth > 0 && element.clientHeight > 0) chart.resize()
    })
  }
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
  observer?.observe(element)
  window.addEventListener('resize', resize)
  resize()
  return () => {
    disposed = true
    observer?.disconnect()
    window.removeEventListener('resize', resize)
    if (pendingFrame !== null) window.cancelAnimationFrame(pendingFrame)
  }
}
