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
import { summarizeLosses } from '../../lib/lostDevices'
import { InfoHint } from '../help/InfoHint'
import type { EventRow, GeoFeatureCollection, MapLines, Metric, TimelinePoint } from '../../lib/types'
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
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const groups = summarizeLosses(rows, [...getFrontendConfig().ui.lost_department_order])
  if (!groups.length) return <div className="losses-empty">{tr('За вибраний період втрат бортів у цих кафедрах немає.', 'No lost devices for these departments in the selected period.')}</div>
  const toggle = (department: string) => setCollapsed(current => { const next = new Set(current); if (next.has(department)) next.delete(department); else next.add(department); return next })
  return <div className="losses-groups">{groups.map(group => {
    const expanded = !collapsed.has(group.department)
    // Reusable drones all have one result ("Втрата борту"): a breakdown would repeat it.
    const detailed = group.results.length > 1
    const singleUse = group.spent > 0
    return <section className={`losses-group${expanded ? ' losses-group--expanded' : ''}`} key={group.department}>
      <button type="button" className="losses-group__head" onClick={() => toggle(group.department)} aria-expanded={expanded}>
        <div><span>{tr('Кафедра', 'Department')}</span><strong>{group.department}</strong></div>
        <div className="losses-group__summary">
          {singleUse && <small className="losses-group__spent" title={tr('Засоби, які уразили або знищили ціль, — це не втрати', 'Drones that struck or destroyed the target are not losses')}>{tr('уразили / знищили', 'struck / destroyed')} {group.spent}</small>}
          <b title={tr('Втрачено засобів', 'Lost devices')}>{group.lost}</b><ChevronDown className="losses-group__chevron" size={16} />
        </div>
      </button>
      {expanded && <div className="losses-group__items">
        {detailed && <div className="loss-results">{group.results.map(([result, count]) => <span key={result}>{result} <b>{count}</b></span>)}</div>}
        {!singleUse && group.positions.length > 0 && <div className="loss-results loss-results--positions" aria-label={tr('Втрати за позиціями', 'Losses by position')}><em>{tr('Позиції', 'Positions')}:</em>{group.positions.map(([position, count]) => <span key={position}>{position} <b>{count}</b></span>)}</div>}
        <table className="loss-assets"><thead><tr><th>{tr('Засіб', 'Asset')}</th><th>{tr('Втрачено', 'Lost')}</th>{singleUse && <th>{tr('Уразили / знищили ціль', 'Struck / destroyed target')}<InfoHint title={tr('Не втрати', 'Not losses')}>{tr('Одноразові засоби, які уразили або знищили ціль, виконали завдання. Вони не входять у втрати; тут показано їхню кількість для повноти картини.', 'Single-use drones that struck or destroyed the target did their job. They are not losses; the count is shown for completeness.')}</InfoHint></th>}</tr></thead><tbody>
          {group.assets.map(asset => <tr key={asset.asset}><td><strong>{asset.asset}</strong>{detailed && asset.results.length > 0 && <small>{asset.results.map(([result, count]) => `${result} ${count}`).join(' · ')}</small>}{!singleUse && asset.positions.length > 0 && <small>{asset.positions.map(([position, count]) => `${position} ${count}`).join(' · ')}</small>}</td><td>{asset.lost || '—'}</td>{singleUse && <td className="loss-assets__spent">{asset.spent || '—'}</td>}</tr>)}
        </tbody>{singleUse && <tfoot><tr><td>{tr('Усього використано', 'Used in total')}: {group.lost + group.spent}</td><td>{group.lost}</td><td className="loss-assets__spent">{group.spent}</td></tr></tfoot>}</table>
      </div>}
    </section>
  })}</div>
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
      const data = payload as { geojson?: GeoFeatureCollection; rows?: EventRow[]; lines?: MapLines; coordinates?: boolean } | GeoFeatureCollection | undefined
      const geojson = data && 'type' in data ? data as GeoFeatureCollection : data?.geojson
      const extra = data && !('type' in data) ? data : undefined
      return <MapPanel geojson={geojson} rows={extra?.rows ?? []} lines={extra?.lines} coordinates={extra?.coordinates} />
    }
    case 'records': return <EventsTable rows={Array.isArray(payload) ? payload as EventRow[] : []} />
    case 'losses': return <LostDevicesList rows={Array.isArray(payload) ? payload as EventRow[] : []} />
    case 'average': return <AverageFlightsPerPosition overview={metrics} hideZeroValues={hideZeroValues} />
    case 'category': return <DashboardDistributionChart data={flightSummaryRows(metrics, 'category')} hideZeroValues={hideZeroValues} view={definition.visualization.options?.view === 'donut' || definition.visualization.type === 'donut' ? 'donut' : 'bars'} title={definition.title} dimension="category" onSelect={onSelect} />
    case 'purpose': return <DashboardDistributionChart data={flightSummaryRows(metrics, 'purpose')} hideZeroValues={hideZeroValues} view={definition.visualization.options?.view === 'donut' || definition.visualization.type === 'donut' ? 'donut' : 'bars'} title={definition.title} dimension="purpose" onSelect={onSelect} />
    default: return <span>Немає доступного відображення.</span>
  }
}
