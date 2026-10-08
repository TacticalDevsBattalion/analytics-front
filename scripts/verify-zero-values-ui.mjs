// Run only against scripts.integrated_smoke_server and its isolated .smoke databases.
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const base = process.env.UI_VERIFY_URL || 'http://127.0.0.1:5189'
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('Zero-value verification requires the isolated localhost fixture')
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const output = path.join(workspace, '.smoke', 'ui-zero-values')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ ...(process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH } : {}), headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'uk-UA' })
const page = await context.newPage()
page.setDefaultTimeout(20000)
page.setDefaultNavigationTimeout(30000)
const checks = [], errors = [], failures = [], cleanupErrors = []
page.on('pageerror', error => errors.push(error.message))
page.on('response', response => { if (response.url().includes('/api/') && response.status() >= 400) failures.push({ path: new URL(response.url()).pathname, status: response.status() }) })
const record = text => { checks.push(text); console.log(text) }
const json = async response => {
  assert.ok(response.ok(), `${response.url()} returned ${response.status()}: ${await response.text()}`)
  return response.json()
}
const request = async (url, method = 'get', data) => json(await context.request[method](`${base}${url}`, { ...(data === undefined ? {} : { data }), ...(method === 'get' ? {} : { headers: { Origin: base } }) }))
const analytics = (suffix, method = 'get', data) => request(`/api/v1/analytics${suffix}`, method, data)
const adminMetrics = () => request('/api/v1/admin/bi/metrics')
const widget = title => page.locator('.bi-widget').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
const tableRows = async title => widget(title).locator('.bi-table tbody tr').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent.trim())))
const waitUntil = async (callback, message) => {
  const end = Date.now() + 20000
  while (Date.now() < end) { if (await callback()) return; await page.waitForTimeout(80) }
  throw new Error(message)
}
const loaded = async title => {
  await widget(title).waitFor({ state: 'visible' })
  await waitUntil(async () => !(await widget(title).innerText()).includes('Завантаження'), `${title} did not finish loading`)
  assert.equal(await widget(title).locator('.bi-state-error').count(), 0, `${title} has no rendering/query errors`)
}
const editor = () => page.getByRole('dialog', { name: 'Налаштування віджета' })
const flagName = 'Показувати лише ненульові значення'
const toggleWidget = async (title, enabled, personal = false, previewRows, dashboard = false) => {
  const editName = personal || dashboard ? 'Редагувати дашборд' : 'Редагувати статистику'
  await page.getByRole('button', { name: editName, exact: true }).click()
  await page.getByRole('button', { name: `Налаштувати ${title}`, exact: true }).click()
  await editor().getByRole('checkbox', { name: flagName, exact: true }).setChecked(enabled)
  if (previewRows !== undefined) {
    await editor().getByRole('button', { name: 'Попередній перегляд', exact: true }).click()
    await editor().locator('.ia-preview .bi-table').waitFor({ state: 'visible' })
    assert.equal(await editor().locator('.ia-preview .bi-table tbody tr').count(), previewRows)
  }
  await editor().getByRole('button', { name: 'Застосувати', exact: true }).click()
  await editor().waitFor({ state: 'hidden' })
  await page.locator('.ia-toolbar').getByRole('button', { name: 'Зберегти', exact: true }).click()
  await page.getByRole('button', { name: editName, exact: true }).waitFor({ state: 'visible' })
  await loaded(title)
}
const checkFlagInEditor = async (title, enabled, personal = false, dashboard = false) => {
  await page.getByRole('button', { name: personal || dashboard ? 'Редагувати дашборд' : 'Редагувати статистику', exact: true }).click()
  await page.getByRole('button', { name: `Налаштувати ${title}`, exact: true }).click()
  assert.equal(await editor().getByRole('checkbox', { name: flagName, exact: true }).isChecked(), enabled)
  await editor().getByRole('button', { name: 'Скасувати', exact: true }).click()
  await page.locator('.ia-toolbar').getByRole('button', { name: 'Скасувати', exact: true }).click()
}

