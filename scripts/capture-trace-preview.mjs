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
  const body = await win.webContents.executeJavaScript(`(document.body.innerText || '').slice(0, 1600)`)
  throw new Error(`Timed out waiting for ${description}. Renderer text: ${body}`)
}

async function capture(win, filename) {
  await win.webContents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
  await sleep(250)
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
      id: 'preview-tempo',
      name: 'Production traces',
      kind: 'tempo',
      version: 1,
      readonly: true,
      transport: { kind: 'gcx', context: 'production' }
    }
    const schemas = [
      { name: 'commerce', isSystem: false, relations: [
        { schema: 'commerce', name: 'checkout-api', qualifiedName: 'commerce.checkout-api', kind: 'service', columnsStatus: 'idle', details: { kind: 'service', serviceNamespace: 'commerce' } },
        { schema: 'commerce', name: 'inventory-service', qualifiedName: 'commerce.inventory-service', kind: 'service', columnsStatus: 'idle', details: { kind: 'service', serviceNamespace: 'commerce' } },
        { schema: 'commerce', name: 'payment-service', qualifiedName: 'commerce.payment-service', kind: 'service', columnsStatus: 'idle', details: { kind: 'service', serviceNamespace: 'commerce' } },
        { schema: 'commerce', name: 'redis', qualifiedName: 'commerce.redis', kind: 'service', columnsStatus: 'idle', details: { kind: 'service', serviceNamespace: 'commerce' } },
        { schema: 'commerce', name: 'postgres', qualifiedName: 'commerce.postgres', kind: 'service', columnsStatus: 'idle', details: { kind: 'service', serviceNamespace: 'commerce' } }
      ] },
      { name: 'platform', isSystem: false, relations: [
        { schema: 'platform', name: 'kafka', qualifiedName: 'platform.kafka', kind: 'service', columnsStatus: 'idle', details: { kind: 'service', serviceNamespace: 'platform' } }
      ] },
      { name: 'fulfilment', isSystem: false, relations: [
        { schema: 'fulfilment', name: 'fulfilment-worker', qualifiedName: 'fulfilment.fulfilment-worker', kind: 'service', columnsStatus: 'idle', details: { kind: 'service', serviceNamespace: 'fulfilment' } },
        { schema: 'fulfilment', name: 'warehouse-service', qualifiedName: 'fulfilment.warehouse-service', kind: 'service', columnsStatus: 'idle', details: { kind: 'service', serviceNamespace: 'fulfilment' } }
      ] }
    ]
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
        [profile.id]: { schemas, status: 'loaded', error: null, isStale: false }
      },
      tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? {
        ...tab,
        title: 'Checkout latency',
        connectionProfileId: profile.id,
        queryMode: 'builder',
        sql: '{ resource.service.namespace = "commerce" && resource.service.name = "checkout-api" && duration > 300ms }'
      } : tab)
    })
  })()`)
  await waitFor(win, `document.querySelector('section[aria-label="Trace explorer"]') && document.body.innerText.includes('Production traces') && document.body.innerText.includes('checkout-api')`, 'seeded Tempo workspace and service tree')
}

async function validateBuilderIndependence(win) {
  const report = JSON.parse(await win.webContents.executeJavaScript(`(() => {
    const labels = [...document.querySelectorAll('section[aria-label="Trace explorer"] label')]
    const inputFor = (name) => labels.find((label) => label.querySelector('span')?.textContent?.trim() === name)?.querySelector('input')
    const service = inputFor('Service')
    const span = inputFor('Span / operation')
    if (!service || !span) return JSON.stringify({ error: 'missing builder inputs' })
    const before = { service: service.value, span: span.value }
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(span), 'value')
    descriptor.set.call(span, 'POST /checkout')
    span.dispatchEvent(new Event('input', { bubbles: true }))
    return JSON.stringify({ before })
  })()`))
  if (report.error) throw new Error(report.error)
  if (report.before.service !== 'checkout-api' || report.before.span !== '') {
    throw new Error(`Builder parser cross-wired service/span fields: ${JSON.stringify(report.before)}`)
  }
  await waitFor(win, `(() => { const labels=[...document.querySelectorAll('section[aria-label="Trace explorer"] label')]; const input=(name)=>labels.find((label)=>label.querySelector('span')?.textContent?.trim()===name)?.querySelector('input'); return input('Service')?.value === 'checkout-api' && input('Span / operation')?.value === 'POST /checkout' })()`, 'independent Service and Span / operation values')
}

async function searchTraces(win) {
  await waitFor(win, `document.querySelector('[aria-label="Trace query mode"] button[aria-pressed="true"]')?.textContent?.trim() === 'Builder' && document.body.innerText.includes('300') && document.body.innerText.includes('Last hour') && document.body.innerText.includes('Sample size')`, 'configured trace Builder, time range and sample size')
  await win.webContents.executeJavaScript(`(() => {
    const section = document.querySelector('section[aria-label="Trace explorer"]')
    const button = [...(section?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent?.trim() === 'Search sample')
    button?.click()
  })()`)
  await waitFor(win, `document.body.innerText.includes('5 traces') && document.body.innerText.includes('POST /checkout') && document.body.innerText.includes('1.48s') && document.body.innerText.includes('16 matched spans') && document.querySelector('[aria-label="Successful trace"]') && document.querySelector('[aria-label="Error trace"]')`, 'realistic Tempo list results with statuses')
}

async function showScatter(win) {
  await win.webContents.executeJavaScript(`(() => {
    const group = document.querySelector('[aria-label="Trace search result view"]')
    const button = [...(group?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent?.trim() === 'Scatter')
    button?.click()
  })()`)
  await waitFor(win, `document.querySelector('[data-trace-scatter] canvas') && document.querySelector('[aria-label="Trace search result view"] button[aria-pressed="true"]')?.textContent?.trim() === 'Scatter'`, 'Tempo scatter results')
  await sleep(400)
}

async function showList(win) {
  await win.webContents.executeJavaScript(`(() => {
    const group = document.querySelector('[aria-label="Trace search result view"]')
    const button = [...(group?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent?.trim() === 'List')
    button?.click()
  })()`)
  await waitFor(win, `document.querySelector('[aria-label="Trace search result view"] button[aria-pressed="true"]')?.textContent?.trim() === 'List' && document.body.innerText.includes('16 matched spans')`, 'Tempo list results restored')
}

async function openPreviewTrace(win) {
  await win.webContents.executeJavaScript(`(() => {
    const section = document.querySelector('section[aria-label="Trace explorer"]')
    const button = [...(section?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent?.includes('checkout-api') && candidate.textContent?.includes('POST /checkout') && candidate.textContent?.includes('1.48s'))
    button?.click()
  })()`)
  await waitFor(win, `document.body.innerText.includes('Span tree') && document.body.innerText.includes('payment-service') && document.body.innerText.includes('Show async branches') && !document.body.innerText.includes('fulfilment-worker') && document.body.innerText.includes('Explore similar traces')`, 'opened focused checkout trace waterfall')
}

async function selectPaymentSpan(win) {
  await win.webContents.executeJavaScript(`(() => {
    const section = document.querySelector('section[aria-label="Trace explorer"]')
    const button = [...(section?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent?.includes('payment-service') && candidate.textContent?.includes('charge card'))
    button?.click()
  })()`)
  await waitFor(win, `document.querySelector('aside[aria-label="Selected span details"]') && document.querySelector('button[aria-label="Close span details"]') && document.body.innerText.includes('TimeoutError') && document.body.innerText.includes('Resource') && document.body.innerText.includes('Error')`, 'structured closable payment span inspector')
}

async function validateCloseAndSelectedSpanCohort(win) {
  await win.webContents.executeJavaScript(`document.querySelector('button[aria-label="Close span details"]')?.click()`)
  await waitFor(win, `!document.querySelector('aside[aria-label="Selected span details"]')`, 'closed span detail panel')
  await selectPaymentSpan(win)
  await win.webContents.executeJavaScript(`(() => {
    const section = document.querySelector('section[aria-label="Trace explorer"]')
    const button = [...(section?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent?.trim() === 'Explore similar traces')
    button?.click()
  })()`)
  await waitFor(win, `(() => {
    const section=document.querySelector('section[aria-label="Trace explorer"]');
    const labels=[...(section?.querySelectorAll('label') ?? [])];
    const field=(name)=>labels.find((label)=>label.querySelector('span')?.textContent?.trim()===name);
    return field('Namespace')?.querySelector('input')?.value === 'commerce' &&
      field('Service')?.querySelector('input')?.value === 'payment-service' &&
      field('Span / operation')?.querySelector('input')?.value === 'charge card' &&
      field('Status')?.querySelector('select')?.value === 'error' &&
      document.body.innerText.includes('selected span');
  })()`, 'selected-span cohort seed')
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
    await validateBuilderIndependence(win)
    await searchTraces(win)
    await capture(win, 'tempo-trace-search.png')
    await showScatter(win)
    await capture(win, 'tempo-trace-scatter.png')
    await showList(win)
    await openPreviewTrace(win)
    await selectPaymentSpan(win)
    await capture(win, 'tempo-waterfall.png')
    await validateCloseAndSelectedSpanCohort(win)
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})