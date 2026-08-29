import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { previewTraceId, previewTraceResult, previewTraceSearchResult } from './visual-preview/trace-fixtures.mjs'
import { assertCompactObjectFilter } from './visual-preview/assertions.mjs'

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
    const builder = document.querySelector('[data-tempo-builder]')
    const control = (name) => builder?.querySelector('[data-field][data-field-name="' + CSS.escape(name) + '"]')
    const buttonLabel = (name) => control(name)?.querySelector('button')?.getAttribute('aria-label') ?? ''
    const inputFor = (name) => control(name)?.querySelector('input')
    const exactSpan = inputFor('Exact span / operation name')
    const duration = inputFor('Min duration (ms)')
    if (!builder || !exactSpan || !duration) return JSON.stringify({ error: 'missing structured builder controls' })
    const before = {
      namespace: buttonLabel('Namespace'),
      service: buttonLabel('Service'),
      protocol: buttonLabel('Protocol or subsystem'),
      exactSpan: exactSpan.value,
      duration: duration.value
    }
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(exactSpan), 'value')
    descriptor.set.call(exactSpan, 'POST /checkout')
    exactSpan.dispatchEvent(new Event('input', { bubbles: true }))
    return JSON.stringify({ before })
  })()`))
  if (report.error) throw new Error(report.error)
  if (report.before.namespace !== 'Namespace: commerce' || report.before.service !== 'Service: checkout-api' || report.before.protocol !== 'Protocol or subsystem: Any protocol' || report.before.exactSpan !== '' || report.before.duration !== '300') {
    throw new Error(`Builder parser cross-wired structured fields: ${JSON.stringify(report.before)}`)
  }
  await waitFor(win, `(() => {
    const builder=document.querySelector('[data-tempo-builder]');
    const control=(name)=>builder?.querySelector('[data-field][data-field-name="' + CSS.escape(name) + '"]');
    return control('Service')?.querySelector('button')?.getAttribute('aria-label') === 'Service: checkout-api' && control('Exact span / operation name')?.querySelector('input')?.value === 'POST /checkout';
  })()`, 'independent Service and advanced operation values')
}

async function searchTraces(win) {
  await waitFor(win, `(() => {
    const builder = document.querySelector('[data-tempo-builder]')
    const durationControl = builder?.querySelector('[data-field][data-field-name="Min duration (ms)"]')
    return document.querySelector('[aria-label="Query mode"] button[aria-pressed="true"]')?.textContent?.trim() === 'Builder' &&
      durationControl?.querySelector('input')?.value === '300' &&
      document.body.innerText.includes('Last hour') && document.body.innerText.includes('Sample size') &&
      document.body.innerText.includes('Generated TraceQL')
  })()`, 'configured trace Builder, time range and sample size')
  const toolbar = await win.webContents.executeJavaScript(`(() => {
    const section = document.querySelector('section[aria-label="Trace explorer"]')
    const bar = section?.querySelector('[data-query-toolbar]')
    const mode = bar?.querySelector('[aria-label="Query mode"]')?.getBoundingClientRect()
    const run = bar?.querySelector('[data-tempo-run-query]')?.getBoundingClientRect()
    const text = document.body.innerText
    return { helperAbsent: !text.includes('returns up to') && !text.includes('choose All') && !/max \d+ traces|sample up to \d+ traces/i.test(text), modeTop: mode?.top, runTop: run?.top, overflow: bar ? bar.scrollWidth > bar.clientWidth : true }
  })()`)
  if (!toolbar.helperAbsent || toolbar.overflow || Math.abs(toolbar.modeTop - toolbar.runTop) > 2) throw new Error(`Tempo toolbar regression: ${JSON.stringify(toolbar)}`)
  await win.webContents.executeJavaScript(`(() => {
    const section = document.querySelector('section[aria-label="Trace explorer"]')
    const button = section?.querySelector('[data-tempo-run-query]')
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
  await waitFor(win, `(() => { const section = document.querySelector('section[aria-label="Trace explorer"]'); const text = section?.innerText ?? ''; return text.includes('Span tree') && text.includes('payment-service') && text.includes('Show async branches') && !text.includes('fulfilment-worker') && text.includes('Explore similar traces') })()`, 'opened focused checkout trace waterfall')
}

async function selectPaymentSpan(win) {
  await win.webContents.executeJavaScript(`(() => {
    const section = document.querySelector('section[aria-label="Trace explorer"]')
    const button = [...(section?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent?.includes('payment-service') && candidate.textContent?.includes('POST /charges'))
    button?.click()
  })()`)
  await waitFor(win, `document.querySelector('aside[aria-label="Selected span details"]') && document.querySelector('button[aria-label="Close span details"]') && document.body.innerText.includes('TimeoutError') && document.body.innerText.includes('HTTP & network') && document.body.innerText.includes('Error')`, 'structured closable payment HTTP span inspector')
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
    const builder=document.querySelector('[data-tempo-builder]');
    const control=(name)=>builder?.querySelector('[data-field][data-field-name="' + CSS.escape(name) + '"]');
    const aria=(name)=>control(name)?.querySelector('button')?.getAttribute('aria-label');
    const input=(name)=>control(name)?.querySelector('input')?.value;
    return aria('Namespace') === 'Namespace: commerce' &&
      aria('Service') === 'Service: payment-service' &&
      aria('Span kind') === 'Span kind: Client' &&
      aria('Protocol or subsystem') === 'Protocol or subsystem: HTTP / network' &&
      aria('HTTP method') === 'HTTP method: POST' &&
      input('Route / endpoint') === '/charges' &&
      aria('Status') === 'Status: Error' &&
      input('Exact span / operation name') === '' &&
      document.body.innerText.includes('selected span');
  })()`, 'selected HTTP span structured cohort seed')
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
    await assertCompactObjectFilter(win, 'Filter services')
    await validateBuilderIndependence(win)
    await capture(win, 'tempo-trace-builder.png')
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
