import { useEffect, useId, useMemo, useRef } from 'react'
import * as echarts from '../lib/echarts'
import type { TimelinePoint } from '../lib/types'
import { useLanguage } from '../i18n/LanguageContext'
import { getFrontendConfig } from '../config'
import { chartTheme } from '../lib/chartTheme'
import { escapeChartHtml, observeDashboardChartSize } from './dashboardChartPresentation'
import { nativePlotValue, nativeTimelineTotal, nativeTimelineValues, visibleNativeTimeline } from '../lib/nativeWidgetPresentation'
import './DashboardCharts.css'

function LegacyTimelineChart({ data = [], hideZeroValues = false, onSelect }: { data?: TimelinePoint[]; hideZeroValues?: boolean; onSelect?: (field: string, value: unknown) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const { tr } = useLanguage()

  useEffect(() => {
    if (!ref.current) return

    const chart = echarts.init(ref.current)
    chart.on('click', (event: { dataIndex?: number }) => { const point = data[event.dataIndex ?? -1]; if (point) onSelect?.('date', point.date) })

    const timelineConfig = getFrontendConfig().ui.timeline
    const dayLabel = tr('День', 'Day')
    const nightLabel = tr('Ніч', 'Night')
    const dayEfficiencyLabel = tr('Еф. день', 'Day eff.')
    const nightEfficiencyLabel = tr('Еф. ніч', 'Night eff.')

    const values = data.map(nativeTimelineValues)
    const dayValues = values.map(value => value.day)
    const nightValues = values.map(value => value.night)
    const dayEfficiency = values.map(value => value.dayEfficiency)
    const nightEfficiency = values.map(value => value.nightEfficiency)
    const legendValues = new Map([[dayLabel, dayValues], [nightLabel, nightValues], [dayEfficiencyLabel, dayEfficiency], [nightEfficiencyLabel, nightEfficiency]])

    const theme = chartTheme()
    chart.setOption({
      animationDuration: 450,
      backgroundColor: 'transparent',

      legend: {
        top: 0,
        right: 10,
        itemWidth: 11,
        itemHeight: 8,
        itemGap: 12,
        textStyle: {
          color: theme.text3,
          fontSize: theme.fontXs,
        },
        data: [
          dayLabel,
          nightLabel,
          dayEfficiencyLabel,
          nightEfficiencyLabel,
        ].filter(label => !hideZeroValues || !legendValues.get(label)?.every(value => value === 0)),
      },

      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        textStyle: { color: theme.text1 },
        formatter: (params: any) => {
          const rows = Array.isArray(params) ? params : [params]
          const index = Number(rows[0]?.dataIndex ?? 0)

          const point = values[index]
          if (!point) return ''
          const entries = [
            { label: tr(`День ${timelineConfig.day_start}–${timelineConfig.night_start}`, `Day ${timelineConfig.day_start}–${timelineConfig.night_start}`), value: point.day },
            { label: tr('Ефективність дня', 'Day efficiency'), value: point.dayEfficiency, percent: true },
            { label: tr(`Ніч ${timelineConfig.night_start}–${timelineConfig.day_start}`, `Night ${timelineConfig.night_start}–${timelineConfig.day_start}`), value: point.night },
            { label: tr('Ефективність ночі', 'Night efficiency'), value: point.nightEfficiency, percent: true },
            { label: tr('Всього вильотів', 'Total flights'), value: point.total },
          ].filter(entry => !hideZeroValues || entry.value !== 0)
          return [`<strong>${escapeChartHtml(data[index]?.date ?? rows[0]?.axisValue)}</strong>`,
            ...entries.map(entry => `${escapeChartHtml(entry.label)}: <b>${entry.value === null ? '—' : entry.percent ? `${entry.value.toFixed(1)}%` : entry.value}</b>`),
          ].join('<br/>')
        },
      },

      grid: {
        left: 42,
        right: 46,
        top: 46,
        bottom: 34,
      },

      xAxis: {
        type: 'category',
        data: data.map((x) => x.date.slice(5)),
        axisLine: { lineStyle: { color: theme.axisLine } },
        axisLabel: { color: theme.text3 },
      },

      yAxis: [
        {
          type: 'value',
          minInterval: 1,
          splitLine: { lineStyle: { color: theme.splitLine } },
          axisLabel: { color: theme.text3 },
        },
        {
          type: 'value',
          min: 0,
          max: 100,
          interval: 25,
          splitLine: { show: false },
          axisLabel: {
            color: theme.text3,
            formatter: '{value}%',
          },
        },
      ],

      series: [
        {
          name: dayLabel,
          type: 'bar',
          stack: 'flights',
          yAxisIndex: 0,
          barMaxWidth: 28,
          data: dayValues,
          itemStyle: {
            color: '#d7a83b',
            borderRadius: [0, 0, 3, 3],
          },
          emphasis: { focus: 'series' },
        },
        {
          name: nightLabel,
          type: 'bar',
          stack: 'flights',
          yAxisIndex: 0,
          barMaxWidth: 28,
          data: nightValues,
          itemStyle: {
            color: '#416ea8',
            borderRadius: [3, 3, 0, 0],
          },
          emphasis: { focus: 'series' },
        },
        {
          name: dayEfficiencyLabel,
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          data: dayEfficiency,
          lineStyle: {
            width: 2,
            color: '#f0c45e',
          },
          itemStyle: {
            color: '#f0c45e',
          },
        },
        {
          name: nightEfficiencyLabel,
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          data: nightEfficiency,
          lineStyle: {
            width: 2,
            color: '#78a9e6',
          },
          itemStyle: {
            color: '#78a9e6',
          },
        },
      ].filter(series => !hideZeroValues || !series.data.every(value => value === 0)).map(series => ({ ...series, data: series.data.map(value => nativePlotValue(value, hideZeroValues)) })),
    })

    const stopObserving = observeDashboardChartSize(ref.current, chart)

    return () => {
      stopObserving()
      chart.dispose()
    }
  }, [data, tr, onSelect, hideZeroValues])

  return <div ref={ref} className="chart" role="img" aria-label={tr('Комбінований графік за періодом', 'Combined timeline chart')} />
}

