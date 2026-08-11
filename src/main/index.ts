import { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import * as db from './db'
import { connectionProfiles } from './connections-store'
import { IPC } from '@shared/ipc-channels'
import { CHART_SERIES_HARD_LIMIT } from '@shared/chartLimits'
import { buildSeriesCardinalityProbe } from '@shared/seriesCardinality'
import { interpretSeriesStatistics, SERIES_STATISTICS_SQL } from '@shared/seriesStatistics'
import { validateConnectionId, validateSeriesCardinalityRequest, validateSeriesStatisticsRequest } from '@shared/seriesCardinalityValidation'
import type { ConnectionProfile, DataSourceProfile } from '@shared/types'
import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH } from '@shared/layoutDimensions'
import { writePngDataUrl } from './clipboard-image'
import { createGracefulShutdown } from './gracefulShutdown'
import { smokeDuckDB } from './adapters/local-files-adapter'
import type { SqliteFileProfile } from '@shared/types'

const __dirname = dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = resolve(__dirname, '../..')

let mainWindow: BrowserWindow | null = null
let isQuitting = false
const handleBeforeQuit = createGracefulShutdown(() => db.disconnectAll(), () => app.quit())

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: 'DataKoala',
    width: 1440,
    height: 900,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    backgroundColor: '#0f1115',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 13 },
    webPreferences: {
      preload: resolve(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(resolve(__dirname, '../renderer/index.html'))
  }

  // Smoke-test hook: verify the renderer actually mounts, then exit.
  // Enabled only via DATAKOALA_SMOKE=1 so it never affects normal runs.
  if (process.env.DATAKOALA_SMOKE) {
    const win = mainWindow
    win.webContents.on('console-message', (_e, _lvl, message) => {
      console.log('[renderer]', message)
    })
    win.webContents.on('did-fail-load', (_e, code, desc) => {
      console.log(`SMOKE_FAIL did-fail-load ${code} ${desc}`)
      app.exit(1)
    })
    win.webContents.on('did-finish-load', async () => {
      try {
        const report = await win.webContents.executeJavaScript(`(() => {
          const root = document.getElementById('root')
          return JSON.stringify({
            mounted: !!root && root.children.length > 0,
            hasTitlebar: !!document.querySelector('.titlebar'),
            hasSidebar: !!document.querySelector('.sidebar'),
            hasBuilder: !!document.querySelector('.builder-pane'),
            bridge: typeof window.datakoala === 'object' && window.datakoala !== null,
            text: (document.body.innerText || '').slice(0, 300)
          })
        })()`)
        const r = JSON.parse(report)
        console.log('SMOKE_REPORT', JSON.stringify(r, null, 2))
        const okKeys = ['mounted', 'hasTitlebar', 'hasSidebar', 'hasBuilder', 'bridge'] as const
        const missing = okKeys.filter((k) => !r[k])
        if (missing.length) {
          console.log('SMOKE_FAIL missing: ' + missing.join(', '))
          return app.exit(1)
        }

        const chartReport = await win.webContents.executeJavaScript(`(async () => {
          const store = window.__datakoalaStore
          if (!store) return JSON.stringify({ error: 'store test seam missing' })
          store.getState().setQueryMode('sql')
          const rows = []
          for (let d = 1; d <= 10; d++) {
            for (const region of ['eu-west', 'us-east']) {
              rows.push({
                day: new Date(Date.UTC(2024, 0, d)),
                region,
                total: String(100 * d + (region === 'eu-west' ? 0 : 50))
              })
            }
          }
          store.getState().setResult({
            columns: [
              { name: 'day', dataTypeID: 1184, dataTypeName: 'timestamptz' },
              { name: 'region', dataTypeID: 25, dataTypeName: 'text' },
              { name: 'total', dataTypeID: 1700, dataTypeName: 'numeric' }
            ],
            rows,
            rowCount: rows.length,
            durationMs: 7
          }, null)
          store.getState().setVisualization('sql', { view: 'line', xColumn: 'day', valueColumn: 'total', seriesColumn: 'region', aggregation: 'sum' })
          await new Promise((r) => setTimeout(r, 900))
          const canvas = document.querySelector('.result-chart-canvas canvas')
          const rowCells = document.querySelectorAll('table.results tbody tr').length
          let png = null
          if (canvas) png = canvas.toDataURL('image/png')
          return JSON.stringify({
            tableRows: rowCells,
            hasCanvas: !!canvas,
            canvasW: canvas ? canvas.width : 0,
            canvasH: canvas ? canvas.height : 0,
            pngPrefix: png ? png.slice(0, 22) : null,
            pngBytes: png ? Math.floor((png.length - png.indexOf(',') - 1) * 3 / 4) : 0,
            legendText: (document.querySelector('.result-chart')?.innerText || '').slice(0, 80),
            toolbarText: (document.querySelector('.result-toolbar')?.innerText || '').slice(0, 80)
          })
        })()`)
        const c = JSON.parse(chartReport)
        console.log('SMOKE_CHART', JSON.stringify(c, null, 2))
        if (c.error) {
          console.log('SMOKE_FAIL ' + c.error)
          return app.exit(1)
        }
        if (!c.hasCanvas) {
          console.log('SMOKE_FAIL chart canvas never rendered')
          return app.exit(1)
        }
        if (c.canvasW < 50 || c.canvasH < 50) {
          console.log(`SMOKE_FAIL chart canvas has no size (${c.canvasW}x${c.canvasH})`)
          return app.exit(1)
        }
        if (c.pngPrefix !== 'data:image/png;base64,') {
          console.log('SMOKE_FAIL chart did not export a PNG, got: ' + c.pngPrefix)
          return app.exit(1)
        }
        if (c.pngBytes < 1000) {
          console.log('SMOKE_FAIL exported PNG suspiciously small: ' + c.pngBytes + ' bytes')
          return app.exit(1)
        }
        if (c.tableRows !== 20) {
          console.log('SMOKE_FAIL expected 20 table rows, got ' + c.tableRows)
          return app.exit(1)
        }

        const connReport = await win.webContents.executeJavaScript(`(async () => {
          const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          const addBtn = [...document.querySelectorAll('.btn-add')][0]
          if (!addBtn) return JSON.stringify({ error: 'no "new connection" button' })
          click(addBtn)
          await new Promise((r) => setTimeout(r, 250))
          const box = document.querySelector('textarea.conn-paste')
          if (!box) return JSON.stringify({ error: 'paste box not rendered' })
          const setNative = (el, value) => {
            const proto = Object.getPrototypeOf(el)
            const desc = Object.getOwnPropertyDescriptor(proto, 'value')
            desc.set.call(el, value)
            el.dispatchEvent(new Event('input', { bubbles: true }))
          }
          setNative(box, 'postgres://demo-reader%40proxy-test.example@localhost:55432/demo_shop')
          await new Promise((r) => setTimeout(r, 250))
          const val = (label) => {
            for (const f of document.querySelectorAll('.modal .field')) {
              const l = f.querySelector('label')
              if (l && l.textContent.trim().toLowerCase().startsWith(label)) {
                const i = f.querySelector('input')
                if (i) return i.value
              }
            }
            return null
          }
          return JSON.stringify({
            host: val('host'),
            port: val('port'),
            database: val('database'),
            user: val('user'),
            name: val('profile name'),
            preview: (document.querySelector('.conn-preview')?.textContent || ''),
            warnings: [...document.querySelectorAll('.modal .test-msg.warn')].map((n) => n.textContent),
            parsedOk: !!document.querySelector('.modal .test-msg.ok')
          })
        })()`)
        const cn = JSON.parse(connReport)
        console.log('SMOKE_CONN', JSON.stringify(cn, null, 2))
        if (cn.error) {
          console.log('SMOKE_FAIL ' + cn.error)
          return app.exit(1)
        }
        const expectUser = 'demo-reader@proxy-test.example'
        const connChecks: [string, unknown, unknown][] = [
          ['host', cn.host, 'localhost'],
          ['port', cn.port, '55432'],
          ['database', cn.database, 'demo_shop'],
          ['user', cn.user, expectUser]
        ]
        for (const [field, got, want] of connChecks) {
          if (got !== want) {
            console.log(`SMOKE_FAIL paste filled ${field}="${got}", expected "${want}"`)
            return app.exit(1)
          }
        }
        if (!cn.parsedOk) {
          console.log('SMOKE_FAIL paste box did not report a successful parse')
          return app.exit(1)
        }
        if (!cn.warnings.some((w: string) => /passwordless/i.test(w))) {
          console.log('SMOKE_FAIL expected a passwordless warning, got: ' + JSON.stringify(cn.warnings))
          return app.exit(1)
        }
        if (!cn.preview.includes('demo-reader%40proxy-test.example')) {
          console.log('SMOKE_FAIL preview did not re-encode the username: ' + cn.preview)
          return app.exit(1)
        }
        console.log('SMOKE_OK')
        app.exit(0)
      } catch (e) {
        console.log('SMOKE_FAIL ' + (e instanceof Error ? e.message : String(e)))
        app.exit(1)
      }
    })
  }
}

