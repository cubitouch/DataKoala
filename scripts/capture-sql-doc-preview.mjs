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
  console.log(`SQL documentation preview written to ${path}`)
}

async function seedSqlWorkspace(win, view) {
  const report = await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore
    if (!store) return { error: 'window.__datakoalaStore is unavailable' }

    const state = store.getState()
    const profile = {
      id: 'docs-postgres',
      name: 'Market analytics',
      kind: 'postgres',
      version: 1,
      host: 'localhost',
      port: 5432,
      database: 'analytics',
      user: 'demo',
      password: '',
      ssl: false,
      readonly: true
    }
    const schemas = [{ name: 'analytics', isSystem: false, relations: [
      { schema: 'analytics', name: 'monthly_market_activity', qualifiedName: 'analytics.monthly_market_activity', kind: 'r', columnsStatus: 'loaded', columns: [
        { name: 'time_bucket', dataTypeID: 1184, dataTypeName: 'timestamptz', logicalType: 'timestamp' },
        { name: 'series', dataTypeID: 25, dataTypeName: 'text', logicalType: 'string' },
        { name: 'count', dataTypeID: 20, dataTypeName: 'int8', logicalType: 'number' }
      ] },
      { schema: 'analytics', name: 'market_summary', qualifiedName: 'analytics.market_summary', kind: 'v', columnsStatus: 'idle' },
      { schema: 'analytics', name: 'customer_activity', qualifiedName: 'analytics.customer_activity', kind: 'r', columnsStatus: 'idle' }
    ] }]
    const markets = ['France', 'Germany', 'Spain', 'United Kingdom', 'Italy']
    const rows = []
    for (let month = 0; month < 12; month += 1) {
      for (let index = 0; index < markets.length; index += 1) {
        rows.push({
          time_bucket: new Date(Date.UTC(2025, month, 1)),
          series: markets[index],
          count: String(920 + month * 135 + index * 260 + ((month + index) % 3) * 75)
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
      serverVersion: '17',
      metadataByProfileId: {
        ...state.metadataByProfileId,
        [profile.id]: { schemas, status: 'loaded', error: null, isStale: false }
      },
      tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? {
        ...tab,
        connectionProfileId: profile.id,
        queryMode: 'builder',
        sql: 'select time_bucket, series, count\\nfrom analytics.monthly_market_activity\\norder by time_bucket, series;',
        sqlResultFilters: [],
        builderResultFilters: [],
        builderFilterNotice: null,
        builder: {
          ...tab.builder,
          table: { schema: 'analytics', name: 'monthly_market_activity' },
          timeColumn: 'time_bucket',
          timeBucket: 'month',
          timeRange: { kind: 'all' },
          seriesColumns: ['series']
        },
        builderHasRun: true,
        builderVisualization: {
          ...tab.builderVisualization,
          view: '${view}',
          xColumn: 'time_bucket',
          valueColumn: 'count',
          seriesColumn: null,
          seriesColumns: ['series'],
          aggregation: 'sum'
        }
      } : tab)
    })

    store.getState().setResult({
      columns: [
        { name: 'time_bucket', dataTypeID: 1184, dataTypeName: 'timestamptz', logicalType: 'timestamp' },
        { name: 'series', dataTypeID: 25, dataTypeName: 'text', logicalType: 'string' },
        { name: 'count', dataTypeID: 20, dataTypeName: 'int8', logicalType: 'number' }
      ],
      rows,
      rowCount: rows.length,
      durationMs: 18
    }, null)

    return {
      rows: rows.length,
      series: new Set(rows.map((row) => row.series)).size,
      range: store.getState().tabs.find((tab) => tab.id === store.getState().activeTabId)?.builder.timeRange?.kind
    }
  })()`)

  if (report?.error) throw new Error(report.error)
  if (report?.rows !== 60 || report?.series !== 5 || report?.range !== 'all') {
    throw new Error(`Unexpected SQL documentation fixture: ${JSON.stringify(report)}`)
  }
}

async function expandDocumentationRelation(win) {
  await win.webContents.executeJavaScript(`(() => {
    const schema = document.querySelector('[role="tree"] > [role="treeitem"]')
    if (schema?.getAttribute('aria-expanded') === 'false') schema.querySelector('button')?.click()
  })()`)
  await waitFor(win, `document.body.innerText.includes('monthly_market_activity')`, 'analytics relation tree')
  await win.webContents.executeJavaScript(`(() => {
    const relationButton = document.querySelector('[role="tree"] button[aria-label="Select analytics.monthly_market_activity for Builder"]')
    const relation = relationButton?.closest('[role="treeitem"]')
    if (relation?.getAttribute('aria-expanded') === 'false') relation.querySelector('button[aria-label^="Expand"], button[aria-label^="Collapse"]')?.click()
  })()`)
  await waitFor(win, `document.body.innerText.includes('time_bucket') && document.body.innerText.includes('series') && document.body.innerText.includes('count')`, 'monthly market activity columns')
}

async function assertVisibleChart(win, view) {
  await waitFor(win,
    `document.querySelector('[data-result-chart-canvas] canvas') && document.querySelector('[role="toolbar"][aria-label="Result view"] button[aria-pressed="true"]')?.textContent?.trim() === '${view}' && document.body.innerText.includes('All time')`,
    `rendered ${view} documentation chart`)

  const report = await win.webContents.executeJavaScript(`(() => {
    const state = window.__datakoalaStore.getState()
    const tab = state.tabs.find((item) => item.id === state.activeTabId)
    return {
      view: document.querySelector('[role="toolbar"][aria-label="Result view"] button[aria-pressed="true"]')?.textContent?.trim(),
      rows: tab?.result?.rows.length,
      series: new Set(tab?.result?.rows.map((row) => row.series) ?? []).size,
      range: tab?.builder.timeRange?.kind,
      empty: Boolean(document.querySelector('[data-result-empty]'))
    }
  })()`)

  if (report.view !== view || report.rows !== 60 || report.series !== 5 || report.range !== 'all' || report.empty) {
    throw new Error(`${view} documentation chart assertion failed: ${JSON.stringify(report)}`)
  }
}

app.whenReady().then(async () => {
  ipcMain.handle('connections:list', async () => [])
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
    await win.webContents.executeJavaScript(`window.__datakoalaDocumentationCapture = true`)

    await seedSqlWorkspace(win, 'line')
    await expandDocumentationRelation(win)
    await assertVisibleChart(win, 'Line')
    await capture(win, 'docs-overview.png')

    await win.webContents.executeJavaScript(`window.__datakoalaStore.getState().setVisualization('builder', { view: 'bar' })`)
    await assertVisibleChart(win, 'Bar')
    await capture(win, 'docs-builder.png')

    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
