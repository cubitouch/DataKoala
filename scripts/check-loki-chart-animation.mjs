import { app, BrowserWindow, ipcMain } from 'electron'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lokiLabels, lokiLabelValues, previewLokiLogResult, previewLokiTrendResult } from './visual-preview/loki-fixtures.mjs'

process.env.DATAKOALA_CHART_REGRESSION = '1'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

async function waitFor(win, expression, description, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await win.webContents.executeJavaScript(`Boolean(${expression})`)) return
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

async function seedWorkspace(win) {
  await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore
    const state = store?.getState()
    if (!store || !state) return false
    const profile = { id: 'regression-loki', name: 'Regression Loki', kind: 'loki', version: 1, readonly: true, transport: { kind: 'gcx', context: 'test', datasourceUid: 'loki-main' } }
    store.setState({
      profiles: [profile], activeProfileId: profile.id, connected: true, connecting: false,
      connectionStatus: 'connected', connectionError: null,
      tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? {
        ...tab, connectionProfileId: profile.id, queryMode: 'sql',
        sql: '{app="checkout"}',
        lokiTimeRange: { kind: 'custom', startDate: '2026-08-19', startTime: '16:00', endDate: '2026-08-19', endTime: '17:00', recurringWindows: [] },
        lokiResultLimit: 100, lokiGroupBy: [], lokiRangeHistory: [], lokiResultView: 'bar'
      } : tab)
    })
    return true
  })()`)
  await waitFor(win, `window.__datakoalaStore && document.querySelector('main[aria-label="Loki explorer"]')`, 'seeded Loki workspace')
}

async function yellowPixels(win) {
  return win.webContents.executeJavaScript(`(() => {
    const canvas = document.querySelector('[data-result-chart-canvas] canvas')
    if (!canvas) return null
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2], a = pixels[index + 3]
      if (a > 100 && r > 180 && g > 130 && b < 120 && r > b * 1.7) count += 1
    }
    return { count, width: canvas.width, height: canvas.height }
  })()`)
}

async function clickView(win, view) {
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === ${JSON.stringify(view)})?.click()`)
  await waitFor(win, `document.querySelector('[data-result-chart-canvas][data-visual-type="${view.toLowerCase()}"] canvas')`, `${view} chart canvas`)
}

async function assertPaintedBeforeResize(win, view) {
  await clickView(win, view)
  await sleep(1400)
  const before = await yellowPixels(win)
  if (!before || before.count < 20) throw new Error(`${view} did not paint a visible series before resize: ${JSON.stringify(before)}`)

  const [width, height] = win.getSize()
  win.setSize(width + 2, height)
  await sleep(180)
  win.setSize(width, height)
  await sleep(280)

  const after = await yellowPixels(win)
  if (!after || after.count < 20) throw new Error(`${view} did not paint a visible series after resize: ${JSON.stringify(after)}`)
  const ratio = before.count / after.count
  if (ratio < 0.85) {
    throw new Error(`${view} series only became complete after window resize: before=${JSON.stringify(before)} after=${JSON.stringify(after)} ratio=${ratio.toFixed(3)}`)
  }
  console.log(`[loki-chart-animation] ${view}: before=${before.count} after=${after.count} ratio=${ratio.toFixed(3)}`)
}

app.whenReady().then(async () => {
  let logFinished = false
  let trendFinished = false
  ipcMain.handle('connections:list', async () => [])
  ipcMain.handle('connections:loki:labels', async () => lokiLabels)
  ipcMain.handle('connections:loki:label-values', async (_event, _id, name) => lokiLabelValues[name] ?? [])
  ipcMain.handle('connections:loki:format-query', async (_event, _id, query) => query)
  ipcMain.handle('query:run-loki', async (_event, _id, request) => {
    await sleep(80)
    if (String(request.expression).includes('count_over_time')) {
      trendFinished = true
      return previewLokiTrendResult
    }
    logFinished = true
    return previewLokiLogResult
  })

  const win = new BrowserWindow({
    width: 1440, height: 900, show: true, backgroundColor: '#0f1115',
    webPreferences: { preload: resolve(root, 'out/preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  })

  try {
    await win.loadFile(resolve(root, 'out/renderer/index.html'))
    await waitFor(win, `document.getElementById('root')?.children.length && window.__datakoalaStore`, 'renderer test harness')
    await seedWorkspace(win)
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('main button')].find((button) => button.textContent?.trim() === 'Run')?.click()`)
    for (let attempt = 0; attempt < 100 && (!logFinished || !trendFinished); attempt += 1) await sleep(100)
    if (!logFinished || !trendFinished) throw new Error('Loki fixtures did not finish')
    await waitFor(win, `document.querySelector('[data-result-chart-canvas] canvas')`, 'initial Loki chart')

    await assertPaintedBeforeResize(win, 'Bar')
    await assertPaintedBeforeResize(win, 'Line')
    await assertPaintedBeforeResize(win, 'Area')
    await assertPaintedBeforeResize(win, 'Bar')

    console.log('Loki animated chart regression passed')
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