app.setName('DataKoala')
app.whenReady().then(async () => {
  if (process.env.DATAKOALA_SQLITE_SMOKE) {
    const profile: SqliteFileProfile = { kind: 'sqlite-file', version: 1, id: 'sqlite-smoke', name: 'SQLite smoke', path: process.env.DATAKOALA_SQLITE_SMOKE, readonly: true }
    try {
      const connected = await db.connect(profile)
      if (!connected.ok) throw new Error(connected.error)
      const objects = await db.listObjects(profile.id)
      const result = await db.runQuery(profile.id, 'SELECT COUNT(*) AS count FROM sqlite.smoke_data')
      if (!objects.some((object) => object.name === 'smoke_data') || Number(result.rows[0]?.count) !== 2) throw new Error('SQLite smoke fixture was not browsable/queryable')
      await db.disconnectAll()
      console.log('SQLITE_ELECTRON_SMOKE_OK')
      app.exit(0)
    } catch (error) {
      console.error('SQLITE_ELECTRON_SMOKE_FAIL', error)
      await db.disconnectAll(); app.exit(1)
    }
    return
  }
  if (process.env.DATAKOALA_DUCKDB_SMOKE === '1') {
    try {
      const answer = await smokeDuckDB()
      if (answer !== 42) throw new Error(`expected 42, received ${String(answer)}`)
      console.log('DUCKDB_SMOKE_OK SELECT 42')
      app.exit(0)
    } catch (error) {
      console.error('DUCKDB_SMOKE_FAIL', error)
      app.exit(1)
    }
    return
  }
  registerIpc()

  if (process.platform === 'darwin') {
    const iconPath = resolve(process.env.APP_ROOT!, 'build/icon.png')
    const dockIcon = nativeImage.createFromPath(iconPath)
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon)
    } else {
      console.warn(`[app] Could not load Dock icon from ${iconPath}`)
    }
  }

  db.onConnectionStateChanged((event) => {
    if (!isQuitting) mainWindow?.webContents.send(IPC.CONNECTION_STATE_CHANGED, event)
  })
  if (process.env.DATAKOALA_DB_SMOKE) {
    await runDbSmoke(process.env.DATAKOALA_DB_SMOKE)
    return
  }
  createWindow()
  if (process.env.DATAKOALA_REPRO) {
    attachRepro(process.env.DATAKOALA_REPRO)
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

/**
 * Drives the real renderer the way a user would: paste a connection string, save,
 * connect, type a query, click Run. Dumps state at each step so a stalled flow is
 * visible. Guarded by DATAKOALA_REPRO.
 *
 * SAFETY: this must only ever touch the throwaway test database. It selects the
 * profile it just created by name and refuses to run against anything else.
 */
function attachRepro(conn: string): void {
  const win = mainWindow
  if (!win) return
  const allowed = /^(localhost|127\.0\.0\.1)$/
  let target: URL
  try {
    target = new URL(conn)
  } catch {
    console.log('REPRO_FAIL unparseable connection string')
    return app.exit(1)
  }
  const testPort = process.env.DATAKOALA_TEST_PORT ?? '55432'
  if (!allowed.test(target.hostname) || target.port !== testPort) {
    console.log(
      `REPRO_FAIL refusing to run: target ${target.hostname}:${target.port} is not the throwaway ` +
        `test database (expected localhost:${testPort}). Set DATAKOALA_TEST_PORT to override.`
    )
    return app.exit(1)
  }
  const reproProfileName = `datakoala-repro-${Date.now()}`

  win.webContents.on('console-message', (_e, _lvl, message) => console.log('[renderer]', message))
  win.webContents.on('did-finish-load', async () => {
    try {
      const script = `(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
        const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        const setNative = (el, value) => {
          const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')
          desc.set.call(el, value)
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }
        const steps = []
        const REPRO_NAME = ${JSON.stringify(reproProfileName)}
        click(document.querySelector('.btn-add'))
        await sleep(300)
        const box = document.querySelector('textarea.conn-paste')
        if (!box) return JSON.stringify({ error: 'no paste box' })
        setNative(box, ${JSON.stringify(conn)})
        await sleep(300)
        const nameInput = [...document.querySelectorAll('.modal .field')]
          .map((f) => ({ label: f.querySelector('label'), input: f.querySelector('input') }))
          .find((x) => x.label && /profile name/i.test(x.label.textContent))
        if (!nameInput || !nameInput.input) return JSON.stringify({ error: 'no profile name input' })
        setNative(nameInput.input, REPRO_NAME)
        await sleep(200)
        steps.push('filled connection form as ' + REPRO_NAME)
        const saveBtn = [...document.querySelectorAll('.modal .actions .btn')]
          .find((b) => /save/i.test(b.textContent))
        click(saveBtn)
        await sleep(700)
        const mine = [...document.querySelectorAll('.conn-item')]
          .find((el) => el.querySelector('.name')?.textContent === REPRO_NAME)
        if (!mine) return JSON.stringify({ error: 'could not find the repro profile by name', steps })
        steps.push('selected own profile (of ' + document.querySelectorAll('.conn-item').length + ' listed)')
        click(mine.querySelector('.name'))
        const store = window.__datakoalaStore
        for (let i = 0; i < 60; i++) {
          const st = store.getState()
          if (!st.connecting && (st.connected || st.connectionError)) break
          await sleep(200)
        }
        const s1 = store.getState()
        steps.push('after connect: connected=' + s1.connected + ' activeId=' + s1.activeProfileId + ' err=' + s1.connectionError)
        if (!s1.connected) return JSON.stringify({ error: 'failed to connect: ' + s1.connectionError, steps })
        store.getState().setSql(${JSON.stringify(process.env.DATAKOALA_REPRO_SQL ?? 'select created_at, region, amount from orders limit 25')})
        await sleep(300)
        const runBtn = [...document.querySelectorAll('.editor-head .btn')]
          .find((b) => /^run/i.test(b.textContent.trim()))
        steps.push('run button found=' + !!runBtn + ' disabled=' + (runBtn ? runBtn.disabled : 'n/a'))
        if (runBtn) click(runBtn)
        for (let i = 0; i < 100; i++) {
          const st = store.getState()
          if (!st.running && (st.result || st.queryError)) break
          await sleep(200)
        }
        await sleep(1200)
        const s2 = store.getState()
        const sqlBefore = store.getState().sql
        const fmtBtn = [...document.querySelectorAll('.editor-head .btn')]
          .find((b) => /^format$/i.test(b.textContent.trim()))
        let formatCheck = { found: !!fmtBtn, changed: false, lines: 0, toast: '' }
        if (fmtBtn) {
          click(fmtBtn)
          await sleep(500)
          const after = store.getState().sql
          formatCheck.changed = after !== sqlBefore
          formatCheck.lines = after.split('\\n').length
          formatCheck.toast = document.querySelector('.toast')?.textContent || ''
          store.getState().setSql(sqlBefore)
          await sleep(200)
        }
        let chartProbe = null
        const canvas = document.querySelector('.result-chart-canvas canvas')
        if (window.__datakoalaBuildOption && s2.result) {
          const built = null
          if (built) {
            const firstSeries = built.option.series[0]
            chartProbe = {
              xAxisType: built.option.xAxis.type,
              xAxisHasData: built.option.xAxis.data !== undefined,
              isTimeAxis: built.meta.isTimeAxis,
              seriesNames: built.meta.seriesNames,
              categoryCount: built.meta.categoryCount,
              firstPoint: firstSeries ? firstSeries.data[0] : null,
              pointsArePairs: firstSeries ? Array.isArray(firstSeries.data[0]) : null
            }
          }
        }
        return JSON.stringify({
          steps,
          connected: s2.connected,
          activeProfileId: s2.activeProfileId,
          running: s2.running,
          queryError: s2.queryError,
          rowCount: s2.result ? s2.result.rowCount : null,
          columns: s2.result ? s2.result.columns.map((c) => c.name + ':' + c.dataTypeName) : null,
          chart: s2.sqlVisualization,
          chartProbe,
          formatCheck,
          domTableRows: document.querySelectorAll('table.results tbody tr').length,
          domToolbar: (document.querySelector('.result-toolbar')?.innerText || '').replace(/\\n/g, ' | '),
          domErrBanner: (document.querySelector('.err-banner')?.innerText || ''),
          domResultPaneText: (document.querySelector('.result-pane')?.innerText || '').slice(0, 160),
          hasChartCanvas: !!canvas
        }, null, 2)
      })()`
      const report = await win.webContents.executeJavaScript(script)
      console.log('REPRO_REPORT', report)
      const r = JSON.parse(report)
      try {
        for (const p of connectionProfiles.list()) {
          if (p.name.startsWith('datakoala-repro-')) connectionProfiles.remove(p.id)
        }
        console.log('[repro] cleaned up throwaway profiles')
      } catch {
        /* best effort */
      }
      console.log(r.error ? 'REPRO_FAIL ' + r.error : 'REPRO_OK')
      app.exit(r.error ? 1 : 0)
    } catch (e) {
      console.log('REPRO_FAIL ' + (e instanceof Error ? e.stack : String(e)))
      app.exit(1)
    }
  })
}

/**
 * Integration check for the real db.ts layer: connect, introspect, query, explain,
 * and confirm the read-only guard blocks mutations. Guarded by DATAKOALA_DB_SMOKE.
 */
async function runDbSmoke(conn: string): Promise<void> {
  const log = (...a: unknown[]) => console.log('[dbsmoke]', ...a)
  const fail = (m: string) => {
    console.log('DBSMOKE_FAIL ' + m)
    app.exit(1)
  }
  try {
    const u = new URL(conn)
    const profile: ConnectionProfile = {
      kind: 'postgres',
      version: 1,
      id: 'smoke',
      name: 'smoke',
      host: u.hostname,
      port: Number(u.port || 5432),
      database: u.pathname.replace(/^\//, ''),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      ssl: false,
      readonly: true
    }
    const c = await db.connect(profile)
    if (!c.ok) return fail('connect: ' + c.error)
    log('connected, server', c.serverVersion)
    const objs = await db.listObjects('smoke')
    log('listObjects ->', objs.length, 'objects:', objs.map((o) => `${o.schema}.${o.name}`).join(', '))
    if (!objs.some((o) => o.name === 'orders')) return fail('listObjects did not find the orders table')
    const cols = await db.describeTable('smoke', 'public', 'orders')
    log('describeTable ->', cols.map((x) => `${x.name}:${x.dataTypeName}`).join(', '))
    if (!cols.some((x) => x.name === 'created_at')) return fail('describeTable missing created_at')
    const q = await db.runQuery(
      'smoke',
      "select date_trunc('day', created_at) as day, region, sum(amount) as total from orders group by 1,2 order by 1,2"
    )
    log('runQuery ->', q.rowCount, 'rows in', q.durationMs + 'ms')
    log('columns:', q.columns.map((x) => `${x.name}:${x.dataTypeName}`).join(', '))
    log('first row:', JSON.stringify(q.rows[0]))
    if (q.rowCount === 0) return fail('runQuery returned no rows')
    const dayCol = q.columns.find((x) => x.name === 'day')
    if (dayCol?.dataTypeName !== 'timestamptz') {
      return fail(`expected day column typed timestamptz, got ${dayCol?.dataTypeName}`)
    }
    if (!(q.rows[0].day instanceof Date)) return fail('day value did not deserialize to a Date')
    const ex = await db.explainQuery('smoke', 'select count(*) from orders', false)
    if (!/aggregate|scan/i.test(ex.text)) return fail('explain output looks wrong: ' + ex.text.slice(0, 120))
    log('explain ok, first line:', ex.text.split('\n')[0])
    let blocked = false
    let blockedMsg = ''
    try {
      await db.runQuery('smoke', 'delete from orders where id = 1')
    } catch (e) {
      blocked = true
      blockedMsg = e instanceof Error ? e.message : String(e)
    }
    if (!blocked) return fail('read-only guard did NOT block a DELETE')
    log('DELETE blocked:', blockedMsg)
    let serverBlocked = false
    let serverMsg = ''
    try {
      await db.runQuery('smoke', 'with d as (delete from orders where id = 1 returning id) select count(*) from d')
    } catch (e) {
      serverBlocked = true
      serverMsg = e instanceof Error ? e.message : String(e)
    }
    if (!serverBlocked) return fail('server-side read-only did NOT block a data-modifying CTE')
    if (!/read-only/i.test(serverMsg)) return fail('CTE blocked but not by read-only enforcement: ' + serverMsg)
    log('data-modifying CTE blocked by Postgres:', serverMsg)
    const tricky = await db.runQuery('smoke', "select 'update' as word, count(*) as n from orders group by 1")
    log('tricky select ->', tricky.rowCount, 'rows', JSON.stringify(tricky.rows[0]))
    if (tricky.rowCount !== 1) return fail('tricky select returned unexpected row count')
    const commented = await db.runQuery('smoke', '-- leading comment\nselect count(*) as n from orders')
    log('comment-led select ->', JSON.stringify(commented.rows[0]))
    if (Number(commented.rows[0].n) !== 20001) {
      return fail('expected 20001 seeded rows, got ' + commented.rows[0].n)
    }
    await db.disconnect('smoke')
    log('disconnected')
    console.log('DBSMOKE_OK')
    app.exit(0)
  } catch (e) {
    fail(e instanceof Error ? `${e.message}\n${e.stack}` : String(e))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  isQuitting = true
  handleBeforeQuit(event)
})

function registerIpc(): void {
  ipcMain.handle(IPC.CLIPBOARD_WRITE_PNG, (_event, dataUrl: unknown) => writePngDataUrl(dataUrl, {
    createFromBuffer: (buffer) => nativeImage.createFromBuffer(buffer),
    writeImage: (image) => clipboard.writeImage(image as Electron.NativeImage),
    logError: (error) => console.error('[clipboard] Could not write chart PNG', error)
  }))
  ipcMain.handle(IPC.CONNECTION_TEST, (_e, profile: DataSourceProfile) => db.testConnection(profile))
  ipcMain.handle(IPC.CONNECTION_CONNECT, async (_e, profile: DataSourceProfile) => {
    const saved = profile.id ? connectionProfiles.get(profile.id) : undefined
    const toUse = saved ?? connectionProfiles.upsert(profile)
    const res = await db.connect(toUse)
    return { ...res, id: toUse.id }
  })
  ipcMain.handle(IPC.CONNECTION_DISCONNECT, (_e, id: string, generation?: number) => db.disconnect(id, generation))
  ipcMain.handle('connections:list', () => connectionProfiles.list())
  ipcMain.handle('connections:upsert', (_e, profile: DataSourceProfile) => connectionProfiles.upsert(profile))
  ipcMain.handle(IPC.CONNECTION_CHOOSE_FILES, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose data files', properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Tabular data', extensions: ['csv', 'tsv', 'parquet', 'json', 'jsonl', 'ndjson', 'txt'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    return result.canceled ? [] : result.filePaths
  })
  ipcMain.handle(IPC.CONNECTION_CHOOSE_SQLITE_FILE, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose SQLite database', properties: ['openFile'],
      filters: [
        { name: 'SQLite database', extensions: ['sqlite', 'sqlite3', 'db'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  ipcMain.handle('connections:remove', (_e, id: string) => {
    db.disconnect(id).catch(() => {})
    connectionProfiles.remove(id)
    return true
  })
  ipcMain.handle(IPC.CONNECTION_LIST_OBJECTS, (_e, id: string) => db.listObjects(id))
  ipcMain.handle(
    IPC.CONNECTION_DESCRIBE_TABLE,
    (_e, id: string, schema: string, table: string) => db.describeTable(id, schema, table)
  )
  ipcMain.handle(IPC.QUERY_RUN, (_e, id: string, sql: string, parameters: unknown[] = []) => db.runQuery(id, sql, parameters))
  ipcMain.handle(IPC.QUERY_PROBE_SERIES_CARDINALITY, async (_e, id: unknown, request: unknown) => {
    const validId = validateConnectionId(id)
    const probe = buildSeriesCardinalityProbe(validateSeriesCardinalityRequest(request), db.queryDialect(validId))
    const result = await db.runQuery(validId, probe.sql, probe.parameters)
    const distinctCount = Number(result.rows[0]?.count ?? 0)
    return { distinctCount, exceedsHardLimit: distinctCount > CHART_SERIES_HARD_LIMIT }
  })
  ipcMain.handle(IPC.QUERY_SERIES_STATISTICS, async (_e, id: unknown, request: unknown) => {
    const validId = validateConnectionId(id)
    const validRequest = validateSeriesStatisticsRequest(request)
    try {
      const result = await db.runQuery(validId, SERIES_STATISTICS_SQL, [validRequest.schema, validRequest.table, validRequest.column])
      return interpretSeriesStatistics(result.rows[0])
    } catch {
      return { available: false, source: 'pg_stats' as const }
    }
  })
  ipcMain.handle(IPC.QUERY_EXPLAIN, (_e, id: string, sql: string, analyze: boolean) => db.explainQuery(id, sql, analyze))
  ipcMain.handle('export:save-text', async (_e, opts: { defaultName: string; content: string }) => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showSaveDialog(win!, {
      defaultPath: opts.defaultName,
      filters: [{ name: 'Text', extensions: ['sql', 'txt', 'csv'] }]
    })
    if (res.canceled || !res.filePath) return null
    const { writeFileSync } = await import('node:fs')
    writeFileSync(res.filePath, opts.content, 'utf8')
    return res.filePath
  })
  ipcMain.handle(
    'export:save-binary',
    async (_e, opts: { defaultName: string; base64: string; extensions?: string[] }) => {
      const win = BrowserWindow.getFocusedWindow()
      const res = await dialog.showSaveDialog(win!, {
        defaultPath: opts.defaultName,
        filters: [{ name: 'Image', extensions: opts.extensions ?? ['png'] }]
      })
      if (res.canceled || !res.filePath) return null
      const { writeFileSync } = await import('node:fs')
      writeFileSync(res.filePath, Buffer.from(opts.base64, 'base64'))
      return res.filePath
    }
  )
}
