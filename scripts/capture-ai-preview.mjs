// Deterministic AI previews. All IPC is mocked; this harness never loads the AI provider.
import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

process.env.DATAKOALA_SMOKE = '1'
const output = resolve(process.env.DATAKOALA_PREVIEW_OUTPUT ?? 'visual-preview')
const ok = (value) => ({ ok: true, value })
const profile = {
  id: 'ai-preview',
  name: 'Commerce analytics',
  kind: 'postgres',
  version: 2,
  host: 'localhost',
  port: 5432,
  database: 'demo',
  user: 'demo',
  password: '',
  tlsMode: 'disable',
  readonly: true,
}
const bigQueryProfile = {
  id: 'ai-preview-bigquery',
  name: 'Warehouse analytics',
  kind: 'bigquery',
  version: 1,
  billingProject: 'billing-project',
  defaultProject: 'my-project',
  defaultDataset: 'analytics',
  maximumBytesBilled: '',
  readonly: true,
}
const bigQueryColumns = [
  { name: 'id', dataTypeName: 'STRING' },
  { name: 'country', dataTypeName: 'STRING' },
  { name: 'created_at', dataTypeName: 'TIMESTAMP' },
  { name: 'revenue', dataTypeName: 'NUMERIC' },
]
const bigQueryCatalogRelations = [
  'campaigns',
  'customers',
  'inventory',
  'products',
  'refunds',
  'sessions',
  'shipments',
  'subscriptions',
  'support_tickets',
].map((name) => ({
  schema: 'my-project.analytics',
  name,
  kind: 'r',
  qualifiedName: `my-project.analytics.${name}`,
  columnsStatus: 'loaded',
  columns: [{ name: 'id', dataTypeName: 'STRING' }],
}))
const columns = [
  { name: 'id', dataTypeName: 'uuid' },
  { name: 'country', dataTypeName: 'text' },
  { name: 'created_at', dataTypeName: 'timestamptz' },
  { name: 'amount', dataTypeName: 'numeric' },
  { name: 'revenue', dataTypeName: 'numeric' },
]
const query =
  "SELECT country, sum(amount) AS revenue\nFROM public.orders\nWHERE created_at >= now() - interval '30 days'\nGROUP BY country\nORDER BY revenue DESC;"
const bigQueryInitialQuery =
  'SELECT * FROM \`my-project.analytics.orders\` LIMIT 100;'
const bigQueryQuery =
  'SELECT country, SUM(revenue) AS revenue\\nFROM \`my-project.analytics.orders\`\\nWHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)\\nGROUP BY country\\nORDER BY revenue DESC;'
const failedQuery = 'SELECT device_id FROM public.orders;'
const fixedQuery = 'SELECT id AS device_id FROM public.orders;'
const bigQueryFailedQuery =
  'SELECT country, SUM(revenu) AS revenue\nFROM `my-project.analytics.orders`\nGROUP BY country;'
const bigQueryFixedQuery =
  'SELECT country, SUM(revenue) AS revenue\nFROM `my-project.analytics.orders`\nGROUP BY country;'
let failNextRepair = true
let queryRuns = 0
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function wait(win, expression) {
  for (let i = 0; i < 100; i++) {
    if (await win.webContents.executeJavaScript(`Boolean(${expression})`))
      return
    await sleep(100)
  }
  throw new Error(`AI preview did not become ready: ${expression}`)
}
async function click(win, label) {
  await win.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)} || b.getAttribute('aria-label') === ${JSON.stringify(label)})
    if (!button) throw new Error('Missing preview button')
    button.click()
  })()`)
}

async function settlePaint(win) {
  await win.webContents.executeJavaScript(
    `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
  )
  await sleep(100)
}

