import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { previewDenseTraceResultForId, previewDenseTraceSearchResult } from './visual-preview/trace-dense-fixtures.mjs'
import { assertPreviewReady } from './visual-preview/assertions.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const outputDir = resolve(process.env.DATAKOALA_PREVIEW_OUTPUT ?? 'visual-preview')
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

process.env.DATAKOALA_SMOKE = '1'

async function waitFor(win, expression, description, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await win.webContents.executeJavaScript(`Boolean(${expression})`)) return
    await sleep(100)
  }
  const body = await win.webContents.executeJavaScript(`(document.body.innerText || '').slice(0, 1800)`)
  throw new Error(`Timed out waiting for ${description}. Renderer text: ${body}`)
}

async function seedTempo(win) {
  await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore
    const state = store?.getState()
    if (!store || !state) return
    const profile = {
      id: 'preview-tempo-fullscreen',
      name: 'Synthetic traces',
      kind: 'tempo',
      version: 1,
      readonly: true,
      transport: { kind: 'gcx', context: 'synthetic' }
    }
    store.setState({
      profiles: [profile],
      activeProfileId: profile.id,
      connected: true,
      connecting: false,
      connectionStatus: 'connected',
      connectionError: null,
      serverVersion: null,
      metadataByProfileId: {
        ...state.metadataByProfileId,
        [profile.id]: { schemas: [], status: 'loaded', error: null, isStale: false }
      },
      tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? {
        ...tab,
        title: 'Synthetic dense cohort',
        connectionProfileId: profile.id,
        queryMode: 'sql',
        sql: '{}'
      } : tab)
    })
  })()`)
  await waitFor(win, `document.querySelector('section[aria-label="Trace explorer"]')`, 'Tempo workspace')
}

async function runDenseSearch(win) {
  await win.webContents.executeJavaScript(`document.querySelector('[data-tempo-run-query]')?.click()`)
  await waitFor(win, `document.body.innerText.includes('20 traces') && document.body.innerText.includes('synthetic-gateway')`, 'dense Tempo search results')
  await win.webContents.executeJavaScript(`(() => {
    const group = document.querySelector('[aria-label="Trace search result view"]')
    ;[...(group?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.trim() === 'Service map')?.click()
  })()`)
  await waitFor(win, `(() => {
    const map = document.querySelector('[data-trace-service-map]')
    const text = map?.innerText ?? ''
    return Boolean(map?.querySelector('canvas')) && text.includes('60') && text.includes('108') && text.includes('Re-analyze') && !text.includes('Analyzing traces…')
  })()`, 'fully analyzed dense service map')
}

async function selectAsyncBranches(win) {
  await win.webContents.executeJavaScript(`document.querySelector('button[aria-label="Branch scope: Entire transaction"]')?.click()`)
  await waitFor(win, `[...document.querySelectorAll('[role="option"]')].some((option) => option.textContent?.trim() === 'Async branches')`, 'Async branches option')
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('[role="option"]')].find((option) => option.textContent?.trim() === 'Async branches')?.click()`)
  await waitFor(win, `document.querySelector('[data-trace-service-map]')?.getAttribute('data-branch-scope') === 'async'`, 'async branch scope')
}

const fullscreenExpression = `(() => {
  const graph = document.querySelector('[data-service-map-graph-fullscreen="true"]')
  const titlebar = document.querySelector('.titlebar')
  const panel = document.querySelector('aside[aria-label="Full screen service map bottlenecks"]')
  if (!graph || !titlebar || !panel) return false
  const graphRect = graph.getBoundingClientRect()
  const titleRect = titlebar.getBoundingClientRect()
  const candidates = panel.querySelectorAll('[data-service-map-bottleneck]')
  return graphRect.top >= titleRect.bottom - 1 && graphRect.left <= 1 && graphRect.right >= innerWidth - 1 && graphRect.bottom >= innerHeight - 1 && candidates.length === 10 && document.querySelector('button[aria-label="Branch scope: Async branches"]') && document.querySelector('button[aria-label="Exit service map full screen"]')
})()`

async function fullscreenReady(win) {
  return win.webContents.executeJavaScript(fullscreenExpression)
}

async function enterFullscreen(win) {
  await win.webContents.executeJavaScript(`document.querySelector('[data-service-map-fullscreen]')?.click()`)
  await waitFor(win, fullscreenExpression, 'fullscreen service map below titlebar with Async branches and Top 10 bottlenecks')
  await sleep(300)
  if (!(await fullscreenReady(win))) throw new Error('Fullscreen service-map state did not remain stable before painting')
}

app.whenReady().then(async () => {
  ipcMain.handle('connections:list', async () => [])
  ipcMain.handle('connections:prometheus:metric-labels', async () => [])
  ipcMain.handle('connections:prometheus:label-values', async () => [])
  ipcMain.handle('query:run', async (_event, _connectionId, query) => previewDenseTraceResultForId(String(query).trim()) ?? previewDenseTraceSearchResult)

  const win = new BrowserWindow({
    title: 'DataKoala',
    width: 1440,
    height: 900,
    show: false,
    backgroundColor: '#0f1115',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 13 },
    webPreferences: {
      preload: resolve(root, 'out/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  try {
    await mkdir(outputDir, { recursive: true })
    await win.loadFile(resolve(root, 'out/renderer/index.html'))
    await waitFor(win, `document.getElementById('root')?.children.length && window.__datakoalaStore`, 'renderer and store')
    await seedTempo(win)
    await runDenseSearch(win)
    await selectAsyncBranches(win)
    await enterFullscreen(win)
    win.showInactive()
    await win.webContents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
    await sleep(350)
    if (!(await fullscreenReady(win))) throw new Error('Fullscreen service-map state changed before capture')
    await assertPreviewReady(win, 'tempo-service-map-fullscreen.png')
    const image = await win.webContents.capturePage()
    const path = resolve(outputDir, 'tempo-service-map-fullscreen.png')
    await writeFile(path, image.toPNG())
    console.log(`Fullscreen Tempo service-map preview written to ${path}`)
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
