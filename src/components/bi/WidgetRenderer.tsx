import { chartTheme } from '../../lib/chartTheme'
import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as echarts from '../../lib/echarts'
import { useLanguage } from '../../i18n/LanguageContext'
import { dashboardChartPalette, escapeChartHtml, observeDashboardChartSize } from '../dashboardChartPresentation'
import type { MetricFormat, MetricResultMetadata, QueryResult, VisualizationSeries, WidgetDefinition } from '../../lib/biTypes'
import { readChartFont } from '../../lib/chartFont'
import { dimensionTitle, filterZeroWidgetRows, hasNumericWidgetRows, hidesZeroWidgetValues, nonZeroWidgetMetrics, totalHighlightValues } from '../../lib/widgetPresentation'
import './bi.css'

export type WidgetRendererProps = { definition: WidgetDefinition; result?: QueryResult; loading?: boolean; error?: string; onRetry?: () => void; builtinRenderer?: () => ReactNode; onDatumClick?: (row: Record<string, unknown>) => void }
type Presentation = { definition: WidgetDefinition; result: QueryResult; locale: string; noData: string; onDatumClick?: WidgetRendererProps['onDatumClick'] }
type ChartBuilder = (presentation: Presentation) => echarts.EChartsOption

const finite = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null
const plottedValue = (context: Presentation, value: unknown): number | null => hidesZeroWidgetValues(context.definition) && value === 0 ? null : finite(value)
const text = (value: unknown): string => value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)
export function formatWidgetValue(value: unknown, format: MetricFormat | undefined, locale: string): string {
  const number = finite(value)
  if (number === null) return '—'
  const decimals = Math.max(0, Math.min(10, Number.isInteger(format?.decimals) ? Number(format?.decimals) : 2))
  return `${format?.prefix ?? ''}${new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(number)}${format?.suffix || (format?.type === 'percent' || format?.type === 'percentage' ? '%' : '')}`
}
const configuredType = (widget: WidgetDefinition) => (widget.visualization.type || widget.widget_type).toLowerCase()
const metricsFor = ({ definition, result }: Presentation): MetricResultMetadata[] => definition.query.metrics.map(reference => result.metrics.find(metric => metric.key === reference.key) ?? { key: reference.key, title: reference.key })
const seriesFor = (context: Presentation): VisualizationSeries[] => metricsFor(context).map(metric => context.definition.visualization.series?.find(series => series.metric === metric.key) ?? { metric: metric.key })
const metricTitle = (context: Presentation, key: string) => context.result.metrics.find(metric => metric.key === key)?.title ?? context.result.metrics.find(metric => metric.key === key)?.label ?? key
const metricFormat = (context: Presentation, key: string) => context.result.metrics.find(metric => metric.key === key)?.format
const optionsFor = (context: Presentation) => context.definition.visualization.options ?? {}
const labelsFor = (context: Presentation) => context.result.rows.map(row => (context.result.dimensions.length ? context.result.dimensions.map(dimension => text(row[dimension])).join(' · ') : metricTitle(context, context.definition.query.metrics[0]?.key ?? '')))

function chartBase(context: Presentation): echarts.EChartsOption {
  return {
    backgroundColor: 'transparent', color: dashboardChartPalette, animationDuration: 250,
    textStyle: { color: chartTheme().text2, fontFamily: 'inherit' },
    legend: { show: context.definition.visualization.legend?.show !== false, top: 0, textStyle: { color: chartTheme().text2 } },
    tooltip: {
      show: context.definition.visualization.tooltip?.show !== false, confine: true,
      backgroundColor: chartTheme().tooltipBg, borderColor: chartTheme().tooltipBorder, textStyle: { color: chartTheme().text1 },
      formatter: ((parameter: unknown) => {
        const parameters = Array.isArray(parameter) ? parameter : [parameter]
        return parameters.map(item => {
          const entry = item as { name?: string; seriesName?: string; value?: unknown; data?: { rowIndex?: number }; dataIndex?: number; seriesIndex?: number }
          const row = context.result.rows[entry.data?.rowIndex ?? entry.dataIndex ?? -1]
          if (hidesZeroWidgetValues(context.definition) && row && ['scatter', 'radar', 'heatmap'].includes(configuredType(context.definition))) {
            return [escapeChartHtml(labelsFor(context)[entry.data?.rowIndex ?? entry.dataIndex ?? -1] ?? ''), ...metricsFor(context).filter(metric => row[metric.key] !== 0).map(metric => `${escapeChartHtml(metric.title ?? metric.label ?? metric.key)}: <b>${escapeChartHtml(formatWidgetValue(row[metric.key], metric.format, context.locale))}</b>`)].join('<br/>')
          }
          const metric = seriesFor(context)[entry.seriesIndex ?? -1]?.metric
          if (hidesZeroWidgetValues(context.definition) && (entry.value === 0 || (row && metric && row[metric] === 0))) return ''
          const value = Array.isArray(entry.value) ? entry.value.map(text).join(' · ') : text(entry.value)
          return `${escapeChartHtml(entry.name ?? '')}<br/>${escapeChartHtml(entry.seriesName ?? '')}: <b>${escapeChartHtml(value)}</b>`
        }).join('<br/>')
      }) as never,
    },
  }
}

