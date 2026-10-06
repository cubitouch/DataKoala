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
const columns = [
  { name: 'id', dataTypeName: 'uuid' },
  { name: 'country', dataTypeName: 'text' },
  { name: 'created_at', dataTypeName: 'timestamptz' },
  { name: 'amount', dataTypeName: 'numeric' },
]
const query =
  "SELECT country, sum(amount) AS revenue\nFROM public.orders\nWHERE created_at >= now() - interval '30 days'\nGROUP BY country\nORDER BY revenue DESC;"
const failedQuery = 'SELECT device_id FROM public.orders;'
const fixedQuery = 'SELECT id AS device_id FROM public.orders;'
let failNextRepair = true
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
    ipcMain.handle('ai:settings:get', () =>
      ok({ provider: 'openrouter', model: 'preview/model', hasApiKey: true }),
    )
    ipcMain.handle('ai:models', () =>
      ok([{ id: 'preview/model', name: 'Preview analytical model' }]),
    )
    ipcMain.handle('ai:test', () => ok(undefined))
    ipcMain.handle('ai:cancel', () => ok(undefined))
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
      return ok({
        kind: 'proposal',
        proposal: {
          query: request.intent === 'repair' ? fixedQuery : query,
          explanation:
            request.intent === 'repair'
              ? 'Replaced the missing device_id column with the available id column while preserving the result name.'
              : 'Aggregates revenue by country for orders created within the last 30 days, with the highest revenue first.',
          assumptions: [
            'amount is the order revenue in a consistent currency.',
            'The date range is relative to the database clock.',
          ],
        },
      })
    })
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
    await win.webContents.executeJavaScript(`(() => {
      const store = window.__datakoalaStore, state = store.getState()
      store.setState({ tabs: state.tabs.map((tab) => ({ ...tab, sql: ${JSON.stringify(failedQuery)}, queryError: 'ERROR: column orders.device_id does not exist\\nLINE 1 Position: 8 SQLSTATE 42703', repairableQueryError: { query: ${JSON.stringify(failedQuery)}, error: 'ERROR: column orders.device_id does not exist\\nLINE 1 Position: 8 SQLSTATE 42703 password=[REDACTED]' } })) })
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
    await wait(win, `document.body.innerText.includes('AI proposed fix')`)
    const repairReview = await win.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('[aria-label="SQL editor"] .cm-content') ?? document.querySelector('.cm-content')
      return {
        editorText: editor?.textContent ?? '',
        storedSql: window.__datakoalaStore.getState().tabs[0].sql,
        hasOldDiff: document.body.innerText.includes('SQL proposal diff'),
        hasReviewBar: Boolean(document.querySelector('[aria-label="AI query repair review"]')),
      }
    })()`)
    if (!repairReview.editorText.includes("SELECT id AS device_id FROM public.orders;"))
      throw new Error(`Repair proposal is not visible in the SQL editor: ${JSON.stringify(repairReview)}`)
    if (repairReview.storedSql !== failedQuery)
      throw new Error('Repair proposal changed stored SQL before Apply')
    if (repairReview.hasOldDiff)
      throw new Error('Repair proposal still renders the old SQL proposal diff')
    if (!repairReview.hasReviewBar)
      throw new Error('Repair editor review bar is missing')
    await settlePaint(win)
    await writeFile(
      resolve(output, 'ai-query-repair-proposal.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    console.log(
      'AI_PREVIEW_OK: settings, generation and repair proposals, explicit apply; no query execution handler registered',
    )
    win.destroy()
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
