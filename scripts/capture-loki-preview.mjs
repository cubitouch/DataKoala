import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lokiLabels, lokiLabelValues, previewLokiLogResult, previewLokiTrendResult } from './visual-preview/loki-fixtures.mjs'
import { assertCompactObjectFilter, assertFieldRowGeometry, assertVisibleSeriesField } from './visual-preview/assertions.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const outputArgument = process.argv.slice(2).find((argument) => !argument.endsWith('.mjs'))
const outputDir = resolve(process.env.DATAKOALA_PREVIEW_OUTPUT ?? outputArgument ?? 'visual-preview')
process.env.DATAKOALA_SMOKE = '1'

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
async function waitFor(win, expression, description, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await win.webContents.executeJavaScript(`Boolean(${expression})`)) return
    await sleep(100)
  }
  const body = await win.webContents.executeJavaScript(`(document.body.innerText || '').slice(0, 1800)`)
  throw new Error(`Timed out waiting for ${description}. Renderer text: ${body}`)
}

async function seedWorkspace(win) {
  await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore
    const state = store?.getState()
    if (!store || !state) return
    const profile = { id: 'preview-loki', name: 'Production logs', kind: 'loki', version: 1, readonly: true, transport: { kind: 'gcx', context: 'production', datasourceUid: 'grafana-loki-production' } }
    store.setState({
      profiles: [profile], activeProfileId: profile.id, connected: true, connecting: false,
      connectionStatus: 'connected', connectionError: null,
      tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? {
        ...tab, title: 'Checkout timeouts', connectionProfileId: profile.id, queryMode: 'builder',
        sql: '{environment="production", namespace="payments", service_name="checkout-api"} |= "timeout"',
        lokiTimeRange: { kind: 'custom', startDate: '2026-08-19', startTime: '16:00', endDate: '2026-08-19', endTime: '17:00', recurringWindows: [] },
        lokiBuilder: {
          labelMatchers: [
            { label: 'environment', operator: '=', value: 'production' },
            { label: 'namespace', operator: '=', value: 'payments' },
            { label: 'service_name', operator: '=', value: 'checkout-api' }
          ],
          lineFilters: [{ operator: '|=', value: 'timeout' }], parsers: [], fieldFilters: []
        },
        lokiResultLimit: 48, lokiGroupBy: ['service_name', 'severity'], lokiRangeHistory: [], lokiResultView: 'list'
      } : tab)
    })
  })()`)
  await waitFor(win, `document.querySelector('main') && document.body.innerText.includes('Production logs') && document.body.innerText.includes('Generated LogQL') && document.body.innerText.includes('checkout-api')`, 'initialized Loki workspace')
}

app.whenReady().then(async () => {
  let labelsReady = false
  const valueRequests = new Set()
  let logFinished = false
  let trendFinished = false
  ipcMain.handle('connections:list', async () => [])
  ipcMain.handle('connections:loki:labels', async () => { labelsReady = true; return lokiLabels })
  ipcMain.handle('connections:loki:label-values', async (_event, _id, name) => { valueRequests.add(name); return lokiLabelValues[name] ?? [] })
  ipcMain.handle('connections:loki:format-query', async (_event, _id, query) => query)
  ipcMain.handle('query:run-loki', async (_event, _id, request) => {
    await sleep(120)
    if (String(request.expression).startsWith('count(sum by')) return { ...previewLokiTrendResult, rows: [{ timestamp: '2026-08-19T16:00:00.000Z', value: 6 }], rowCount: 1 }
    if (String(request.expression).includes('count_over_time')) { trendFinished = true; return previewLokiTrendResult }
    logFinished = true
    return previewLokiLogResult
  })

  const win = new BrowserWindow({ width: 1440, height: 900, show: false, backgroundColor: '#0f1115', webPreferences: { preload: resolve(root, 'out/preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } })
  try {
    await mkdir(outputDir, { recursive: true })
    await win.loadFile(resolve(root, 'out/renderer/index.html'))
    await waitFor(win, `document.getElementById('root')?.children.length && window.__datakoalaStore`, 'renderer and store')
    await seedWorkspace(win)
    await assertCompactObjectFilter(win, 'Filter Loki objects')
    for (let attempt = 0; attempt < 80 && (!labelsReady || valueRequests.size < 3); attempt += 1) await sleep(100)
    if (!labelsReady || valueRequests.size < 3) throw new Error('Loki metadata fixtures did not finish loading')
    await assertFieldRowGeometry(win, '[data-loki-builder]', ['Filter by', 'Line contains', 'Group by'])
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('main button')].find((button) => button.textContent?.trim() === 'Run')?.click()`)
    for (let attempt = 0; attempt < 80 && !logFinished; attempt += 1) await sleep(100)
    if (!logFinished) throw new Error('Loki log fixture did not finish')
    await waitFor(win, `document.querySelector('section[aria-label="Log results"] article') && document.body.innerText.includes('48 loaded') && !document.body.innerText.includes('Running…')`, 'rendered virtual log rows')
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('section[aria-label="Log results"] article button')].find((button) => button.textContent?.includes('circuit breaker opened'))?.click()`)
    await waitFor(win, `(() => { const row = document.querySelector('aside[aria-label="Selected log details"]'); const text = row?.textContent ?? ''; return text.includes('Indexed labels') && text.includes('Structured metadata') && text.includes('Parsed fields') && text.includes('8f4a02ce4d7b41a2bd63688cf774913e') })()`, 'selected error event details')
    await win.webContents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
    await sleep(400)
    const listPath = resolve(outputDir, 'loki-log-list.png')
    await win.webContents.capturePage()
    await sleep(200)
    await writeFile(listPath, (await win.webContents.capturePage()).toPNG())
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Line')?.click()`)
    for (let attempt = 0; attempt < 80 && !trendFinished; attempt += 1) await sleep(100)
    if (!trendFinished) throw new Error('Loki trend fixture did not finish')
    await waitFor(win, `document.querySelector('[data-result-chart-canvas] canvas')`, 'rendered Loki trend')
    await assertVisibleSeriesField(win)
    await sleep(400)
    const chartPath = resolve(outputDir, 'loki-log-chart.png')
    await win.webContents.capturePage()
    await sleep(200)
    await writeFile(chartPath, (await win.webContents.capturePage()).toPNG())
    console.log(`Loki visual previews written to ${listPath} and ${chartPath}`)
    app.exit(0)
  } catch (error) { console.error(error); app.exit(1) }
})
