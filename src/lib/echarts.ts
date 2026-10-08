// Tree-shaken ECharts: register only the charts and components the app uses
// instead of importing the whole `echarts` bundle.
import { use, init as rawInit, graphic } from 'echarts/core'
import { applyChartFont, readChartFont } from './chartFont'
import {
  BarChart, LineChart, PieChart, GaugeChart, ScatterChart,
  RadarChart, HeatmapChart, TreemapChart, CustomChart,
} from 'echarts/charts'
import {
  AriaComponent, DataZoomComponent, GridComponent, LegendComponent,
  RadarComponent, TitleComponent, TooltipComponent, VisualMapComponent,
  MarkLineComponent, MarkPointComponent, MarkAreaComponent,
} from 'echarts/components'
import { LabelLayout, UniversalTransition } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'

use([
  BarChart, LineChart, PieChart, GaugeChart, ScatterChart,
  RadarChart, HeatmapChart, TreemapChart, CustomChart,
  AriaComponent, DataZoomComponent, GridComponent, LegendComponent,
  RadarComponent, TitleComponent, TooltipComponent, VisualMapComponent,
  MarkLineComponent, MarkPointComponent, MarkAreaComponent,
  LabelLayout, UniversalTransition, CanvasRenderer,
])

/**
 * Charts pick up the widget's font settings from the nearest `[data-chart-font]` ancestor,
 * so every chart builder gets them without being edited individually.
 */
const init = ((dom: HTMLElement, ...rest: unknown[]) => {
  const chart = (rawInit as (...args: unknown[]) => ReturnType<typeof rawInit>)(dom, ...rest)
  const scope = dom.closest<HTMLElement>('[data-chart-font]')
  if (scope) {
    const font = readChartFont({ chart_font_size: scope.dataset.chartFont || undefined, chart_font_bold: scope.dataset.chartBold === 'true' })
    const original = chart.setOption.bind(chart)
    chart.setOption = ((option: never, ...args: never[]) => (original as (...a: unknown[]) => void)(applyChartFont(option, font), ...args)) as typeof chart.setOption
  }
  return chart
}) as typeof rawInit

export { init, graphic }
export type { EChartsOption, SeriesOption, CustomSeriesOption } from 'echarts'