export type TimelineChartView = 'combined' | 'bars' | 'line' | 'area'

function CountTimelineChart({ data, view, descriptionId, hideZeroValues, onSelect }: { data: TimelinePoint[]; view: Exclude<TimelineChartView, 'combined'>; descriptionId: string; hideZeroValues: boolean; onSelect?: (field: string, value: unknown) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const { tr, locale } = useLanguage()
  const number = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }), [locale])

  useEffect(() => {
    if (!ref.current || data.length === 0) return
    const element = ref.current
    const chart = echarts.init(element)
    chart.on('click', (event: { dataIndex?: number }) => { const point = data[event.dataIndex ?? -1]; if (point) onSelect?.('date', point.date) })
    const totalLabel = tr('Всього', 'Total')
    const dayLabel = tr('День', 'Day')
    const nightLabel = tr('Ніч', 'Night')
    const rows = data.map(point => ({ date: point.date, ...nativeTimelineValues(point) }))
    const formatValue = (value: number | null) => value === null ? '—' : number.format(value)
    const dayValues = rows.map((row) => row.day)
    const nightValues = rows.map((row) => row.night)
    const totalValues = rows.map(row => row.total)
    const legendValues = new Map([[totalLabel, totalValues], [dayLabel, dayValues], [nightLabel, nightValues]])
    const theme = chartTheme()
    chart.setOption({
      animationDuration: 300, backgroundColor: 'transparent', aria: { enabled: false },
      legend: {
        type: 'scroll', top: 0, left: 5, right: 5,
        itemWidth: 11, itemHeight: 8, itemGap: 12,
        textStyle: { color: theme.text2, fontSize: 11 },
        pageTextStyle: { color: theme.text2 }, pageIconColor: theme.accent,
        data: (view === 'bars' ? [dayLabel, nightLabel] : [totalLabel, dayLabel, nightLabel]).filter(label => !hideZeroValues || !legendValues.get(label)?.every(value => value === 0)),
      },
      tooltip: {
        trigger: 'axis', confine: true,
        backgroundColor: theme.tooltipBg, borderColor: theme.tooltipBorder, textStyle: { color: theme.text1 },
        formatter: (parameters: { dataIndex?: number } | { dataIndex?: number }[]) => {
          const parametersArray = Array.isArray(parameters) ? parameters : [parameters]
          const row = rows[parametersArray[0]?.dataIndex ?? 0]
          return row ? [`<strong>${escapeChartHtml(row.date)}</strong>`,
            ...[{ label: totalLabel, value: row.total }, { label: dayLabel, value: row.day }, { label: nightLabel, value: row.night }]
              .filter(entry => !hideZeroValues || entry.value !== 0)
              .map(entry => `${escapeChartHtml(entry.label)}: <b>${escapeChartHtml(formatValue(entry.value))}</b>`),
          ].join('<br/>') : ''
        },
      },
      grid: { left: 42, right: 15, top: 46, bottom: 34 },
      xAxis: {
        type: 'category', boundaryGap: view === 'bars', data: rows.map((point) => point.date.slice(5)),
        axisLine: { lineStyle: { color: theme.axisLine } }, axisLabel: { color: theme.text3, fontSize: theme.fontXs, hideOverlap: true },
      },
      yAxis: {
        type: 'value', minInterval: 1,
        splitLine: { lineStyle: { color: theme.splitLine } }, axisLabel: { color: theme.text3, fontSize: theme.fontXs },
      },
      series: (view === 'bars' ? [
        { name: dayLabel, type: 'bar', stack: 'flights', barMaxWidth: 28, data: dayValues, itemStyle: { color: '#e5b653', borderRadius: [0, 0, 3, 3] }, emphasis: { focus: 'series' } },
        { name: nightLabel, type: 'bar', stack: 'flights', barMaxWidth: 28, data: nightValues, itemStyle: { color: '#91a9df', borderRadius: [3, 3, 0, 0] }, emphasis: { focus: 'series' } },
      ] : [
        { name: totalLabel, values: totalValues, color: '#59b8dd' },
        { name: dayLabel, values: dayValues, color: '#e5b653' },
        { name: nightLabel, values: nightValues, color: '#91a9df' },
      ].map((series) => ({
        name: series.name, type: 'line', smooth: false, connectNulls: false,
        symbol: 'circle', symbolSize: 5, showSymbol: data.length < 32,
        data: series.values, lineStyle: { width: 2, color: series.color }, itemStyle: { color: series.color },
        ...(view === 'area' ? { areaStyle: { color: series.color, opacity: 0.13 } } : {}),
        emphasis: { focus: 'series' },
      }))).filter(series => !hideZeroValues || !series.data.every(value => value === 0)).map(series => ({ ...series, data: series.data.map(value => nativePlotValue(value, hideZeroValues)) })),
    })
    const stopObserving = observeDashboardChartSize(element, chart)
    return () => { stopObserving(); chart.dispose() }
  }, [data, view, tr, number, onSelect, hideZeroValues])

  const label = view === 'bars' ? tr('Стовпчики', 'Bars') : view === 'area' ? tr('Графік з областями', 'Area chart') : tr('Лінійний графік', 'Line chart')
  return <div ref={ref} className="chart dashboard-chart__canvas" role="img" aria-label={`${tr('Динаміка за періодом', 'Timeline')}: ${label}`} aria-describedby={descriptionId} />
}

