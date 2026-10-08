import { useEffect, useId, useMemo, useRef } from 'react'
import * as echarts from '../lib/echarts'
import { useLanguage } from '../i18n/LanguageContext'
import { chartTheme } from '../lib/chartTheme'
import { dashboardChartPalette, escapeChartHtml, observeDashboardChartSize } from './dashboardChartPresentation'
import { nativeDistributionEntries } from '../lib/nativeWidgetPresentation'
import './DashboardCharts.css'

export type DashboardDistributionChartProps = {
  data: [string, number][]
  view: 'bars' | 'donut'
  title: string
  onSelect?: (field: string, value: unknown) => void
  dimension?: string
  hideZeroValues?: boolean
}

export function DashboardDistributionChart({ data, view, title, onSelect, dimension = 'category', hideZeroValues = false }: DashboardDistributionChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const descriptionId = useId()
  const { tr, locale } = useLanguage()
  const number = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }), [locale])
  const entries = useMemo(() => nativeDistributionEntries(data, hideZeroValues), [data, hideZeroValues])
  const available = entries.filter((entry) => entry.value !== null)
  const total = available.reduce((sum, entry) => sum + (entry.value ?? 0), 0)
  const hasPositive = available.some((entry) => (entry.value ?? 0) > 0)
  const showChart = available.length > 0 && (view === 'bars' || hasPositive)
  const chartHeight = view === 'bars' ? Math.max(285, Math.min(520, entries.length * 29 + 76)) : undefined

  useEffect(() => {
    if (!ref.current || !showChart) return
    const element = ref.current
    const chart = echarts.init(element)
    chart.on('click', (event: { dataIndex?: number }) => { const entry = (view === 'bars' ? entries : available)[event.dataIndex ?? -1]; if (entry) onSelect?.(dimension, entry.label) })
    const hasZoom = view === 'bars' && entries.length > 14
    const countLabel = tr('Кількість', 'Count')
    const formatValue = (value: number | null) => value === null ? '—' : number.format(value)
    const theme = chartTheme()
    const tooltip = {
      backgroundColor: theme.tooltipBg, borderColor: theme.tooltipBorder, textStyle: { color: theme.text1 },
      confine: true,
    }
    if (view === 'bars') {
      chart.setOption({
        animationDuration: 300,
        backgroundColor: 'transparent',
        aria: { enabled: false },
        grid: { left: 12, right: hasZoom ? 42 : 22, top: 8, bottom: 38, containLabel: true },
        tooltip: {
          ...tooltip,
          trigger: 'item',
          formatter: (parameter: { dataIndex?: number }) => {
            const entry = entries[parameter.dataIndex ?? 0]
            return entry ? `${escapeChartHtml(entry.label)}<br/>${escapeChartHtml(countLabel)}: <b>${escapeChartHtml(formatValue(entry.value))}</b>` : ''
          },
        },
        xAxis: {
          type: 'value', minInterval: 1,
          axisLabel: { color: theme.text3, fontSize: theme.fontXs },
          splitLine: { lineStyle: { color: theme.axisLine, opacity: 0.5 } },
        },
        yAxis: {
          type: 'category', inverse: true,
          data: entries.map((entry) => entry.label),
          axisTick: { show: false }, axisLine: { show: false },
          axisLabel: { color: theme.text2, fontSize: 11, width: 135, overflow: 'truncate' },
        },
        dataZoom: hasZoom ? [{ type: 'slider', yAxisIndex: 0, right: 2, width: 14, start: 0, end: Math.min(100, 1400 / entries.length), filterMode: 'none', showDetail: false }] : [],
        series: [{
          name: countLabel, type: 'bar', barMaxWidth: 18,
          data: entries.map((entry) => ({ value: entry.value, itemStyle: { color: dashboardChartPalette[entry.index % dashboardChartPalette.length] } })),
          label: { show: true, position: 'right', color: theme.text2, fontSize: theme.fontXs, formatter: (parameter: { dataIndex?: number }) => formatValue(entries[parameter.dataIndex ?? 0]?.value ?? null) },
          itemStyle: { borderRadius: [0, 4, 4, 0] },
        }],
      })
    } else {
      chart.setOption({
        animationDuration: 300,
        backgroundColor: 'transparent',
        color: dashboardChartPalette,
        aria: { enabled: false },
        tooltip: {
          ...tooltip,
          trigger: 'item',
          formatter: (parameter: { dataIndex?: number }) => {
            const entry = available[parameter.dataIndex ?? 0]
            return entry ? `${escapeChartHtml(entry.label)}<br/>${escapeChartHtml(countLabel)}: <b>${escapeChartHtml(formatValue(entry.value))}</b>` : ''
          },
        },
        legend: { type: 'scroll', bottom: 2, left: 6, right: 6, textStyle: { color: theme.text2, fontSize: theme.fontXs }, pageTextStyle: { color: theme.text2 }, pageIconColor: theme.accent, pageIconInactiveColor: '#4a5b6b', formatter: (name: string) => name.length > 35 ? `${name.slice(0, 32)}…` : name },
        series: [{
          name: title, type: 'pie', radius: ['38%', '67%'], center: ['50%', '43%'],
          avoidLabelOverlap: true, minShowLabelAngle: 8,
          label: { show: false },
          emphasis: { label: { show: true, formatter: '{c}', color: theme.text1, fontSize: 16, fontWeight: 600, position: 'center' } },
          data: available.map((entry) => ({ name: entry.label, value: entry.value, itemStyle: { color: dashboardChartPalette[entry.index % dashboardChartPalette.length] } })),
        }],
      })
    }
    const stopObserving = observeDashboardChartSize(element, chart)
    return () => { stopObserving(); chart.dispose() }
  }, [entries, view, showChart, tr, number, title, onSelect, dimension])

  return <div className="dashboard-chart">
    <p className="dashboard-chart__summary" id={descriptionId}>
      {tr('Кількість записів', 'Record count')}: {number.format(total)} · {tr('Груп', 'Groups')}: {number.format(entries.length)}
      {entries.length !== available.length ? ` · ${tr('Є недоступні значення', 'Some values are unavailable')}` : ''}
    </p>
    {showChart ? <div ref={ref} className="dashboard-chart__canvas" style={chartHeight ? { height: chartHeight } : undefined} role="img" aria-label={`${title}: ${view === 'bars' ? tr('стовпчики', 'bars') : tr('кільцева діаграма', 'donut chart')}`} aria-describedby={descriptionId} />
      : <p className="dashboard-chart__empty" role="status">{hideZeroValues && data.length > 0 && entries.length === 0 ? tr('Немає ненульових значень', 'No nonzero values') : available.length > 0 ? tr('Усі значення дорівнюють нулю', 'All values are zero') : tr('Немає даних за вибраний період', 'No data for the selected period')}</p>}
    {entries.length > 0 && <details className="dashboard-chart__data">
      <summary>{tr('Переглянути всі дані таблицею', 'View all data as a table')} ({number.format(entries.length)})</summary>
      <div className="dashboard-chart__table-wrap" tabIndex={0} role="region" aria-label={tr('Дані графіка', 'Chart data')}>
        <table className="dashboard-chart__table">
          <caption>{title}</caption>
          <thead><tr><th scope="col">{tr('Група', 'Group')}</th><th scope="col">{tr('Кількість', 'Count')}</th></tr></thead>
          <tbody>{entries.map((entry) => <tr key={entry.index}><th scope="row">{onSelect ? <button type="button" onClick={() => onSelect(dimension, entry.label)}>{entry.label || tr('Без назви', 'Unnamed')}</button> : entry.label || tr('Без назви', 'Unnamed')}</th><td>{entry.value === null ? '—' : number.format(entry.value)}</td></tr>)}</tbody>
        </table>
      </div>
    </details>}
  </div>
}