async function captureSettingsDialog(win) {
  const rect = await win.webContents.executeJavaScript(`(() => {
    const backdrop = document.querySelector('[data-modal-backdrop]')
    const dialog = document.querySelector('[role="dialog"]')
    if (!backdrop || !dialog) throw new Error('AI settings dialog is not open')

    backdrop.style.setProperty('backdrop-filter', 'none', 'important')
    backdrop.style.setProperty('-webkit-backdrop-filter', 'none', 'important')

    const bounds = dialog.getBoundingClientRect()
    const margin = 20
    const x = Math.max(0, Math.floor(bounds.left - margin))
    const y = Math.max(0, Math.floor(bounds.top - margin))
    return {
      x,
      y,
      width: Math.min(window.innerWidth - x, Math.ceil(bounds.width + margin * 2)),
      height: Math.min(window.innerHeight - y, Math.ceil(bounds.height + margin * 2)),
    }
  })()`)

  const image = await win.webContents.capturePage(rect)
  const size = image.getSize()
  if (size.width < 400 || size.height < 260) {
    throw new Error(
      `AI settings preview crop is unexpectedly small: ${size.width}x${size.height}`,
    )
  }
  return image.toPNG()
}
app.whenReady().then(async () => {
  try {
    ipcMain.handle('connections:list', () => [])
    ipcMain.handle('connections:live', () => [])
    ipcMain.handle('connection:describe-table', () => columns)
    ipcMain.handle('query:run', () => {
      queryRuns++
      return { columns: [], rows: [] }
    })
    ipcMain.handle('ai:settings:get', () =>
      ok({ provider: 'openrouter', model: 'preview/model', hasApiKey: true }),
    )
    ipcMain.handle('ai:models', () =>
      ok([{ id: 'preview/model', name: 'Preview analytical model' }]),
    )
    ipcMain.handle('ai:test', () => ok(undefined))
    ipcMain.handle('ai:cancel', () => ok(undefined))
    ipcMain.handle('ai:analyze-anomalies', (_event, request) => {
      const sample = request.chart.series[0]?.points ?? []
      if (
        !sample.some((point) => point.y === 800) ||
        !sample.some((point) => point.y === -40)
      )
        throw new Error('AI anomaly preview did not receive bucket extrema')
      const spikeIndex = sample.findIndex((point) => point.y === 800)
      const dropIndex = sample.findIndex((point) => point.y === -40)
      return ok({
        summary: 'Two sharp changes stand out in the request series.',
        anomalies: [
          {
            seriesIndex: 0,
            pointIndex: spikeIndex,
            title: 'Narrow spike',
            reason: 'Requests rise sharply to 800 near day 17.',
            severity: 'high',
          },
          {
            seriesIndex: 0,
            pointIndex: dropIndex,
            title: 'Narrow drop',
            reason: 'Requests fall sharply to -40 near day 42.',
            severity: 'medium',
          },
        ],
        limitations: [
          'The sample shows when the changes occurred, not what caused them.',
        ],
        followUps: ['Compare this window with the previous period.'],
      })
    })
    ipcMain.handle('ai:propose', (_event, request) => {
      if (request.intent === 'repair' && failNextRepair) {
        failNextRepair = false
        return {
          ok: false,
          code: 'invalid-response',
          message:
            'The model returned an invalid query step. Try again or choose another model.',
        }
      }
      let proposalQuery = query
      if (request.intent === 'repair') {
        proposalQuery =
          request.context?.language?.dialect === 'google-sql'
            ? bigQueryFixedQuery
            : fixedQuery
      } else if (request.context?.language?.dialect === 'google-sql') {
        proposalQuery = bigQueryQuery
      }
      let explanation =
        'Aggregates revenue by country for orders created within the last 30 days, with the highest revenue first.'
      if (request.intent === 'repair') {
        explanation =
          request.context?.language?.dialect === 'google-sql'
            ? 'Corrected the misspelled revenue column while preserving the BigQuery aggregation.'
            : 'Replaced the missing device_id column with the available id column while preserving the result name.'
      }
      return ok({
        kind: 'proposal',
        proposal: {
          query: proposalQuery,
          explanation,
          assumptions: [
            'amount is the order revenue in a consistent currency.',
            'The date range is relative to the database clock.',
          ],
        },
      })
    })
    ipcMain.handle('ai:propose-builder', (_event, request) =>
      ok({
        kind: 'proposal',
        proposal: {
          patch: {
            xColumn: 'country',
            valueColumn: 'revenue',
            aggregation: 'sum',
          },
          explanation:
            'Groups orders by country and sums the revenue column using the existing Builder controls.',
          assumptions: ['revenue is the intended numeric order value.'],
        },
      }),
    )
    const win = new BrowserWindow({
      width: 1440,
      height: 1000,
      show: true,
      backgroundColor: '#0f1115',
      webPreferences: {
        preload: resolve('out/preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    })
    await win.loadFile(resolve('out/renderer/index.html'))
    await wait(win, `document.visibilityState === 'visible'`)
    await wait(
      win,
      `window.__datakoalaStore && [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Settings')`,
    )
    await win.webContents.executeJavaScript(`(() => {
      const store = window.__datakoalaStore, state = store.getState(), profile = ${JSON.stringify(profile)}
      store.setState({ profiles: [profile], activeProfileId: profile.id, connected: true, connecting: false, connectionStatus: 'connected',
        metadataByProfileId: { [profile.id]: { status: 'loaded', isStale: false, error: null, schemas: [{ name: 'public', isSystem: false, relations: [{ schema: 'public', name: 'orders', kind: 'r', qualifiedName: 'public.orders', columnsStatus: 'loaded', columns: ${JSON.stringify(columns)} }] }] } },
        tabs: state.tabs.map((tab) => ({ ...tab, connectionProfileId: profile.id, queryMode: 'sql', sql: 'SELECT * FROM public.orders LIMIT 100;' })) })
    })()`)
    await mkdir(output, { recursive: true })
    await click(win, 'Settings')
    await wait(
      win,
      'document.body.innerText.includes("Preview analytical model")',
    )
    await click(win, 'Test connection')
    await wait(win, `document.querySelector('[data-tone="success"]')`)
    await settlePaint(win)
    await writeFile(
      resolve(output, 'ai-settings.png'),
      await captureSettingsDialog(win),
    )
    await click(win, 'Cancel')
    // Enlarge the resizable editor through its real keyboard control for diff review.
    for (let i = 0; i < 28; i++) {
      await win.webContents.executeJavaScript(
        `document.querySelector('.editor-resizer').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))`,
      )
      await sleep(20)
    }
    await wait(
      win,
      `document.querySelector('[data-field-name="AI prompt"] input')`,
    )
    await win.webContents.executeJavaScript(
      `(() => { const input = document.querySelector('[data-field-name="AI prompt"] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'revenue by country over the last 30 days'); input.dispatchEvent(new Event('input', { bubbles: true })) })()`,
    )
    await wait(
      win,
      '[...document.querySelectorAll("button")].some((b) => b.getAttribute("aria-label") === "Ask" && !b.disabled)',
    )
    const aligned = await win.webContents.executeJavaScript(`(() => {
      const form = document.querySelector('[aria-label="SQL AI copilot"] form');
      const height = form.querySelector('input').getBoundingClientRect().height;
      return [...form.querySelectorAll('button')].every(button => Math.abs(button.getBoundingClientRect().height - height) < 1);
    })()`)
    if (!aligned) throw new Error('AI composer control heights do not match')
    await click(win, 'Ask')
    await wait(
      win,
      '[...document.querySelectorAll("button")].some((b) => b.textContent === "Apply")',
    )
    await wait(
      win,
      `document.querySelector('[data-diff-kind="add"]') && document.querySelector('[data-diff-kind="remove"]')`,
    )
    const unchanged = await win.webContents.executeJavaScript(
      'window.__datakoalaStore.getState().tabs[0].sql',
    )
    if (unchanged !== 'SELECT * FROM public.orders LIMIT 100;')
      throw new Error('Proposal changed SQL before Apply')
    await click(win, 'View AI details')
    await wait(
      win,
      `document.querySelector('button[aria-label="View AI details"]')?.getAttribute('aria-expanded') === 'true'`,
    )
    await wait(
      win,
      `[...document.querySelectorAll('[data-popover-overlay]')].some((overlay) => overlay.textContent.includes('AI details') && overlay.textContent.includes('Assumptions') && overlay.textContent.includes('Submitted context'))`,
    )
    await settlePaint(win)
    await writeFile(
      resolve(output, 'ai-query-proposal.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    await win.webContents.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`,
    )
    await wait(
      win,
      `document.querySelector('button[aria-label="View AI details"]')?.getAttribute('aria-expanded') === 'false'`,
    )
    await click(win, 'Apply')
    await wait(
      win,
      `document.querySelector('[data-field-name="AI prompt"] input')?.value === ''`,
    )
    const applied = await win.webContents.executeJavaScript(
      'window.__datakoalaStore.getState().tabs[0].sql',
    )
    if (applied !== query)
      throw new Error('AI preview did not apply the proposal')

    // Exercise the same raw-query AI review lifecycle with BigQuery/GoogleSQL.
    await win.webContents.executeJavaScript(`(() => {
      const store = window.__datakoalaStore, state = store.getState()
      const bq = ${JSON.stringify(bigQueryProfile)}
      store.setState({
        profiles: [...state.profiles.filter((item) => item.id !== bq.id), bq],
        activeProfileId: bq.id,
        metadataByProfileId: {
          ...state.metadataByProfileId,
          [bq.id]: {
            status: 'loaded',
            isStale: false,
            error: null,
            schemas: [{
              name: 'my-project.analytics',
              isSystem: false,
              relations: [{
                schema: 'my-project.analytics',
                name: 'orders',
                kind: 'r',
                qualifiedName: 'my-project.analytics.orders',
                columnsStatus: 'loaded',
                columns: ${JSON.stringify(bigQueryColumns)},
              }, ...${JSON.stringify(bigQueryCatalogRelations)}],
            }],
          },
        },
        tabs: state.tabs.map((tab) => ({
          ...tab,
          connectionProfileId: bq.id,
          queryMode: 'sql',
          sql: ${JSON.stringify(bigQueryInitialQuery)},
          queryError: null,
          repairableQueryError: null,
        })),
      })
    })()`)
    await wait(
      win,
      `document.querySelector('[data-field-name="AI prompt"] input')`,
    )
    await win.webContents.executeJavaScript(
      `(() => { const input = document.querySelector('[data-field-name="AI prompt"] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'revenue by country over the last 30 days'); input.dispatchEvent(new Event('input', { bubbles: true })) })()`,
    )
    await wait(
      win,
      '[...document.querySelectorAll("button")].some((b) => b.getAttribute("aria-label") === "Ask" && !b.disabled)',
    )
    await click(win, 'Ask')
    await wait(
      win,
      '[...document.querySelectorAll("button")].some((b) => b.textContent === "Apply")',
    )
    const bigQueryUnchanged = await win.webContents.executeJavaScript(
      'window.__datakoalaStore.getState().tabs[0].sql',
    )
    if (bigQueryUnchanged !== bigQueryInitialQuery)
      throw new Error('BigQuery proposal changed SQL before Apply')
    if (queryRuns !== 0)
      throw new Error('BigQuery proposal executed a query before Apply')
    await click(win, 'View AI details')
    await wait(
      win,
      `[...document.querySelectorAll('[data-popover-overlay]')].some((overlay) => overlay.textContent.includes('GoogleSQL · OpenRouter') && overlay.textContent.includes('my-project.analytics.orders') && overlay.textContent.includes('Available relation names') && overlay.textContent.includes('4 additional relations · names only') && overlay.textContent.includes('my-project.analytics.subscriptions'))`,
    )
    await win.webContents.executeJavaScript(`(() => {
      const overlay = [...document.querySelectorAll('[data-popover-overlay]')].find((item) => item.textContent.includes('GoogleSQL · OpenRouter'))
      const catalog = overlay?.querySelector('[aria-label="Available relation names"]')
      catalog?.scrollIntoView({ block: 'center' })
    })()`)
    await settlePaint(win)
    await writeFile(
      resolve(output, 'ai-query-bigquery-proposal.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    await win.webContents.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`,
    )
    await click(win, 'Apply')
    await wait(
      win,
      `window.__datakoalaStore.getState().tabs[0].sql === ${JSON.stringify(bigQueryQuery)}`,
    )
    if (queryRuns !== 0)
      throw new Error('Applying BigQuery proposal executed a query')

    await win.webContents.executeJavaScript(`(() => {
      const store = window.__datakoalaStore, state = store.getState()
      store.setState({
        activeProfileId: ${JSON.stringify(profile.id)},
        tabs: state.tabs.map((tab) => ({
          ...tab,
          connectionProfileId: ${JSON.stringify(profile.id)},
        })),
      })
    })()`)

    // Exercise the real SQL Builder integration with a previously-run Builder.
    await win.webContents.executeJavaScript(`(() => {
      const store = window.__datakoalaStore, state = store.getState()
      store.setState({
        tabs: state.tabs.map((tab) => ({
          ...tab,
          queryMode: 'builder',
          builder: {
            ...tab.builder,
            table: { schema: 'public', name: 'orders' },
            timeColumn: 'created_at',
            timeBucket: 'day',
            timeRange: { kind: 'rolling', amount: 7, unit: 'day' },
            seriesColumns: [],
          },
          builderVisualization: {
            ...tab.builderVisualization,
            xColumn: 'created_at',
            valueColumn: null,
            aggregation: 'count',
            seriesColumn: null,
            seriesColumns: [],
          },
          builderHasRun: true,
        })),
      })
    })()`)
    await wait(
      win,
      `document.querySelector('[data-field-name="Builder AI prompt"] input')`,
    )
    const builderBefore = await win.webContents.executeJavaScript(`(() => {
      const tab = window.__datakoalaStore.getState().tabs[0]
      const generated = document.querySelector('[aria-label="Generated SQL query"] .cm-content')?.textContent ?? ''
      return {
        builder: JSON.stringify(tab.builder),
        visualization: JSON.stringify(tab.builderVisualization),
        generated,
      }
    })()`)
    await win.webContents.executeJavaScript(
      `(() => { const input = document.querySelector('[data-field-name="Builder AI prompt"] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'sum revenue by country'); input.dispatchEvent(new Event('input', { bubbles: true })) })()`,
    )
    await wait(
      win,
      '[...document.querySelectorAll("button")].some((b) => b.getAttribute("aria-label") === "Ask" && !b.disabled)',
    )
    await click(win, 'Ask')
    await wait(
      win,
      `document.querySelector('[aria-label="AI Builder proposal"]') && document.querySelector('[data-builder-ai-change="X axis"]') && document.querySelector('[data-builder-ai-change="Y axis"]')`,
    )
    const builderPending = await win.webContents.executeJavaScript(`(() => {
      const tab = window.__datakoalaStore.getState().tabs[0]
      const generated = document.querySelector('[aria-label="Generated SQL query"] .cm-content')?.textContent ?? ''
      return {
        builder: JSON.stringify(tab.builder),
        visualization: JSON.stringify(tab.builderVisualization),
        generated,
      }
    })()`)
    if (
      builderPending.builder !== builderBefore.builder ||
      builderPending.visualization !== builderBefore.visualization ||
      builderPending.generated !== builderBefore.generated
    )
      throw new Error(
        'Builder AI proposal mutated Builder state or generated SQL before Apply',
      )
    if (queryRuns !== 0)
      throw new Error('Builder AI proposal executed a query before Apply')
    await click(win, 'View AI details')
    await wait(
      win,
      `[...document.querySelectorAll('[data-popover-overlay]')].some((overlay) => overlay.textContent.includes('Current Builder state') && overlay.textContent.includes('public.orders') && overlay.textContent.includes('revenue numeric'))`,
    )
    await settlePaint(win)
    await writeFile(
      resolve(output, 'ai-builder-proposal.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    await win.webContents.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`,
    )
    await click(win, 'Apply')
    await wait(
      win,
      `(() => { const tab = window.__datakoalaStore.getState().tabs[0]; return tab.builderVisualization.xColumn === 'country' && tab.builderVisualization.valueColumn === 'revenue' && tab.builderVisualization.aggregation === 'sum' && tab.builderHasRun === false })()`,
    )
    await wait(
      win,
      `document.querySelector('[aria-label="Generated SQL query"] .cm-content')?.textContent.includes('SUM("revenue")')`,
    )
    const builderAfterSql = await win.webContents.executeJavaScript(
      `document.querySelector('[aria-label="Generated SQL query"] .cm-content')?.textContent ?? ''`,
    )
    if (builderAfterSql === builderBefore.generated)
      throw new Error('Builder-generated SQL did not change after Apply')
    if (queryRuns !== 0)
      throw new Error('Applying a Builder AI proposal executed a query')

    await win.webContents.executeJavaScript(`(() => {
      const store = window.__datakoalaStore, state = store.getState()
      store.setState({ tabs: state.tabs.map((tab) => ({ ...tab, queryMode: 'sql', sql: ${JSON.stringify(failedQuery)}, queryError: 'ERROR: column orders.device_id does not exist\\nLINE 1 Position: 8 SQLSTATE 42703', repairableQueryError: { query: ${JSON.stringify(failedQuery)}, error: 'ERROR: column orders.device_id does not exist\\nLINE 1 Position: 8 SQLSTATE 42703 password=[REDACTED]' } })) })
    })()`)
    await wait(
      win,
      `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Fix with AI')`,
    )
    await settlePaint(win)
    await writeFile(
      resolve(output, 'ai-query-repair-error.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    await click(win, 'Fix with AI')
    await wait(
      win,
      `document.body.textContent.includes('AI repair') && document.body.textContent.includes("AI couldn't produce a usable repair this time.") && !document.body.textContent.includes('choose another model') && !document.body.textContent.includes('invalid query step')`,
    )
    await settlePaint(win)
    await writeFile(
      resolve(output, 'ai-query-repair-failure.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    await click(win, 'Fix with AI')
    await wait(
      win,
      `document.querySelector('[aria-label="AI query repair review"]') && document.querySelector('[aria-label="SQL proposal diff"]') && document.querySelector('[data-diff-kind="add"]') && document.querySelector('[data-diff-kind="remove"]')`,
    )
    const repairReview = await win.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('[aria-label="SQL editor"] .cm-content') ?? document.querySelector('.cm-content')
      const diff = document.querySelector('[aria-label="SQL proposal diff"]')
      return {
        editorText: editor?.textContent ?? '',
        diffText: diff?.textContent ?? '',
        storedSql: window.__datakoalaStore.getState().tabs[0].sql,
        hasReview: Boolean(document.querySelector('[aria-label="AI query repair review"]')),
      }
    })()`)
    if (!repairReview.editorText.includes(failedQuery))
      throw new Error(
        `Repair review replaced SQL before Apply: ${JSON.stringify(repairReview)}`,
      )
    if (
      !repairReview.diffText.includes(failedQuery) ||
      !repairReview.diffText.includes(fixedQuery)
    )
      throw new Error(
        `Repair diff does not show the failed and proposed SQL: ${JSON.stringify(repairReview)}`,
      )
    if (repairReview.storedSql !== failedQuery)
      throw new Error('Repair proposal changed stored SQL before Apply')
    if (!repairReview.hasReview)
      throw new Error('Repair diff review is missing')
    await settlePaint(win)
    await writeFile(
      resolve(output, 'ai-query-repair-proposal.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    await click(win, 'Apply')
    await wait(
      win,
      `window.__datakoalaStore.getState().tabs[0].sql === ${JSON.stringify(fixedQuery)}`,
    )
    if (queryRuns !== 0)
      throw new Error('Applying PostgreSQL repair executed a query')

    // Cross-datasource repair preview: the same review UI should expose the
    // canonical GoogleSQL dialect while leaving the failed SQL untouched.
    await win.webContents.executeJavaScript(`(() => {
      const store = window.__datakoalaStore, state = store.getState()
      const bq = ${JSON.stringify(bigQueryProfile)}
      store.setState({
        profiles: [...state.profiles.filter((item) => item.id !== bq.id), bq],
        activeProfileId: bq.id,
        metadataByProfileId: {
          ...state.metadataByProfileId,
          [bq.id]: {
            status: 'loaded',
            isStale: false,
            error: null,
            schemas: [{
              name: 'my-project.analytics',
              isSystem: false,
              relations: [{
                schema: 'my-project.analytics',
                name: 'orders',
                kind: 'r',
                qualifiedName: 'my-project.analytics.orders',
                columnsStatus: 'loaded',
                columns: ${JSON.stringify(bigQueryColumns)},
              }, ...${JSON.stringify(bigQueryCatalogRelations)}],
            }],
          },
        },
        tabs: state.tabs.map((tab) => ({
          ...tab,
          connectionProfileId: bq.id,
          queryMode: 'sql',
          sql: ${JSON.stringify(bigQueryFailedQuery)},
          queryError: 'Unrecognized name: revenu at [1:21]',
          repairableQueryError: {
            query: ${JSON.stringify(bigQueryFailedQuery)},
            error: 'Unrecognized name: revenu at [1:21] token=[REDACTED]',
          },
        })),
      })
    })()`)
    await wait(
      win,
      `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Fix with AI')`,
    )
    await click(win, 'Fix with AI')
    await wait(
      win,
      `document.querySelector('[aria-label="AI query repair review"]') && document.querySelector('[aria-label="SQL proposal diff"]') && document.querySelector('[data-diff-kind="add"]') && document.querySelector('[data-diff-kind="remove"]')`,
    )
    const bigQueryRepairReview = await win.webContents
      .executeJavaScript(`(() => {
      const editor = document.querySelector('[aria-label="SQL editor"] .cm-content') ?? document.querySelector('.cm-content')
      const diff = document.querySelector('[aria-label="SQL proposal diff"]')
      return {
        editorText: editor?.textContent ?? '',
        diffText: diff?.textContent ?? '',
        storedSql: window.__datakoalaStore.getState().tabs[0].sql,
      }
    })()`)
    if (!bigQueryRepairReview.editorText.includes('SUM(revenu)'))
      throw new Error(
        `BigQuery repair replaced SQL before Apply: ${JSON.stringify(bigQueryRepairReview)}`,
      )
    if (
      !bigQueryRepairReview.diffText.includes('revenu') ||
      !bigQueryRepairReview.diffText.includes('revenue')
    )
      throw new Error(
        `BigQuery repair diff is incomplete: ${JSON.stringify(bigQueryRepairReview)}`,
      )
    if (bigQueryRepairReview.storedSql !== bigQueryFailedQuery)
      throw new Error('BigQuery repair changed stored SQL before Apply')
    if (queryRuns !== 0)
      throw new Error('BigQuery repair executed a query before Apply')

    await click(win, 'View AI details')
    await wait(
      win,
      `[...document.querySelectorAll('[data-popover-overlay]')].some((overlay) => overlay.textContent.includes('GoogleSQL · OpenRouter') && overlay.textContent.includes('Fix with AI') && overlay.textContent.includes('Sanitized datasource error') && overlay.textContent.includes('Failed SQL') && overlay.textContent.includes('my-project.analytics.orders') && overlay.textContent.includes('Available relation names'))`,
    )
    await settlePaint(win)
    await writeFile(
      resolve(output, 'ai-query-repair-bigquery-proposal.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    await win.webContents.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`,
    )
    await click(win, 'Apply')
    await wait(
      win,
      `window.__datakoalaStore.getState().tabs[0].sql === ${JSON.stringify(bigQueryFixedQuery)}`,
    )
    if (queryRuns !== 0)
      throw new Error('Applying BigQuery repair executed a query')

    await win.webContents.executeJavaScript(`(() => {
      const store = window.__datakoalaStore
      const state = store.getState()
      const rows = Array.from({ length: 64 }, (_, day) => ({
        day,
        requests: day === 17 ? 800 : day === 42 ? -40 : 20,
      }))
      store.setState({
        activeProfileId: ${JSON.stringify(profile.id)},
        tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? {
          ...tab,
          connectionProfileId: ${JSON.stringify(profile.id)},
          queryMode: 'sql',
          sql: 'SELECT day, requests FROM public.request_counts ORDER BY day',
          sqlResultFilters: [],
          sqlVisualization: {
            ...tab.sqlVisualization,
            view: 'line',
            xColumn: 'day',
            valueColumn: 'requests',
            seriesColumn: null,
            seriesColumns: [],
            aggregation: 'sum',
          },
        } : tab),
      })
      window.setTimeout(() => {
        store.getState().setResult(
          {
            columns: [
              { name: 'day', dataTypeID: 20, dataTypeName: 'int8' },
              { name: 'requests', dataTypeID: 20, dataTypeName: 'int8' },
            ],
            rows,
            rowCount: rows.length,
            durationMs: 8,
          },
          null,
        )
      }, 500)
    })()`)
    await wait(win, `document.body.innerText.includes('Analyze with AI')`)
    await click(win, 'Analyze with AI')
    await wait(
      win,
      `[...document.querySelectorAll('button[aria-pressed="true"]')].some((button) => button.textContent.includes('AI anomalies')) && [...document.querySelectorAll('button')].some((button) => button.textContent.includes('AI details (2)'))`,
    )
    await settlePaint(win)
    const anomalyHover = await win.webContents.executeJavaScript(`(() => {
      const chart = document.querySelector('[data-visual-finished="true"] canvas')
      if (!chart) throw new Error('AI anomaly chart canvas was not found')
      const rect = chart.getBoundingClientRect()
      const plotWidth = rect.width - 74
      return {
        x: rect.left + 50 + plotWidth * (17.5 / 64),
        top: rect.top + 20,
        bottom: rect.bottom - 45,
      }
    })()`)
    win.show()
    win.focus()
    await sleep(250)
    win.webContents.sendInputEvent({
      type: 'mouseEnter',
      x: anomalyHover.x,
      y: anomalyHover.top,
    })
    let anomalyTooltipVisible = false
    for (
      let xOffset = -2;
      xOffset <= 2 && !anomalyTooltipVisible;
      xOffset += 2
    ) {
      for (
        let y = anomalyHover.top;
        y < anomalyHover.bottom && !anomalyTooltipVisible;
        y += 4
      ) {
        win.webContents.sendInputEvent({
          type: 'mouseMove',
          x: anomalyHover.x + xOffset,
          y,
        })
        await sleep(20)
        anomalyTooltipVisible = await win.webContents.executeJavaScript(
          `document.querySelector('.chart-tooltip-anomaly')?.textContent.includes('Narrow spike') ?? false`,
        )
      }
    }
    if (!anomalyTooltipVisible)
      throw new Error(
        'AI anomaly tooltip did not appear when hovering the spike',
      )
    await settlePaint(win)
    await writeFile(
      resolve(output, 'ai-chart-anomaly.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    await click(win, 'AI details (2)')
    await wait(
      win,
      `[...document.querySelectorAll('[role="dialog"]')].some((dialog) => dialog.textContent.includes('Narrow spike') && dialog.textContent.includes('Narrow drop') && dialog.textContent.includes('sample coverage'))`,
    )
    await settlePaint(win)
    await writeFile(
      resolve(output, 'ai-chart-anomaly-details.png'),
      (await win.webContents.capturePage()).toPNG(),
    )

    console.log(
      'AI_PREVIEW_OK: settings, raw query, structured Builder and PostgreSQL/BigQuery repair proposals require explicit apply; Builder AI never executes',
    )
    win.destroy()
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