export function TimelineChart({ data = [], view = 'combined', hideZeroValues = false, onSelect }: { data?: TimelinePoint[]; view?: TimelineChartView; hideZeroValues?: boolean; onSelect?: (field: string, value: unknown) => void }) {
  const descriptionId = useId()
  const { tr, locale } = useLanguage()
  const number = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }), [locale])
  const combined = view === 'combined'
  const visibleData = useMemo(() => visibleNativeTimeline(data, view, hideZeroValues), [data, view, hideZeroValues])
  const total = nativeTimelineTotal(data)
  return <div className="dashboard-chart">
    <p className="dashboard-chart__summary" id={descriptionId}>
      {tr('Дат', 'Dates')}: {number.format(visibleData.length)} · {tr('Всього вильотів', 'Total flights')}: {total === null ? '—' : number.format(total)}
    </p>
    {visibleData.length === 0 ? <p className="dashboard-chart__empty" role="status">{data.length && hideZeroValues ? tr('Немає ненульових значень', 'No nonzero values') : tr('Немає даних за вибраний період', 'No data for the selected period')}</p>
      : combined ? <LegacyTimelineChart data={visibleData} hideZeroValues={hideZeroValues} onSelect={onSelect} /> : <CountTimelineChart data={visibleData} view={view} descriptionId={descriptionId} hideZeroValues={hideZeroValues} onSelect={onSelect} />}
    <details className="dashboard-chart__data">
      <summary>{tr('Переглянути всі дані таблицею', 'View all data as a table')} ({number.format(visibleData.length)})</summary>
      <div className="dashboard-chart__table-wrap" tabIndex={0} role="region" aria-label={tr('Дані графіка', 'Chart data')}>
        <table className="dashboard-chart__table">
          <caption>{tr('Динаміка за вибраний період', 'Timeline for the selected period')}</caption>
          <thead><tr><th scope="col">{tr('Дата', 'Date')}</th><th scope="col">{tr('Всього', 'Total')}</th><th scope="col">{tr('День', 'Day')}</th><th scope="col">{tr('Ніч', 'Night')}</th></tr></thead>
          <tbody>{visibleData.map((point, index) => {
            const pointValues = nativeTimelineValues(point)
            const values = [pointValues.total, pointValues.day, pointValues.night]
            return <tr key={`${point.date}-${index}`}><th scope="row">{onSelect ? <button type="button" onClick={() => onSelect('date', point.date)}>{point.date}</button> : point.date}</th>{values.map((value, valueIndex) => <td key={valueIndex}>{hideZeroValues && value === 0 ? '' : value === null ? '—' : number.format(value)}</td>)}</tr>
          })}
            {visibleData.length === 0 && <tr><td colSpan={4}>{data.length && hideZeroValues ? tr('Немає ненульових значень', 'No nonzero values') : tr('Немає даних', 'No data')}</td></tr>}
          </tbody>
        </table>
      </div>
    </details>
  </div>
}
