// Map hover card for a struck or destroyed target: its state and every strike in order.
export type TargetStrike = { time: string; status: 'affected' | 'destroyed'; result: string; crew: string; position: string; category: string; device: string; purpose: string; grid_ref: string }
export type TargetProperties = Record<string, unknown> & { history?: unknown }

export const TARGET_COLORS = { affected: '#f59e0b', destroyed: '#ef4444' } as const

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))

const times = (count: number) => `${count} ${count % 10 === 1 && count % 100 !== 11 ? 'раз' : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'рази' : 'разів'}`

export function targetHistory(properties: TargetProperties): TargetStrike[] {
  // MapLibre keeps nested values of features as JSON strings.
  const raw = properties.history
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed as TargetStrike[] : []
  } catch { return [] }
}

export function targetPopupHtml(properties: TargetProperties, options: { back?: boolean } = {}) {
  const history = targetHistory(properties)
  const destroyed = properties.status === 'destroyed'
  const affected = Number(properties.affected_count ?? history.filter(item => item.status === 'affected').length)
  const title = [properties.class_name, properties.target_id].filter(Boolean).map(escape).join(' · ') || 'Ціль'
  const summary = destroyed ? affected ? `Уражено ${times(affected)}, потім знищено` : 'Знищено' : `Уражено ${times(affected)}`
  const rows = history.map(item => `<li class="map-target__strike map-target__strike--${item.status === 'destroyed' ? 'destroyed' : 'affected'}"><b>${escape(item.result || (item.status === 'destroyed' ? 'Знищено' : 'Уражено'))}</b><span>${escape(item.time)}</span><small>${[item.crew && `екіпаж ${item.crew}`, item.position, item.category].filter(Boolean).map(escape).join(' · ')}</small></li>`).join('')
  return `<div class="map-target">
    ${options.back ? '<button type="button" class="map-target__back" data-action="back">← До списку</button>' : ''}
    <div class="map-target__head"><i style="background:${destroyed ? TARGET_COLORS.destroyed : TARGET_COLORS.affected}"></i><strong>${title}</strong></div>
    <div class="map-target__status">${escape(summary)}</div>
    ${properties.location_name ? `<div class="map-target__meta">${escape(properties.location_name)}</div>` : ''}
    <div class="map-target__meta">${escape(properties.grid_ref)}</div>
    ${rows ? `<ol class="map-target__history">${rows}</ol>` : ''}
    ${properties.history_truncated ? '<small class="map-target__meta">Показано останні 50 записів</small>' : ''}
  </div>`
}

// Destroyed first, then the most struck, then the latest.
export function sortTargets<T extends { properties: TargetProperties }>(features: T[]): T[] {
  return [...features].sort((left, right) => {
    const a = left.properties, b = right.properties
    return Number(b.status === 'destroyed') - Number(a.status === 'destroyed') || Number(b.strikes ?? 1) - Number(a.strikes ?? 1) || String(b.timestamp ?? '').localeCompare(String(a.timestamp ?? ''))
  })
}

export function targetListHtml(features: { properties: TargetProperties }[], total = features.length) {
  const destroyed = features.filter(feature => feature.properties.status === 'destroyed').length
  const rows = features.map((feature, index) => {
    const p = feature.properties
    const isDestroyed = p.status === 'destroyed'
    const affected = Number(p.affected_count ?? 0)
    const state = isDestroyed ? affected ? `Знищено після ${times(affected)}` : 'Знищено' : `Уражено ${times(affected || 1)}`
    const title = [p.class_name, p.target_id].filter(Boolean).map(escape).join(' · ') || 'Ціль'
    return `<li><button type="button" data-index="${index}"><i style="background:${isDestroyed ? TARGET_COLORS.destroyed : TARGET_COLORS.affected}"></i><span><b>${title}</b><small>${escape(state)}${p.timestamp ? ` · ${escape(String(p.timestamp).slice(5, 16))}` : ''}</small></span></button></li>`
  }).join('')
  return `<div class="map-target map-target--list">
    <div class="map-target__list-head"><strong>Цілей: ${total}</strong><span>знищено ${destroyed}${total > features.length ? ` з показаних ${features.length}` : ''}</span></div>
    <ol class="map-target__list">${rows}</ol>
    <button type="button" class="map-target__zoom" data-action="zoom">Наблизити</button>
  </div>`
}