function cartesian(context: Presentation): echarts.EChartsOption {
  const type = configuredType(context.definition)
  const horizontal = type === 'horizontal_bar'
  const stacked = ['stacked_bar', 'percent_stacked_bar', 'stacked_area'].includes(type)
  const series = seriesFor(context)
  const categoryAxis = { type: 'category' as const, data: labelsFor(context), axisLabel: { color: chartTheme().text3, hideOverlap: true }, axisTick: { show: false } }
  const axes = context.definition.visualization.axes ?? {}
  const left = typeof axes.left === 'object' && axes.left ? axes.left as Record<string, unknown> : axes
  const right = typeof axes.right === 'object' && axes.right ? axes.right as Record<string, unknown> : {}
  const valueAxis = { type: 'value' as const, min: finite(left.minimum) ?? undefined, max: finite(left.maximum) ?? (type === 'percent_stacked_bar' ? 100 : undefined), name: typeof left.title === 'string' ? left.title : undefined, axisLabel: { color: chartTheme().text3 }, splitLine: { lineStyle: { color: chartTheme().axisLine, opacity: 0.5 } } }
  return {
    ...chartBase(context), grid: { top: 45, left: 12, right: 25, bottom: 28, containLabel: true },
    tooltip: { ...(chartBase(context).tooltip as object), trigger: 'axis' },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : [valueAxis, { ...valueAxis, min: finite(right.minimum) ?? undefined, max: finite(right.maximum) ?? undefined, name: typeof right.title === 'string' ? right.title : undefined, position: 'right', show: series.some(item => item.axis === 'right'), splitLine: { show: false } }],
    series: series.map(item => {
      const isLine = item.type === 'line' || (!item.type && ['line', 'multi_line', 'area', 'stacked_area', 'timeline'].includes(type))
      const values = context.result.rows.map(row => {
        const value = finite(row[item.metric])
        if (hidesZeroWidgetValues(context.definition) && value === 0) return null
        if (type !== 'percent_stacked_bar' || value === null) return value
        const total = series.reduce((sum, entry) => sum + Math.abs(finite(row[entry.metric]) ?? 0), 0)
        return total ? value / total * 100 : 0
      })
      return {
        name: item.name || metricTitle(context, item.metric), type: isLine ? 'line' : 'bar', data: values,
        yAxisIndex: horizontal ? 0 : item.axis === 'right' ? 1 : 0,
        stack: stacked ? 'values' : undefined, barMaxWidth: 38, connectNulls: false,
        smooth: optionsFor(context).smooth === true,
        areaStyle: ['area', 'stacked_area'].includes(type) ? { opacity: 0.2 } : undefined,
        itemStyle: item.color ? { color: item.color } : undefined,
        label: { show: context.definition.visualization.labels?.show === true, color: chartTheme().text2 },
      }
    }) as echarts.SeriesOption[],
  }
}
function pie(context: Presentation): echarts.EChartsOption {
  const metrics = seriesFor(context)
  return { ...chartBase(context), series: metrics.map((series, seriesIndex) => ({ type: 'pie' as const, name: series.name || metricTitle(context, series.metric), radius: configuredType(context.definition) === 'donut' ? [`${32 / Math.max(1, metrics.length)}%`, `${68 / Math.max(1, metrics.length)}%`] : `${68 / Math.max(1, metrics.length)}%`, center: [`${(seriesIndex + 0.5) / metrics.length * 100}%`, '55%'], label: { show: context.definition.visualization.labels?.show !== false }, data: context.result.rows.flatMap((row, index) => { const value = plottedValue(context, row[series.metric]); return value === null ? [] : [{ name: `${labelsFor(context)[index]} · ${metricTitle(context, series.metric)}`, value, rowIndex: index }] }) })) }
}
function gauge(context: Presentation): echarts.EChartsOption {
  const metric = seriesFor(context)[0]?.metric
  const minimum = finite(optionsFor(context).minimum) ?? 0
  const maximum = finite(optionsFor(context).maximum) ?? 100
  return { ...chartBase(context), series: [{ type: 'gauge', min: minimum, max: maximum > minimum ? maximum : minimum + 1, progress: { show: true }, detail: { color: chartTheme().text1, fontSize: 25, formatter: (value: number) => formatWidgetValue(value, metricFormat(context, metric), context.locale) }, data: [{ value: finite(context.result.rows[0]?.[metric]) ?? 0, name: metricTitle(context, metric) }] }] }
}
function scatter(context: Presentation): echarts.EChartsOption {
  const metrics = seriesFor(context)
  return { ...chartBase(context), grid: { top: 40, left: 12, right: 12, bottom: 25, containLabel: true }, xAxis: { type: 'value', name: metricTitle(context, metrics[0]?.metric), axisLabel: { color: chartTheme().text3 } }, yAxis: { type: 'value', name: metricTitle(context, metrics[1]?.metric), axisLabel: { color: chartTheme().text3 } }, series: [{ type: 'scatter', symbolSize: 12, data: context.result.rows.flatMap((row, index) => { const x = finite(row[metrics[0]?.metric]); const y = finite(row[metrics[1]?.metric]); return x === null || y === null ? [] : [{ value: [x, y], rowIndex: index }] }) }] }
}
function radar(context: Presentation): echarts.EChartsOption {
  const metrics = seriesFor(context)
  return { ...chartBase(context), radar: { indicator: metrics.map(item => ({ name: metricTitle(context, item.metric), max: finite(optionsFor(context).maximum) ?? Math.max(1, ...context.result.rows.map(row => finite(row[item.metric]) ?? 0)) })) }, series: [{ type: 'radar', data: context.result.rows.flatMap((row, index) => metrics.every(metric => finite(row[metric.metric]) !== null) ? [{ name: labelsFor(context)[index], value: metrics.map(metric => finite(row[metric.metric]) as number), rowIndex: index }] : []) }] }
}
function heatmap(context: Presentation): echarts.EChartsOption {
  const [xKey, yKey] = context.result.dimensions
  const metric = seriesFor(context)[0]?.metric
  const xs = [...new Set(context.result.rows.map(row => text(row[xKey])))]
  const ys = [...new Set(context.result.rows.map(row => text(row[yKey])))]
  const rows = context.result.rows.flatMap((row, index) => { const value = plottedValue(context, row[metric]); return value === null ? [] : [{ value: [xs.indexOf(text(row[xKey])), ys.indexOf(text(row[yKey])), value], rowIndex: index }] })
  return { ...chartBase(context), grid: { top: 25, left: 10, right: 10, bottom: 60, containLabel: true }, xAxis: { type: 'category', data: xs, name: dimensionTitle(context.result, xKey, context.locale) }, yAxis: { type: 'category', data: ys, name: dimensionTitle(context.result, yKey, context.locale) }, visualMap: { min: Math.min(0, ...rows.map(row => row.value[2])), max: Math.max(1, ...rows.map(row => row.value[2])), calculable: true, orient: 'horizontal', bottom: 0, textStyle: { color: chartTheme().text3 } }, series: [{ type: 'heatmap', data: rows }] }
}
function treemap(context: Presentation): echarts.EChartsOption {
  const metric = seriesFor(context)[0]?.metric
  return { ...chartBase(context), series: [{ type: 'treemap', roam: false, breadcrumb: { show: false }, data: context.result.rows.flatMap((row, index) => { const value = plottedValue(context, row[metric]); return value === null ? [] : [{ name: labelsFor(context)[index], value, rowIndex: index }] }) }] }
}
function totalWithHighlight(context: Presentation): echarts.EChartsOption {
  const options = optionsFor(context)
  const totalKey = typeof options.total_metric === 'string' ? options.total_metric : 'target_results'
  const highlightKey = typeof options.highlight_metric === 'string' ? options.highlight_metric : 'target_destroyed'
  const color = context.definition.visualization.series?.find(series => series.metric === highlightKey)?.color ?? '#ee9380'
  const values = context.result.rows.map(row => totalHighlightValues(row, totalKey, highlightKey))
  const overlay: echarts.CustomSeriesOption = {
    type: 'custom', name: metricTitle(context, highlightKey), z: 3, itemStyle: { color }, encode: { x: [0, 2], y: 1 },
    data: values.flatMap((value, index) => value && (!hidesZeroWidgetValues(context.definition) || value.highlight !== 0) ? [{ value: [value.start, index, value.total], rowIndex: index }] : []),
    renderItem: (params, api) => {
      const start = api.coord([api.value(0), api.value(1)]), end = api.coord([api.value(2), api.value(1)])
      const height = Math.min(38, ((api.size?.([0, 1]) as number[] | undefined)?.[1] ?? 54) * 0.7)
      const coord = params.coordSys as unknown as { x: number; y: number; width: number; height: number }
      const shape = echarts.graphic.clipRectByRect({ x: start[0], y: start[1] - height / 2, width: Math.max(0, end[0] - start[0]), height }, coord)
      return shape ? { type: 'rect', shape, style: { fill: color } } : undefined
    },
  }
  return {
    ...chartBase(context), grid: { top: 38, left: 10, right: 18, bottom: 20, containLabel: true },
    xAxis: { type: 'value', min: 0, axisLabel: { color: chartTheme().text3 }, splitLine: { lineStyle: { color: chartTheme().axisLine, opacity: 0.5 } } },
    yAxis: { type: 'category', data: labelsFor(context), axisLabel: { color: chartTheme().text3 }, axisTick: { show: false } },
    tooltip: { ...(chartBase(context).tooltip as object), trigger: 'axis', formatter: ((parameters: unknown) => {
      const entry = (Array.isArray(parameters) ? parameters[0] : parameters) as { dataIndex?: number; data?: { rowIndex?: number } }
      const index = entry?.data?.rowIndex ?? entry?.dataIndex ?? 0
      const row = context.result.rows[index] ?? {}
      const keys = [...new Set([totalKey, highlightKey, ...(finite(row.target_affected) === null ? [] : ['target_affected'])])].filter(key => !hidesZeroWidgetValues(context.definition) || row[key] !== 0)
      return [escapeChartHtml(labelsFor(context)[index] ?? ''), ...keys.map(key => `${escapeChartHtml(metricTitle(context, key))}: <b>${escapeChartHtml(formatWidgetValue(row[key], metricFormat(context, key), context.locale))}</b>`)].join('<br/>')
    }) as never },
    series: [
      ...(!hidesZeroWidgetValues(context.definition) || context.result.rows.some(row => row[totalKey] !== 0) ? [{ type: 'bar' as const, name: metricTitle(context, totalKey), z: 1, barMaxWidth: 38, barWidth: '70%', data: values.map((value, index) => ({ value: value?.total ?? null, rowIndex: index })) }] : []),
      ...(!hidesZeroWidgetValues(context.definition) || context.result.rows.some(row => row[highlightKey] !== 0) ? [overlay] : []),
    ],
  }
}
const chartRegistry = new Map<string, ChartBuilder>()
for (const type of ['bar', 'vertical_bar', 'horizontal_bar', 'grouped_bar', 'stacked_bar', 'percent_stacked_bar', 'line', 'multi_line', 'area', 'stacked_area', 'combo', 'timeline']) chartRegistry.set(type, cartesian)
for (const type of ['pie', 'donut']) chartRegistry.set(type, pie)
chartRegistry.set('gauge', gauge); chartRegistry.set('scatter', scatter); chartRegistry.set('radar', radar); chartRegistry.set('heatmap', heatmap); chartRegistry.set('treemap', treemap)
chartRegistry.set('total_with_highlight', totalWithHighlight)
export function registerWidgetVisualization(type: string, builder: ChartBuilder) { chartRegistry.set(type, builder) }

