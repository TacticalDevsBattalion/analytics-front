import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/embed.ts', import.meta.url), 'utf8'), { mode: 'strip' })
const load = () => import(`data:text/javascript;base64,${Buffer.from(source + `\n// ${Math.random()}`).toString('base64')}`)

function fakeWindow(href, { framed = true, stored = {} } = {}) {
  const posted = []
  const items = new Map(Object.entries(stored))
  const win = {
    location: new URL(href),
    history: { state: null, replaceState(_state, _title, url) { const next = new URL(url, win.location.href); win.location = next } },
    sessionStorage: { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)), removeItem: key => items.delete(key) },
    parent: { postMessage: (message, origin) => posted.push([message, origin]) },
  }
  win.self = win
  win.top = framed ? { other: true } : win
  return { win, posted, items }
}

test('standalone or without ?k2-embed=1 nothing changes', async () => {
  const embed = await load()
  const alone = fakeWindow('https://analytics.kub.k2.lan/?k2-embed=1#/map', { framed: false })
  assert.equal(embed.initEmbed(alone.win), false)
  embed.notifyReady('Карта'); embed.notifyRoute('Карта')
  assert.deepEqual(alone.posted, [])
  const framed = fakeWindow('https://analytics.kub.k2.lan/#/map')
  assert.equal(embed.initEmbed(framed.win), false)
  assert.equal(embed.isEmbedded(), false)
  assert.equal(embed.requestLogin('/api/auth/keycloak/login', false), false)
  assert.deepEqual(framed.posted, [])
})

test('embedded: the flag survives later addresses, messages go to each Workspace origin', async () => {
  const embed = await load()
  const { win, posted, items } = fakeWindow('https://analytics.kub.k2.lan/?k2-embed=1#/map')
  assert.equal(embed.initEmbed(win), true)
  assert.equal(win.location.href, 'https://analytics.kub.k2.lan/#/map')
  assert.equal(items.get('analytics-k2-embed'), '1')
  embed.notifyReady('Карта')
  embed.notifyRoute('Карта')
  assert.deepEqual(posted, [
    [{ type: 'k2:ready', title: 'Карта' }, 'https://workspace.kub.k2.lan'],
    [{ type: 'k2:ready', title: 'Карта' }, 'https://workspace.arckos.net'],
    [{ type: 'k2:route', path: '/#/map', title: 'Карта' }, 'https://workspace.kub.k2.lan'],
    [{ type: 'k2:route', path: '/#/map', title: 'Карта' }, 'https://workspace.arckos.net'],
  ])
  assert.ok(posted.every(([, origin]) => origin !== '*'))
  // A later load in the same frame tab, without the parameter.
  const again = fakeWindow('https://analytics.kub.k2.lan/#/table', { stored: Object.fromEntries(items) })
  assert.equal((await load()).initEmbed(again.win), true)
})

test('route path drops only k2-embed', async () => {
  const embed = await load()
  assert.equal(embed.routePath('https://a.example/x?k2-embed=1&b=2#/statistics?section=positions'), '/x?b=2#/statistics?section=positions')
})

test('configured origins: only exact https origins', async () => {
  const embed = await load()
  const { win, posted } = fakeWindow('https://analytics.kub.k2.lan/?k2-embed=1')
  embed.initEmbed(win, ['https://ws.example', '*', 'http://plain.example', 'https://ws.example/path'])
  embed.notifyReady()
  assert.deepEqual(posted, [[{ type: 'k2:ready' }, 'https://ws.example']])
})

test('silent sign-in keeps the page; need-login does not repeat on its own', async () => {
  const embed = await load()
  const { win, posted, items } = fakeWindow('https://analytics.kub.k2.lan/?k2-embed=1#/comparison')
  embed.initEmbed(win)
  embed.rememberRoute()
  // Back from the silent sign-in at the application's root.
  const back = fakeWindow('https://analytics.kub.k2.lan/', { stored: Object.fromEntries(items) })
  const again = await load()
  assert.equal(again.initEmbed(back.win), true)
  assert.equal(back.win.location.hash, '#/comparison')

  assert.equal(embed.requestLogin('/api/auth/keycloak/login', true, 1_000_000), true)
  assert.equal(embed.requestLogin('/api/auth/keycloak/login', true, 1_010_000), false)
  assert.equal(embed.requestLogin('/api/auth/keycloak/login', false, 1_011_000), true)
  assert.equal(embed.requestLogin('/api/auth/keycloak/login', true, 1_011_000 + embed.NEED_LOGIN_PAUSE_MS), true)
  const asks = posted.filter(([message]) => message.type === 'k2:need-login')
  assert.equal(asks.length, 3 * 2)
  assert.deepEqual(asks[0], [{ type: 'k2:need-login', login: '/api/auth/keycloak/login' }, 'https://workspace.kub.k2.lan'])
})
