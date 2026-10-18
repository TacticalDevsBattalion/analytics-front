// Map hover card for a struck or destroyed target: its state and every strike in order.
export type TargetStrike = { time: string; status: 'affected' | 'destroyed'; result: string; crew: string; position: string; category: string; device: string; purpose: string; grid_ref: string }
export type TargetProperties = Record<string, unknown> & { history?: unknown }

export const TARGET_COLORS = { affected: '#f59e0b', destroyed: '#ef4444' } as const

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))

export function targetHistory(properties: TargetProperties): TargetStrike[] {
  // MapLibre keeps nested values of features as JSON strings.
  const raw = properties.history
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed as TargetStrike[] : []
  } catch { return [] }
}

export function targetPopupHtml(properties: TargetProperties) {
  const history = targetHistory(properties)
  const destroyed = properties.status === 'destroyed'
  const affected = Number(properties.affected_count ?? history.filter(item => item.status === 'affected').length)
  const title = [properties.class_name, properties.target_id].filter(Boolean).map(escape).join(' · ') || 'Ціль'
  const summary = destroyed
    ? affected ? `Уражено ${affected} ${affected === 1 ? 'раз' : affected < 5 ? 'рази' : 'разів'}, потім знищено` : 'Знищено'
    : `Уражено ${affected} ${affected === 1 ? 'раз' : affected < 5 ? 'рази' : 'разів'}`
  const rows = history.map(item => `<li class="map-target__strike map-target__strike--${item.status === 'destroyed' ? 'destroyed' : 'affected'}"><b>${escape(item.result || (item.status === 'destroyed' ? 'Знищено' : 'Уражено'))}</b><span>${escape(item.time)}</span><small>${[item.crew && `екіпаж ${item.crew}`, item.position, item.category].filter(Boolean).map(escape).join(' · ')}</small></li>`).join('')
  return `<div class="map-target">
    <div class="map-target__head"><i style="background:${destroyed ? TARGET_COLORS.destroyed : TARGET_COLORS.affected}"></i><strong>${title}</strong></div>
    <div class="map-target__status">${escape(summary)}</div>
    ${properties.location_name ? `<div class="map-target__meta">${escape(properties.location_name)}</div>` : ''}
    <div class="map-target__meta">${escape(properties.grid_ref)}</div>
    ${rows ? `<ol class="map-target__history">${rows}</ol>` : ''}
    ${properties.history_truncated ? '<small class="map-target__meta">Показано останні 50 записів</small>' : ''}
  </div>`
}