const token = `z${Date.now()}`
const ids = { effective: `${token}_effective`, zero: `${token}_zero`, negative: `${token}_negative` }
const titles = { main: `Ненульові результати ${token}`, peer: `Незалежний віджет ${token}`, mixed: `Змішані значення ${token}`, numbers: `Числові значення ${token}`, own: `Особисті ненульові результати ${token}` }
const metricTitles = { effective: `Контрольна успішність ${token}`, zero: `Контрольний нуль ${token}`, negative: `Контрольне від’ємне значення ${token}` }
const dates = { from: '2026-10-01', to: '2026-10-03' }
const seededMetricIds = []
let originalStatistics, originalDashboard, originalPersonal, ownWidgetId, problem
let statisticsChanged = false, dashboardChanged = false, personalChanged = false

try {
  const login = await request('/api/auth/login', 'post', { username: 'smoke-admin', password: 'isolated-smoke-test-password' })
  assert.equal(login.user?.username, 'smoke-admin')
  const source = await request('/api/source/status')
  assert.equal(source.source, 'mock', 'Refuse to mutate a localhost deployment connected to a real warehouse')
  originalStatistics = await analytics('/pages/statistics')
  originalDashboard = await analytics('/pages/dashboard')
  originalPersonal = await analytics('/personal-dashboard')
  assert.ok(['CUSTOMIZABLE', 'FREE'].includes(originalPersonal.dashboard.layout_mode), 'The fixture must allow personal widgets')

  const common = { revision: 0, source: 'flights', filters: [], format: { type: 'number', decimals: 0, suffix: '' }, direction: 'NEUTRAL', permissions: [], is_active: true }
  for (const [kind, calculation] of Object.entries({
    effective: { aggregation: 'COUNT_DISTINCT', field: 'flight_id', filters: [{ field: 'mission_successful', operator: 'eq', value: true }] },
    zero: { aggregation: 'FORMULA', formula: { value: 0 } },
    negative: { aggregation: 'FORMULA', formula: { value: -2 } },
  })) {
    const saved = await request('/api/v1/admin/bi/metrics', 'post', { ...common, ...calculation, id: ids[kind], key: ids[kind], title: metricTitles[kind], description: 'Isolated zero-presentation browser fixture' })
    seededMetricIds.push(saved.id)
  }
  const createWidget = (title, suffix, keys, dimensions, visualization, layout) => ({
    id: `${token}_${suffix}`, revision: 0, dashboard_id: originalStatistics.id, title, widget_type: 'chart', layout,
    query: { metrics: keys.map(key => ({ key })), dimensions, filters: [], date_range: dates, data_scope: 'USER_SCOPE' },
    visualization: { type: visualization, options: { hide_zero_values: false } }, data_scope: 'USER_SCOPE', fixed_filters: [],
    inherit_global_filters: false, date_mode: 'USE_FIXED_DATE', widget_kind: 'SYSTEM_WIDGET', section: 'overview',
    mandatory: false, is_locked: false, movable: true, resizable: true, removable: true, interaction: { click_action: 'NONE' }, visibility: { conditions: [] },
  })
  const nextY = Math.max(0, ...originalStatistics.widgets.map(item => item.layout.y + item.layout.h))
  const category = [{ field: 'category' }]
  const seeded = [
    createWidget(titles.main, 'main', [ids.effective], category, 'table', { x: 0, y: nextY, w: 6, h: 5 }),
    createWidget(titles.peer, 'peer', [ids.effective], category, 'table', { x: 6, y: nextY, w: 6, h: 5 }),
    createWidget(titles.mixed, 'mixed', [ids.effective, ids.zero, ids.negative], category, 'table', { x: 0, y: nextY + 5, w: 8, h: 5 }),
    createWidget(titles.numbers, 'numbers', [ids.zero, ids.negative], [], 'number', { x: 8, y: nextY + 5, w: 4, h: 5 }),
  ]
  await analytics('/pages/statistics', 'put', { ...originalStatistics, widgets: [...originalStatistics.widgets, ...seeded] })
  statisticsChanged = true

  const rawResult = await analytics('/pages/statistics/query', 'post', { date_range: dates, filters: [] })
  const rawRows = rawResult.results.find(item => item.widget_id === seeded[0].id)?.data?.rows
  assert.ok(rawRows?.some(row => row.category === 'FPV' && row[ids.effective] === 3))
  assert.ok(rawRows?.some(row => row.category === 'Mavic' && row[ids.effective] === 0))

  await page.goto(`${base}/#/statistics?section=overview`)
  await loaded(titles.main)
  assert.deepEqual((await tableRows(titles.main)).map(row => row[0]).sort(), ['FPV', 'Mavic'])
  const mavicBefore = (await tableRows(titles.main)).find(row => row[0] === 'Mavic')
  assert.equal(mavicBefore[1], '0')
  await toggleWidget(titles.main, true, false, 1)
  await waitUntil(async () => (await tableRows(titles.main)).length === 1, 'The zero-only Mavic row must disappear')
  assert.equal((await tableRows(titles.main))[0][0], 'FPV')
  assert.deepEqual((await tableRows(titles.peer)).map(row => row[0]).sort(), ['FPV', 'Mavic'])
  assert.equal((await tableRows(titles.peer)).find(row => row[0] === 'Mavic')[1], '0')
  let savedStats = await analytics('/pages/statistics')
  assert.equal(savedStats.widgets.find(item => item.id === seeded[0].id).visualization.options.hide_zero_values, true)
  assert.equal(savedStats.widgets.find(item => item.id === seeded[1].id).visualization.options.hide_zero_values, false)
  record('System widget checkbox saves true; zero rows disappear and another widget remains unchanged')

  await page.reload()
  await loaded(titles.main)
  assert.equal((await tableRows(titles.main)).length, 1)
  await checkFlagInEditor(titles.main, true)
  await toggleWidget(titles.main, false, false, 2)
  await page.reload()
  await loaded(titles.main)
  assert.deepEqual((await tableRows(titles.main)).map(row => row[0]).sort(), ['FPV', 'Mavic'])
  assert.equal((await tableRows(titles.main)).find(row => row[0] === 'Mavic')[1], '0')
  savedStats = await analytics('/pages/statistics')
  assert.equal(savedStats.widgets.find(item => item.id === seeded[0].id).visualization.options.hide_zero_values, false)
  record('The saved checkbox survives reload and disabling it restores the zero row')

  await toggleWidget(titles.mixed, true)
  const headers = await widget(titles.mixed).locator('.bi-table thead th').allTextContents()
  assert.ok(!headers.includes(metricTitles.zero), 'An entirely zero metric column must disappear')
  assert.ok(headers.includes(metricTitles.negative), 'Negative values must remain visible')
  const mixedRows = await tableRows(titles.mixed)
  assert.equal(mixedRows.length, 2, 'The negative metric makes both rows meaningful')
  assert.equal(mixedRows.find(row => row[0] === 'Mavic')[1], '', 'A zero cell is blank in a retained mixed row')
  assert.ok(mixedRows.every(row => Number(row.at(-1).replace('−', '-').replace(/\s/g, '')) === -2))
  await toggleWidget(titles.numbers, true)
  assert.equal(await widget(titles.numbers).locator('.bi-number').count(), 1)
  assert.equal(Number((await widget(titles.numbers).locator('.bi-number strong').innerText()).replace('−', '-').replace(/\s/g, '')), -2)
  const rawAfter = await analytics('/pages/statistics/query', 'post', { date_range: dates, filters: [] })
  assert.deepEqual(rawAfter.results.find(item => item.widget_id === seeded[0].id).data.rows, rawRows, 'Presentation filtering never removes source results or changes aggregates')
  record('Zero-only columns and numeric cards disappear; mixed zero cells are blank and negative values survive')
  await page.screenshot({ path: path.join(output, 'system-zero-values.png'), fullPage: true })

  const average = originalDashboard.widgets.find(item => item.builtin === 'average')
  assert.ok(average, 'The isolated canonical Dashboard includes its native average widget')
  await page.goto(`${base}/#/dashboard`)
  await loaded(average.title)
  dashboardChanged = true
  await toggleWidget(average.title, true, false, undefined, true)
  let native = (await analytics('/pages/dashboard')).widgets.find(item => item.id === average.id)
  assert.equal(native.builtin, 'average', 'An options-only change preserves the native average renderer')
  assert.equal(native.visualization.options.hide_zero_values, true)
  await page.reload()
  await loaded(average.title)
  await checkFlagInEditor(average.title, true, false, true)
  native = (await analytics('/pages/dashboard')).widgets.find(item => item.id === average.id)
  assert.equal(native.builtin, 'average')
  record('Native average widget keeps its renderer and saved zero-value checkbox across reload')

  const personalY = Math.max(0, ...originalPersonal.dashboard.widgets.map(item => item.layout.y + item.layout.h))
  const own = await analytics('/personal-dashboard/widgets', 'post', { ...createWidget(titles.own, 'own', [ids.effective], category, 'table', { x: 0, y: personalY, w: 6, h: 5 }), dashboard_id: 'system-dashboard', widget_kind: 'USER_WIDGET', section: 'overview' })
  ownWidgetId = own.id
  personalChanged = true
  await page.goto(`${base}/#/personal`)
  await loaded(titles.own)
  await toggleWidget(titles.own, true, true, 1)
  let personal = await analytics('/personal-dashboard')
  let savedOwn = personal.dashboard.widgets.find(item => item.id === ownWidgetId)
  assert.equal(savedOwn.widget_kind, 'USER_WIDGET')
  assert.equal(savedOwn.data_scope, 'USER_SCOPE')
  assert.equal(savedOwn.visualization.options.hide_zero_values, true)
  await page.reload()
  await loaded(titles.own)
  assert.equal((await tableRows(titles.own)).length, 1)
  await checkFlagInEditor(titles.own, true, true)
  await toggleWidget(titles.own, false, true, 2)
  await page.reload()
  await loaded(titles.own)
  assert.equal((await tableRows(titles.own)).find(row => row[0] === 'Mavic')[1], '0')
  personal = await analytics('/personal-dashboard')
  savedOwn = personal.dashboard.widgets.find(item => item.id === ownWidgetId)
  assert.equal(savedOwn.visualization.options.hide_zero_values, false)
  record('Personal USER_WIDGET checkbox persists with USER_SCOPE across reload and disabling restores zeros')
  await page.screenshot({ path: path.join(output, 'personal-zero-values.png'), fullPage: true })
  assert.deepEqual(errors, [], 'No browser JavaScript errors')
  assert.deepEqual(failures, [], 'No failed browser API requests')
} catch (error) {
  problem = error
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {})
} finally {
  const clean = async (name, operation) => { try { await operation() } catch (error) { cleanupErrors.push(`${name}: ${error.message}`) } }
  if (ownWidgetId) await clean('Remove temporary personal widget', async () => {
    const current = await analytics('/personal-dashboard')
    const own = current.dashboard.widgets.find(item => item.id === ownWidgetId)
    if (own) await analytics(`/personal-dashboard/widgets/${encodeURIComponent(own.id)}?expected_revision=${own.revision}`, 'delete')
  })
  if (dashboardChanged && originalDashboard) await clean('Restore original Dashboard definition', async () => {
    const current = await analytics('/pages/dashboard')
    await analytics('/pages/dashboard', 'put', { ...originalDashboard, revision: current.revision, widgets: originalDashboard.widgets.map(item => ({ ...item, revision: current.widgets.find(value => value.id === item.id)?.revision ?? item.revision })) })
  })
  if (personalChanged && originalPersonal) await clean('Restore original personal layouts', async () => {
    const current = await analytics('/personal-dashboard')
    const originals = [...originalPersonal.dashboard.widgets, ...(originalPersonal.available_widgets ?? [])]
    const unique = [...new Map(originals.map(item => [item.id, item])).values()]
    await analytics('/personal-dashboard', 'put', { expected_revision: current.revision, hidden_widget_ids: originalPersonal.hidden_widget_ids ?? [], overrides: unique.filter(item => !item.is_locked).map(item => ({ widget_id: item.id, layout: item.layout })) })
  })
  if (statisticsChanged && originalStatistics) await clean('Restore original Statistics definition', async () => {
    const current = await analytics('/pages/statistics')
    await analytics('/pages/statistics', 'put', { ...originalStatistics, revision: current.revision, widgets: originalStatistics.widgets.map(item => ({ ...item, revision: current.widgets.find(value => value.id === item.id)?.revision ?? item.revision })) })
  })
  if (seededMetricIds.length) await clean('Remove temporary metrics', async () => {
    const current = await adminMetrics()
    for (const id of seededMetricIds) {
      const item = current.find(value => value.id === id)
      if (item) await request(`/api/v1/admin/bi/metrics/${encodeURIComponent(id)}?expected_revision=${item.revision}`, 'delete')
    }
  })
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ checks, errors, failures, cleanupErrors, ...(problem ? { failure: problem.message } : {}) }, null, 2))
  await context.close()
  await browser.close()
}
if (problem) throw problem
assert.deepEqual(cleanupErrors, [], 'All temporary fixture definitions and personal layouts must be restored')
console.log(JSON.stringify({ checks: checks.length, result: path.join(output, 'result.json'), cleanup: 'restored' }))
