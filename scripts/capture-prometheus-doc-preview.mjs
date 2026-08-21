import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  await sleep(500)
  const image = await win.webContents.capturePage()
  const path = resolve(outputDir, filename)
  await writeFile(path, image.toPNG())
  console.log(`Prometheus documentation preview written to ${path}`)
}

async function seedPrometheusWorkspace(win) {
  const report = await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore
    if (!store) return { error: 'window.__datakoalaStore is unavailable' }

    const state = store.getState()
    const profile = {
      id: 'docs-prometheus',
      name: 'Service metrics',
      kind: 'prometheus',
      version: 1,
      readonly: true,
      transport: { kind: 'gcx', datasourceUid: 'sample-metrics' }
    }
    const schemas = [{ name: 'Prometheus', isSystem: false, relations: [
      { schema: 'Prometheus', name: 'http_requests_total', qualifiedName: 'http_requests_total', kind: 'metric', columnsStatus: 'idle', details: { kind: 'metric', type: 'counter', help: 'Total HTTP requests.' } },
      { schema: 'Prometheus', name: 'http_request_duration_seconds_bucket', qualifiedName: 'http_request_duration_seconds_bucket', kind: 'metric', columnsStatus: 'idle', details: { kind: 'metric', type: 'histogram', help: 'HTTP request duration buckets.' } },
      { schema: 'Prometheus', name: 'process_memory_bytes', qualifiedName: 'process_memory_bytes', kind: 'metric', columnsStatus: 'idle', details: { kind: 'metric', type: 'gauge', help: 'Resident process memory.' } }
    ] }]

    const rows = []
    const stepMs = 14 * 60 * 1000
    const end = Date.now() - 15 * 60 * 1000
    const start = end - 24 * stepMs
    const services = ['api', 'worker']
    for (let point = 0; point < 25; point += 1) {
      for (let serviceIndex = 0; serviceIndex < services.length; serviceIndex += 1) {
        const wave = Math.sin((point + serviceIndex * 2) / 3) * 0.035
        const trend = point * (serviceIndex === 0 ? 0.0018 : 0.0011)
        rows.push({
          timestamp: new Date(start + point * stepMs),
          service: services[serviceIndex],
          value: Number((0.19 + serviceIndex * 0.075 + wave + trend).toFixed(3))
        })
      }
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
        [profile.id]: { schemas, status: 'loaded', error: null, isStale: false }
      },
      tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? {
        ...tab,
        title: 'Service latency',
        connectionProfileId: profile.id,
        queryMode: 'builder',
        sql: 'histogram_quantile(\\n  0.95,\\n  sum by (service, le) (rate(http_request_duration_seconds_bucket{environment="production"}[5m]))\\n)',
        prometheusTimeRange: { kind: 'rolling', amount: 6, unit: 'hour' },
        prometheusStep: '30s',
        promqlBuilder: {
          ...tab.promqlBuilder,
          metric: 'http_request_duration_seconds_bucket',
          filterBy: ['environment'],
          groupBy: ['service'],
          labelValues: { environment: ['production'], service: ['api', 'worker'] },
          calculation: 'percentile',
          aggregation: 'sum',
          percentile: 0.95,
          window: '5m'
        },
        sqlVisualization: {
          ...tab.sqlVisualization,
          view: 'line',
          xColumn: 'timestamp',
          valueColumn: 'value',
          seriesColumn: 'service',
          seriesColumns: [],
          aggregation: 'sum'
        },
        builderVisualization: {
          ...tab.builderVisualization,
          view: 'line',
          xColumn: 'timestamp',
          valueColumn: 'value',
          seriesColumn: 'service',
          seriesColumns: [],
          aggregation: 'sum'
        }
      } : tab)
    })

    store.getState().setResult({
      columns: [
        { name: 'timestamp', dataTypeName: 'timestamp', logicalType: 'timestamp' },
        { name: 'service', dataTypeName: 'text', logicalType: 'string' },
        { name: 'value', dataTypeName: 'double precision', logicalType: 'number' }
      ],
      rows,
      rowCount: rows.length,
      durationMs: 42
    }, null)

    return {
      rows: rows.length,
      firstTimestamp: rows[0].timestamp.getTime(),
      lastTimestamp: rows[rows.length - 1].timestamp.getTime()
    }
  })()`)

  if (report?.error) throw new Error(report.error)
  if (report?.rows !== 50) throw new Error(`Unexpected Prometheus preview row count: ${JSON.stringify(report)}`)
  const now = Date.now()
  if (report.firstTimestamp < now - 6 * 60 * 60 * 1000 || report.lastTimestamp > now) {
    throw new Error(`Prometheus documentation fixture escaped its selected six-hour range: ${JSON.stringify(report)}`)
  }

  await waitFor(win,
    `document.querySelector('[aria-label="Query mode"] .active')?.textContent?.trim() === 'Builder' && document.querySelector('.promql-builder-form') && document.body.innerText.includes('http_request_duration_seconds_bucket')`,
    'configured Prometheus Builder')
  await waitFor(win,
    `document.querySelector('[data-result-chart-canvas] canvas') && document.querySelector('[role="toolbar"][aria-label="Result view"] button[aria-pressed="true"]')?.textContent?.trim() === 'Line' && document.body.innerText.includes('Last 6 hours')`,
    'rendered Prometheus line result')

  await win.webContents.executeJavaScript(`(() => {
    const schema = [...document.querySelectorAll('[role="treeitem"]')].find((item) => item.textContent?.includes('Prometheus'))
    if (schema?.getAttribute('aria-expanded') === 'false') schema.querySelector('button')?.click()
  })()`)
  await waitFor(win, `document.body.innerText.includes('http_request_duration_seconds_bucket')`, 'expanded Prometheus metric tree')
}

app.whenReady().then(async () => {
  ipcMain.handle('connections:list', async () => [])
  ipcMain.handle('connections:prometheus:metric-labels', async () => ['environment', 'service'])
  ipcMain.handle('connections:prometheus:label-values', async (_event, _connectionId, _metric, label) => label === 'environment' ? ['production'] : ['api', 'worker'])
  ipcMain.handle('query:run', async () => ({ columns: [], rows: [], rowCount: 0, durationMs: 0 }))

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
    await seedPrometheusWorkspace(win)
    await capture(win, 'docs-prometheus.png')
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
