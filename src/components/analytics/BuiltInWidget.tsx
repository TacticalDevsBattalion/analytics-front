import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { KpiCards } from '../KpiCards'
import { TimelineChart } from '../TimelineChart'
import { DashboardDistributionChart } from '../DashboardDistributionChart'
import { EventsTable } from '../EventsTable'
import { MapPanel } from '../MapPanel'
import { useLanguage } from '../../i18n/LanguageContext'
import { getFrontendConfig } from '../../config'
import { flightSummaryRows } from '../../lib/flightSummaries'
import { visibleNativeValues } from '../../lib/nativeWidgetPresentation'
import type { EventRow, GeoFeatureCollection, Metric, TimelinePoint } from '../../lib/types'
import type { QueryResult, WidgetDefinition } from '../../lib/biTypes'

export function AverageFlightsPerPosition({ overview, hideZeroValues = false }: { overview?: Metric[]; hideZeroValues?: boolean }) {
  const { tr, locale } = useLanguage()
  const availableRows = overview?.find(item => item.key === 'avg_flights_per_position')?.breakdown ?? []
  const rows = visibleNativeValues(availableRows, hideZeroValues)
  if (!rows.length) return <div className="quick-average-empty">{availableRows.length && hideZeroValues ? tr('Немає ненульових значень', 'No nonzero values') : tr('Немає позицій для розрахунку', 'No positions available for calculation')}</div>
  return <div className="quick-average-grid">{rows.map(item => <div className="quick-average-item" key={item.key} title={`${item.label}: ${item.value}`}><span>{item.label}</span><strong>{item.value == null ? '—' : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(item.value)}</strong><small>{tr('вильотів / позицію', 'flights / position')}</small></div>)}</div>
}

export function LostDevicesList({ rows }: { rows: EventRow[] }) {
  const { tr } = useLanguage()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const order = [...getFrontendConfig().ui.lost_department_order]
  for (const row of rows) if (!order.includes(row.category)) order.push(row.category)
  const groups = order.map(department => ({ department, rows: rows.filter(row => row.category === department) })).filter(group => group.rows.length)
  if (!groups.length) return <div className="losses-empty">{tr('За вибраний період втрат бортів у цих кафедрах немає.', 'No lost devices for these departments in the selected period.')}</div>
  const toggle = (department: string) => setExpanded(current => { const next = new Set(current); if (next.has(department)) next.delete(department); else next.add(department); return next })
  return <div className="losses-groups">{groups.map(group => <section className={`losses-group${expanded.has(group.department) ? ' losses-group--expanded' : ''}`} key={group.department}><button type="button" className="losses-group__head" onClick={() => toggle(group.department)} aria-expanded={expanded.has(group.department)}><div><span>{tr('Кафедра', 'Department')}</span><strong>{group.department}</strong></div><div className="losses-group__summary"><b title={tr('Загальна кількість втрат', 'Total lost devices')}>{group.rows.length}</b><ChevronDown className="losses-group__chevron" size={16} /></div></button>{expanded.has(group.department) && <div className="losses-group__items">{group.rows.map(row => <article className="loss-card" key={row.id}><div className="loss-card__asset"><span>{tr('Засіб', 'Asset')}</span><strong>{row.asset || '—'}</strong></div><div className="loss-card__meta"><div><span>{tr('Позиція', 'Position')}</span><strong>{row.group || '—'}</strong></div><div><span>{tr('Мета вильоту', 'Flight purpose')}</span><strong>{row.purpose || '—'}</strong></div></div></article>)}</div>}</section>)}</div>
}

export function BuiltInWidget({ definition, result, onDrill, onSelect }: { definition: WidgetDefinition; result: QueryResult; onDrill?: (metric: Metric) => void; onSelect?: (field: string, value: unknown) => void }) {
  const payload = result.payload
  const hideZeroValues = definition.visualization.options?.hide_zero_values !== false
  const metrics = Array.isArray(payload) ? payload as Metric[] : []
  switch (definition.builtin) {
    case 'summary': return <KpiCards metrics={metrics.length === 1 ? metrics.map(metric => ({ ...metric, label: definition.title })) : metrics} hideZeroValues={hideZeroValues} onDrill={onDrill} />
    case 'timeline': {
      const type = definition.visualization.type
      const configured = definition.visualization.options?.view
      const view = ['combined', 'bars', 'line', 'area'].includes(String(configured)) ? configured as 'combined' | 'bars' | 'line' | 'area' : type === 'line' ? 'line' : type === 'bar' ? 'bars' : type === 'area' ? 'area' : 'combined'
      return <TimelineChart data={Array.isArray(payload) ? payload as TimelinePoint[] : []} view={view} hideZeroValues={hideZeroValues} onSelect={onSelect} />
    }
    case 'map': {
      const data = payload as { geojson?: GeoFeatureCollection; rows?: EventRow[] } | GeoFeatureCollection | undefined
      const geojson = data && 'type' in data ? data as GeoFeatureCollection : data?.geojson
      return <MapPanel geojson={geojson} rows={data && 'rows' in data ? data.rows ?? [] : []} />
    }
    case 'records': return <EventsTable rows={Array.isArray(payload) ? payload as EventRow[] : []} />
    case 'losses': return <LostDevicesList rows={Array.isArray(payload) ? payload as EventRow[] : []} />
    case 'average': return <AverageFlightsPerPosition overview={metrics} hideZeroValues={hideZeroValues} />
    case 'category': return <DashboardDistributionChart data={flightSummaryRows(metrics, 'category')} hideZeroValues={hideZeroValues} view={definition.visualization.options?.view === 'donut' || definition.visualization.type === 'donut' ? 'donut' : 'bars'} title={definition.title} dimension="category" onSelect={onSelect} />
    case 'purpose': return <DashboardDistributionChart data={flightSummaryRows(metrics, 'purpose')} hideZeroValues={hideZeroValues} view={definition.visualization.options?.view === 'donut' || definition.visualization.type === 'donut' ? 'donut' : 'bars'} title={definition.title} dimension="purpose" onSelect={onSelect} />
    default: return <span>Немає доступного відображення.</span>
  }
}
