import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = stripTypeScriptTypes(await readFile(new URL('../src/components/dashboardChartPresentation.ts', import.meta.url), 'utf8'), { mode: 'strip' })
const { escapeChartHtml, dashboardCount, distributionChartEntries, observeDashboardChartSize } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('chart tooltips escape all source text that could become HTML', () => {
  assert.equal(escapeChartHtml('<img src=x onerror="alert(1)"> & \'quoted\''), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;quoted&#39;')
  assert.equal(escapeChartHtml(null), '')
  assert.equal(escapeChartHtml('Мета <1>'), 'Мета &lt;1&gt;')
})

test('count presentation preserves zero and distinguishes invalid or missing values', () => {
  assert.equal(dashboardCount(0), 0)
  assert.equal(dashboardCount(12), 12)
  for (const value of [null, undefined, '', '1', -1, NaN, Infinity]) assert.equal(dashboardCount(value), null)
})

test('distribution presentation keeps every group and original order including duplicate labels and zero counts', () => {
  const data = Array.from({ length: 25 }, (_, index) => [index % 2 ? 'Спільна назва' : `Група ${index}`, index])
  const entries = distributionChartEntries(data)
  assert.equal(entries.length, 25)
  assert.deepEqual(entries.map((entry) => [entry.label, entry.value]), data)
  assert.equal(entries[0].value, 0)
  assert.equal(entries[24].index, 24)
})

test('chart resize observer responds to widget resizing and cancels callbacks after unmount', () => {
  const previousWindow = globalThis.window
  const previousObserver = globalThis.ResizeObserver
  let frame = null
  let observation = null
  let removed = false
  let disconnected = false
  let resizeCount = 0
  const element = { clientWidth: 600, clientHeight: 285 }
  try {
    globalThis.window = {
      requestAnimationFrame(callback) { frame = callback; return 1 },
      cancelAnimationFrame() { frame = null },
      addEventListener() {},
      removeEventListener() { removed = true },
    }
    globalThis.ResizeObserver = class {
      constructor(callback) { observation = callback }
      observe(observed) { assert.equal(observed, element) }
      disconnect() { disconnected = true }
    }
    const cleanup = observeDashboardChartSize(element, { resize() { resizeCount += 1 } })
    const firstFrame = frame
    frame = null
    firstFrame()
    assert.equal(resizeCount, 1)
    element.clientWidth = 390
    observation()
    const nextFrame = frame
    frame = null
    nextFrame()
    assert.equal(resizeCount, 2)
    observation()
    const queuedFrame = frame
    cleanup()
    assert.equal(frame, null)
    assert.equal(disconnected, true)
    assert.equal(removed, true)
    queuedFrame()
    assert.equal(resizeCount, 2)
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    if (previousObserver === undefined) delete globalThis.ResizeObserver
    else globalThis.ResizeObserver = previousObserver
  }
})