function QueryTable({ context, ranked = false }: { context: Presentation; ranked?: boolean }) {
  const metrics = hidesZeroWidgetValues(context.definition) ? nonZeroWidgetMetrics(context.result, metricsFor(context)) : metricsFor(context)
  const hideZeros = hidesZeroWidgetValues(context.definition)
  const hiddenTitle = context.locale.startsWith('uk') ? 'Нульове значення приховано' : 'Zero value hidden'
  return <div className="bi-table-scroll" tabIndex={0}><table className="bi-table"><thead><tr>{ranked && <th>#</th>}{context.result.dimensions.map(key => <th key={key}>{dimensionTitle(context.result, key, context.locale)}</th>)}{metrics.map(metric => <th key={metric.key}>{metric.title ?? metric.label ?? metric.key}</th>)}</tr></thead><tbody>{context.result.rows.map((row, index) => <tr key={index} className={context.onDatumClick ? 'bi-datum-clickable' : undefined} tabIndex={context.onDatumClick ? 0 : undefined} onClick={context.onDatumClick ? () => context.onDatumClick?.(row) : undefined} onKeyDown={context.onDatumClick ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); context.onDatumClick?.(row) } } : undefined}>{ranked && <td>{index + 1}</td>}{context.result.dimensions.map(key => <td key={key}>{text(row[key])}</td>)}{metrics.map(metric => <td key={metric.key} title={hideZeros && row[metric.key] === 0 ? hiddenTitle : undefined}>{hideZeros && row[metric.key] === 0 ? '' : formatWidgetValue(row[metric.key], metric.format, context.locale)}</td>)}</tr>)}</tbody></table></div>
}
function SafeMarkdown({ value }: { value: string }) {
  return <div className="bi-text">{value.split('\n').map((line, index) => {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    const content = (heading?.[2] ?? line).split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) => part.startsWith('**') && part.endsWith('**') ? <strong key={partIndex}>{part.slice(2, -2)}</strong> : part)
    return heading ? <h3 key={index}>{content}</h3> : <p key={index}>{content.length ? content : '\u00a0'}</p>
  })}</div>
}
function Chart({ context, builder }: { context: Presentation; builder: ChartBuilder }) {
  const ref = useRef<HTMLDivElement>(null)
  const contextRef = useRef(context)
  contextRef.current = context
  // Layout previews change card geometry, but the resize observer handles that
  // without rebuilding every chart on each pointer movement.
  const option = useMemo(() => builder(context), [builder, context.result, context.locale, context.definition.visualization, context.definition.widget_type, context.definition.query.metrics, context.definition.title])
  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current)
    try { chart.setOption(option) } catch (reason) { chart.dispose(); throw reason }
    const disposeObserver = observeDashboardChartSize(ref.current, chart)
    chart.on('click', event => {
      const current = contextRef.current
      const datum = event.data as { rowIndex?: number } | undefined
      const index = datum?.rowIndex ?? event.dataIndex
      if (typeof index === 'number' && current.result.rows[index]) current.onDatumClick?.(current.result.rows[index])
    })
    return () => { disposeObserver(); chart.dispose() }
  }, [option])
  return <><div className="bi-chart" ref={ref} role="img" aria-label={context.definition.title} /><details className="bi-chart-data"><summary>{context.locale.startsWith('uk') ? 'Дані графіка' : 'Chart data'}</summary><QueryTable context={context} /></details></>
}
class WidgetBoundary extends Component<{ children: ReactNode; resetKey: unknown }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  componentDidUpdate(previous: { resetKey: unknown }) { if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: false }) }
  render() { return this.state.error ? <p className="bi-state bi-state-error" role="alert">Не вдалося показати віджет / Unable to render widget</p> : this.props.children }
}
export function WidgetRenderer(props: WidgetRendererProps) {
  const font = readChartFont(props.definition.visualization.options)
  // `display: contents` keeps the widget layout unchanged; the key rebuilds charts when the font changes.
  return <div key={`${font.size}:${font.bold}`} style={{ display: 'contents' }} data-chart-font={font.size ?? ''} data-chart-bold={font.bold}><WidgetRendererContent {...props} /></div>
}
function WidgetRendererContent({ definition, result: originalResult, loading, error, onRetry, builtinRenderer, onDatumClick }: WidgetRendererProps) {
  const { tr, locale } = useLanguage()
  const hideZeros = hidesZeroWidgetValues(definition)
  const type = configuredType(definition)
  const result = useMemo(() => hideZeros && originalResult && !definition.builtin ? filterZeroWidgetRows(originalResult, definition.query.metrics) : originalResult, [originalResult, hideZeros, definition.builtin, definition.query.metrics])
  // Coordinate charts need their configured axes even when an axis is entirely zero.
  const displayedDefinition = useMemo(() => hideZeros && result && !definition.builtin && !['scatter', 'radar'].includes(type) ? { ...definition, query: { ...definition.query, metrics: nonZeroWidgetMetrics(result, definition.query.metrics) } } : definition, [definition, result, hideZeros, type])
  const context = useMemo<Presentation>(() => ({ definition: displayedDefinition, result: result ?? { status: 'empty', rows: [], metrics: [], dimensions: [] }, locale, noData: tr('Немає даних', 'No data'), onDatumClick: definition.interaction?.click_action === 'NONE' ? undefined : onDatumClick }), [definition, displayedDefinition, result, locale, tr, onDatumClick])
  if (type === 'text' || type === 'markdown') return <SafeMarkdown value={String(definition.visualization.options?.text ?? '')} />
  if (loading) return <p className="bi-state" role="status">{tr('Завантаження…', 'Loading…')}</p>
  if (error || result?.status === 'error') return <div className="bi-state bi-state-error" role="alert"><p>{error || result?.message || tr('Помилка віджета', 'Widget error')}</p>{onRetry && <button type="button" className="secondary" onClick={onRetry}>{tr('Повторити', 'Retry')}</button>}</div>
  if (result?.payload !== undefined && builtinRenderer) return <WidgetBoundary resetKey={result}>{builtinRenderer()}</WidgetBoundary>
  const hasMain = result && hasNumericWidgetRows(result.rows, displayedDefinition.query.metrics)
  const hasSeparate = result && hasNumericWidgetRows(result.separate_rows ?? [], displayedDefinition.query.metrics)
  if (!result || (!hasMain && !hasSeparate)) return <p className="bi-state" role="status">{hideZeros && originalResult && (hasNumericWidgetRows(originalResult.rows, definition.query.metrics) || hasNumericWidgetRows(originalResult.separate_rows ?? [], definition.query.metrics)) ? tr('Немає ненульових значень за вибраний період', 'No nonzero values for the selected period') : tr('Немає даних за вибраний період', 'No data for the selected period')}</p>
  const metrics = metricsFor(context)
  let content: ReactNode
  if (!hasMain || (type === 'gauge' && plottedValue(context, result.rows[0]?.[seriesFor(context)[0]?.metric]) === null)) content = hasSeparate ? null : <p className="bi-state" role="status">{hideZeros && result.rows[0]?.[seriesFor(context)[0]?.metric] === 0 ? tr('Немає ненульових значень за вибраний період', 'No nonzero values for the selected period') : tr('Немає даних за вибраний період', 'No data for the selected period')}</p>
  else if (['number', 'number_card', 'kpi', 'kpi_card', 'progress'].includes(type)) content = <div className="bi-number-cards">{result.rows.flatMap((row, rowIndex) => metrics.flatMap(metric => { const value = finite(row[metric.key]); if (hideZeros && value === 0) return []; const maximum = finite(optionsFor(context).maximum) ?? 100; return <div className={`bi-number${context.onDatumClick ? ' bi-datum-clickable' : ''}`} role={context.onDatumClick ? 'button' : undefined} tabIndex={context.onDatumClick ? 0 : undefined} onClick={context.onDatumClick ? () => context.onDatumClick?.(row) : undefined} onKeyDown={context.onDatumClick ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); context.onDatumClick?.(row) } } : undefined} key={`${rowIndex}:${metric.key}`}><span>{context.result.dimensions.length > 0 && `${labelsFor(context)[rowIndex]} · `}{metric.title ?? metric.label ?? metric.key}</span><strong>{formatWidgetValue(value, metric.format, locale)}</strong>{type === 'progress' && value !== null && <progress value={value} max={maximum > 0 ? maximum : 100} />}</div> }))}</div>
  else if (type === 'table' || type === 'ranked_table') content = <QueryTable context={context} ranked={type === 'ranked_table'} />
  else { const builder = chartRegistry.get(type); content = builder ? <Chart context={context} builder={builder} /> : <p className="bi-state" role="status">{tr('Невідомий тип візуалізації', 'Unknown visualization type')}: {type}</p> }
  return <WidgetBoundary resetKey={result}>{content}{hasSeparate && <section className="bi-separate-categories" aria-label={tr('Окремі категорії', 'Separate categories')}><h4>{tr('Окремі категорії', 'Separate categories')}</h4><QueryTable context={{ ...context, result: { ...result, rows: result.separate_rows ?? [] } }} ranked={type === 'ranked_table'} /></section>}</WidgetBoundary>
}
