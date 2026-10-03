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
  version: 1,
  host: 'localhost',
  port: 5432,
  database: 'demo',
  user: 'demo',
  password: '',
  ssl: false,
  readonly: true,
}
const columns = [
  { name: 'id', dataTypeName: 'uuid' },
  { name: 'country', dataTypeName: 'text' },
  { name: 'created_at', dataTypeName: 'timestamptz' },
  { name: 'amount', dataTypeName: 'numeric' },
]
const query =
  "SELECT country, sum(amount) AS revenue\nFROM public.orders\nWHERE created_at >= now() - interval '30 days'\nGROUP BY country\nORDER BY revenue DESC;"
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
await app.whenReady()
try {
  ipcMain.handle('connections:list', () => [])
  ipcMain.handle('connections:live', () => [])
  ipcMain.handle('connection:describe-table', () => columns)
  ipcMain.handle('ai:settings:get', () =>
    ok({ provider: 'openrouter', model: 'preview/model', hasApiKey: true }),
  )
  ipcMain.handle('ai:models', () =>
    ok([{ id: 'preview/model', name: 'Preview analytical model' }]),
  )
  ipcMain.handle('ai:cancel', () => ok(undefined))
  ipcMain.handle('ai:propose', () =>
    ok({
      query,
      explanation:
        'Aggregates revenue by country for orders created within the last 30 days, with the highest revenue first.',
      assumptions: [
        'amount is the order revenue in a consistent currency.',
        'The date range is relative to the database clock.',
      ],
    }),
  )
  const win = new BrowserWindow({
    width: 1440,
    height: 1000,
    show: false,
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: resolve('out/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  await win.loadFile(resolve('out/renderer/index.html'))
  await wait(
    win,
    `window.__datakoalaStore && document.querySelector('[aria-label="App settings"]')`,
  )
  await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore, state = store.getState(), profile = ${JSON.stringify(profile)}
    store.setState({ profiles: [profile], activeProfileId: profile.id, connected: true, connecting: false, connectionStatus: 'connected',
      metadataByProfileId: { [profile.id]: { status: 'loaded', isStale: false, error: null, schemas: [{ name: 'public', isSystem: false, relations: [{ schema: 'public', name: 'orders', kind: 'r', qualifiedName: 'public.orders', columnsStatus: 'loaded', columns: ${JSON.stringify(columns)} }] }] } },
      tabs: state.tabs.map((tab) => ({ ...tab, connectionProfileId: profile.id, queryMode: 'sql', sql: 'SELECT * FROM public.orders LIMIT 100;' })) })
  })()`)
  await mkdir(output, { recursive: true })
  await click(win, 'App settings')
  await click(win, 'AI settings…')
  await wait(
    win,
    'document.body.innerText.includes("Preview analytical model")',
  )
  await sleep(200)
  await writeFile(
    resolve(output, 'ai-settings.png'),
    (await win.webContents.capturePage()).toPNG(),
  )
  await click(win, 'Cancel')
  await click(win, 'Ask AI')
  await wait(win, 'document.querySelector("textarea")')
  await win.webContents.executeJavaScript(
    `(() => { const input = document.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'revenue by country over the last 30 days'); input.dispatchEvent(new Event('input', { bubbles: true })) })()`,
  )
  await wait(
    win,
    '[...document.querySelectorAll("button")].some((b) => b.textContent === "Generate" && !b.disabled)',
  )
  await click(win, 'Generate')
  await wait(
    win,
    '[...document.querySelectorAll("button")].some((b) => b.textContent === "Use query")',
  )
  await sleep(300)
  await writeFile(
    resolve(output, 'ai-query-proposal.png'),
    (await win.webContents.capturePage()).toPNG(),
  )
  await click(win, 'Use query')
  const applied = await win.webContents.executeJavaScript(
    'window.__datakoalaStore.getState().tabs[0].sql',
  )
  if (applied !== query)
    throw new Error('AI preview did not apply the proposal')
  console.log(
    'AI_PREVIEW_OK: settings, proposal, explicit apply; no query execution handler registered',
  )
  win.destroy()
  app.exit(0)
} catch (error) {
  console.error(error)
  app.exit(1)
}
