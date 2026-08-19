import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { previewTraceId, previewTraceResult, previewTraceSearchResult } from './visual-preview/trace-fixtures.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const outputArgument = process.argv.slice(2).find((argument) => !argument.endsWith('.mjs'))
const outputDir = resolve(process.env.DATAKOALA_PREVIEW_OUTPUT ?? outputArgument ?? 'visual-preview')

process.env.DATAKOALA_SMOKE = '1'

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

async function waitFor(win, expression, description, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await win.webContents.executeJavaScript(`Boolean(${expression})`)) return
    await sleep(100)
  }
  const body = await win.webContents.executeJavaScript(`(document.body.innerText || '').slice(0, 1200)`)
  throw new Error(`Timed out waiting for ${description}. Renderer text: ${body}`)
}

async function capture(win, filename) {
  await win.webContents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
  await sleep(200)
  const image = await win.webContents.capturePage()
  const path = resolve(outputDir, filename)
  await writeFile(path, image.toPNG())
  console.log(`Trace visual preview written to ${path}`)
}

async function seedTraceWorkspace(win) {
  await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore
    if (!store) return
    const state = store.getState()
    const profile = {
      id: 'preview-observability',
      name: 'Production observability',
      kind: 'prometheus',
      version: 1,
      readonly: true,
      transport: { kind: 'gcx', context: 'production', datasourceUid: 'preview-prometheus' }
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
        title: 'Checkout latency',
        connectionProfileId: profile.id,
        queryMode: 'sql',
        sql: 'sum(rate(http_requests_total{service="checkout-api"}[5m]))'
      } : tab)
    })
  })()`)
  await waitFor(win, `document.body.innerText.includes('Production observability')`, 'seeded observability connection')
}

async function openTraceExplorer(win) {
  await win.webContents.executeJavaScript(`(() => {
    const group = document.querySelector('[role="group"][aria-label="Grafana signal"]')
    const button = [...(group?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent?.trim() === 'Traces')
    button?.click()
  })()`)
  await waitFor(win, `document.querySelector('section[aria-label="Trace explorer"]')`, 'trace explorer')
}

async function searchTraces(win) {
  await win.webContents.executeJavaScript(`(() => {
    const section = document.querySelector('section[aria-label="Trace explorer"]')
    const input = section?.querySelector('#traceql-query')
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, '{ resource.service.name = "checkout-api" && duration > 300ms }')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const button = [...(section?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent?.includes('Search traces'))
    button?.click()
  })()`)
  await waitFor(win, `document.body.innerText.includes('5 traces') && document.body.innerText.includes('POST /checkout') && document.body.innerText.includes('1.48s') && document.body.innerText.includes('16 matched spans')`, 'realistic Tempo search results')
}

async function openPreviewTrace(win) {
  await win.webContents.executeJavaScript(`(() => {
    const section = document.querySelector('section[aria-label="Trace explorer"]')
    const button = [...(section?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent?.includes('checkout-api') && candidate.textContent?.includes('POST /checkout') && candidate.textContent?.includes('1.48s'))
    button?.click()
  })()`)
  await waitFor(win, `document.body.innerText.includes('payment-service') && document.body.innerText.includes('fulfilment-worker') && document.body.innerText.includes('warehouse-service')`, 'opened checkout trace waterfall')
}

async function selectPaymentSpan(win) {
  await win.webContents.executeJavaScript(`(() => {
    const section = document.querySelector('section[aria-label="Trace explorer"]')
    const button = [...(section?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent?.includes('payment-service') && candidate.textContent?.includes('charge card'))
    button?.click()
  })()`)
  await waitFor(win, `document.querySelector('aside[aria-label="Selected span details"]') && document.body.innerText.includes('TimeoutError')`, 'selected payment span details')
}

app.whenReady().then(async () => {
  ipcMain.handle('connections:list', async () => [])
  ipcMain.handle('connections:prometheus:metric-labels', async () => [])
  ipcMain.handle('connections:prometheus:label-values', async () => [])
  ipcMain.handle('query:run', async (_event, _connectionId, query) => String(query).trim() === previewTraceId ? previewTraceResult : previewTraceSearchResult)

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    backgroundColor: '#0f1115',
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
    await seedTraceWorkspace(win)
    await openTraceExplorer(win)
    await searchTraces(win)
    await capture(win, 'tempo-trace-search.png')
    await openPreviewTrace(win)
    await selectPaymentSpan(win)
    await capture(win, 'tempo-waterfall.png')
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
