// Deterministic PostgreSQL EXPLAIN ANALYZE preview.
// The execution-plan tree is synthetic and rendered by the real renderer; no database or AI provider is used.
import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.DATAKOALA_SMOKE = '1'
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const output = resolve(process.env.DATAKOALA_PREVIEW_OUTPUT ?? 'visual-preview')
const sleep = (ms) =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

async function wait(win, expression, description) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await win.webContents.executeJavaScript(`Boolean(${expression})`)) return
    await sleep(100)
  }
  throw new Error(`EXPLAIN preview did not become ready: ${description}`)
}

const tree = {
  id: '0',
  plan: 'Limit',
  nodeType: 'Limit',
  startupCost: 1284.42,
  totalCost: 1284.67,
  planRows: 100,
  actualRows: 101,
  actualTotalTime: 24.8,
  loops: 1,
  children: [
    {
      id: '0.0',
      plan: 'Sort',
      nodeType: 'Sort',
      startupCost: 1284.42,
      totalCost: 1286.92,
      planRows: 1000,
      actualRows: 1000,
      actualTotalTime: 24.7,
      loops: 1,
      sortKey: ['sum(o.amount) DESC'],
      sortMethod: 'top-N heapsort',
      sortSpaceUsed: 49,
      sortSpaceType: 'Memory',
      children: [
        {
          id: '0.0.0',
          plan: 'HashAggregate',
          nodeType: 'HashAggregate',
          strategy: 'Hashed',
          startupCost: 1214.59,
          totalCost: 1224.59,
          planRows: 1000,
          actualRows: 84,
          actualTotalTime: 23.9,
          loops: 1,
          groupKey: ['c.country'],
          peakMemoryUsage: 193,
          children: [
            {
              id: '0.0.0.0',
              plan: 'Hash Join',
              nodeType: 'Hash Join',
              joinType: 'Inner',
              startupCost: 312.14,
              totalCost: 1102.05,
              planRows: 120,
              actualRows: 84000,
              actualTotalTime: 20.3,
              loops: 1,
              hashCond: '(o.customer_id = c.id)',
              sharedHitBlocks: 1287,
              sharedReadBlocks: 42,
              children: [
                {
                  id: '0.0.0.0.0',
                  plan: 'Seq Scan on orders o',
                  nodeType: 'Seq Scan',
                  schema: 'analytics',
                  relation: 'orders',
                  alias: 'o',
                  startupCost: 0,
                  totalCost: 741.31,
                  planRows: 84000,
                  actualRows: 84000,
                  actualTotalTime: 11.6,
                  loops: 1,
                  filter: "(created_at >= (now() - '30 days'::interval))",
                  rowsRemovedByFilter: 12500,
                  sharedHitBlocks: 1104,
                  sharedReadBlocks: 42,
                },
                {
                  id: '0.0.0.0.1',
                  plan: 'Hash',
                  nodeType: 'Hash',
                  startupCost: 186.4,
                  totalCost: 186.4,
                  planRows: 10000,
                  actualRows: 10000,
                  actualTotalTime: 4.2,
                  loops: 1,
                  hashBatches: 1,
                  peakMemoryUsage: 516,
                  children: [
                    {
                      id: '0.0.0.0.1.0',
                      plan: 'Index Scan using customers_pkey on customers c',
                      nodeType: 'Index Scan',
                      schema: 'analytics',
                      relation: 'customers',
                      alias: 'c',
                      index: 'customers_pkey',
                      startupCost: 0.29,
                      totalCost: 186.4,
                      planRows: 10000,
                      actualRows: 10000,
                      actualTotalTime: 2.5,
                      loops: 10,
                      indexCond: '(active = true)',
                      sharedHitBlocks: 183,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

app.whenReady().then(async () => {
  try {
    ipcMain.handle('connections:list', () => [])
    ipcMain.handle('connections:live', () => [])
    ipcMain.handle('ai:settings:get', () => ({
      ok: true,
      value: { provider: 'openrouter', model: '', hasApiKey: false },
    }))

    const win = new BrowserWindow({
      width: 1440,
      height: 1000,
      show: true,
      backgroundColor: '#0f1115',
      webPreferences: {
        preload: resolve(root, 'out/preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    })

    await win.loadFile(resolve(root, 'out/renderer/index.html'))
    await wait(
      win,
      `document.getElementById('root')?.children.length && window.__datakoalaStore`,
      'renderer store',
    )

    await win.webContents.executeJavaScript(`(() => {
      const store = window.__datakoalaStore
      const state = store.getState()
      const profile = {
        id: 'explain-preview',
        name: 'Analytics warehouse',
        kind: 'postgres',
        version: 2,
        host: 'localhost',
        port: 5432,
        database: 'analytics',
        user: 'preview',
        password: '',
        tlsMode: 'disable',
        readonly: true
      }
      const sql = "SELECT c.country, sum(o.amount) AS revenue\\nFROM analytics.orders o\\nJOIN analytics.customers c ON c.id = o.customer_id\\nWHERE o.created_at >= now() - interval '30 days'\\nGROUP BY c.country\\nORDER BY revenue DESC\\nLIMIT 100;"
      store.setState({
        profiles: [profile],
        activeProfileId: profile.id,
        connected: true,
        connecting: false,
        connectionStatus: 'connected',
        connectionError: null,
        serverVersion: '17',
        tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? {
          ...tab,
          title: 'Revenue by country',
          connectionProfileId: profile.id,
          queryMode: 'sql',
          sql,
          explainTree: ${JSON.stringify(tree)},
          explainText: 'Limit  (cost=1284.42..1284.67 rows=100) (actual time=24.800..24.800 rows=101 loops=1)',
          explainSnapshot: { query: sql, mode: 'analyze', planningTimeMs: 1.42, executionTimeMs: 25.31 },
          showExplain: true,
          activeExplainRequest: null
        } : tab)
      })
    })()`)

    await wait(
      win,
      `document.querySelector('[aria-label="Execution plan diagram"]') && document.body.innerText.includes('EXPLAIN ANALYZE') && document.body.innerText.includes('700× estimate') && document.body.innerText.includes('close estimate') && document.body.innerText.includes('2.50 ms / loop') && document.body.innerText.includes('≈25.00 ms total')`,
      'execution-plan diagnostics',
    )

    const report = await win.webContents.executeJavaScript(`(() => {
      const diagram = document.querySelector('[aria-label="Execution plan diagram"]')
      const nodes = [...document.querySelectorAll('[data-testid="plan-node"]')]
      const text = diagram?.innerText ?? ''
      return {
        nodeCount: nodes.length,
        categories: ['Limit', 'Sort', 'Aggregate', 'Join', 'Scan', 'Hash'].filter((label) => text.includes(label)),
        hasSummary: text.includes('Planning time') && text.includes('Execution time'),
        hasMeasuredTime: text.includes('Measured time'),
        hasPlannerMsConfusion: /Planner cost[^\\n]*ms/i.test(text),
        width: diagram?.getBoundingClientRect().width,
        height: diagram?.getBoundingClientRect().height
      }
    })()`)
    if (
      report.nodeCount < 7 ||
      report.categories.length < 6 ||
      !report.hasSummary ||
      !report.hasMeasuredTime ||
      report.hasPlannerMsConfusion ||
      report.width < 700 ||
      report.height < 300
    ) {
      throw new Error(`EXPLAIN preview semantic/layout assertion failed: ${JSON.stringify(report)}`)
    }

    await win.webContents.executeJavaScript(
      `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
    )
    await sleep(150)
    await mkdir(output, { recursive: true })
    await writeFile(
      resolve(output, 'explain-plan.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
