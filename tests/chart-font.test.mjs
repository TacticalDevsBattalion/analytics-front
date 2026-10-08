import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/chartFont.ts', import.meta.url), 'utf8'), { mode: 'strip' })
const { applyChartFont, readChartFont } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('font options are validated', () => {
  assert.deepEqual(readChartFont(undefined), { size: null, bold: false })
  assert.deepEqual(readChartFont({ chart_font_size: 16, chart_font_bold: true }), { size: 16, bold: true })
  assert.deepEqual(readChartFont({ chart_font_size: 3 }), { size: null, bold: false })
  assert.deepEqual(readChartFont({ chart_font_size: '14', chart_font_bold: 'yes' }), { size: 14, bold: false })
})

test('default font leaves the option untouched', () => {
  const option = { series: [] }
  assert.equal(applyChartFont(option, { size: null, bold: false }), option)
})

test('font is applied to all text elements without mutating the input', () => {
  const option = {
    legend: { top: 0 },
    xAxis: { axisLabel: { color: '#fff', fontSize: 10 } },
    tooltip: { textStyle: { color: '#eee' }, formatter: () => 'x' },
    series: [{ type: 'pie', data: [{ value: 1, name: 'a' }] }, { type: 'bar', label: { show: true } }],
  }
  const copy = structuredClone({ ...option, tooltip: { textStyle: option.tooltip.textStyle } })
  const result = applyChartFont(option, { size: 16, bold: true })
  assert.equal(result.textStyle.fontSize, 16)
  assert.equal(result.legend.textStyle.fontSize, 16)
  assert.equal(result.xAxis.axisLabel.fontSize, 16)
  assert.equal(result.xAxis.axisLabel.color, '#fff')
  assert.equal(result.tooltip.textStyle.fontWeight, 'bold')
  assert.equal(typeof result.tooltip.formatter, 'function')
  assert.equal(result.series[0].label.fontSize, 16)
  assert.equal(result.series[1].label.show, true)
  assert.equal(result.series[1].label.fontSize, 16)
  assert.equal(option.xAxis.axisLabel.fontSize, 10)
  assert.deepEqual(copy.tooltip.textStyle, { color: '#eee' })
})
