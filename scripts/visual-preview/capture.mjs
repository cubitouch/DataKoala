import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { documentationScreenshots, syntheticSources } from './fixtures.mjs'
import { assertCompactObjectFilter, assertPreviewReady, assertVisibleSeriesField } from './assertions.mjs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const outputArgument = process.argv.slice(2).find((argument) => !argument.endsWith('.mjs'))
const outputDir = resolve(process.env.DATAKOALA_PREVIEW_OUTPUT ?? outputArgument ?? 'visual-preview')
const captureKind = process.env.DATAKOALA_PREVIEW_KIND ?? 'regression'

process.env.DATAKOALA_SMOKE = '1'

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

async function waitForRendererState(win, expression, description, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await win.webContents.executeJavaScript(`Boolean(${expression})`)) return
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

async function waitForRenderer(win) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await win.webContents.executeJavaScript(`Boolean(
      document.getElementById('root')?.children.length && window.__datakoalaStore
    )`)
    if (ready) return
    await sleep(100)
  }
  throw new Error('Timed out waiting for the renderer and test store seam')
}

async function waitForChart(win) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await win.webContents.executeJavaScript(
      `Boolean(document.querySelector('[data-result-chart-canvas] canvas'))`
    )
    if (ready) return
    await sleep(100)
  }

  const bodyText = await win.webContents.executeJavaScript(
    `(document.body.innerText || '').slice(0, 500)`
  )
  throw new Error(`Chart did not render. Renderer text: ${bodyText}`)
}

async function waitForTable(win) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await win.webContents.executeJavaScript(
      `Boolean(document.querySelector('table tbody tr'))`
    )
    if (ready) return
    await sleep(100)
  }

  throw new Error('Result table did not render')
}

async function verifyResponsiveChartPicker(win) {
  const report = await win.webContents.executeJavaScript(`(() => {
    const pane = document.querySelector('[data-result-explorer]')
    const picker = document.querySelector('[role="toolbar"][aria-label="Result view"]')
    const labels = [...(picker?.querySelectorAll('button span') ?? [])]
    const active = picker?.querySelector('button[aria-pressed="true"]')
    const inactive = picker?.querySelector('button[aria-pressed="false"]')
    if (!pane || !picker || !labels.length) return null
    return {
      paneWidth: pane.getBoundingClientRect().width,
      pickerClientWidth: picker.clientWidth,
      pickerScrollWidth: picker.scrollWidth,
      visibleLabels: labels.filter((label) => getComputedStyle(label).display !== 'none').length,
      activeVisible: Boolean(active),
      activeColor: active ? getComputedStyle(active).color : null,
      activeBorder: active ? getComputedStyle(active).borderColor : null,
      inactiveColor: inactive ? getComputedStyle(inactive).color : null
    }
  })()`)
  if (!report || report.paneWidth > 760 || report.visibleLabels !== 0 || report.pickerScrollWidth > report.pickerClientWidth || !report.activeVisible ||
      report.activeColor !== 'rgb(255, 255, 255)' || report.inactiveColor === 'rgb(154, 160, 176)' || report.activeBorder === 'rgba(0, 0, 0, 0)') {
    throw new Error(`Responsive chart picker failed in a narrow result pane: ${JSON.stringify(report)}`)
  }
}

async function showChartTooltip(win, captureFilename) {
  const before = await win.webContents.executeJavaScript(`({
    documentWidth: document.documentElement.scrollWidth,
    workspaceWidth: document.querySelector('.workspace')?.scrollWidth,
    mainWidth: document.querySelector('.main')?.scrollWidth
  })`)
  const point = await win.webContents.executeJavaScript(`(() => {
    const canvas = document.querySelector('[data-result-chart-canvas] canvas')
    if (!canvas) return null

    const bounds = canvas.getBoundingClientRect()
    return {
      x: Math.round(bounds.right - 42),
      y: Math.round(bounds.top + bounds.height / 2)
    }
  })()`)

  if (!point) throw new Error('Cannot show tooltip without a chart canvas')
  win.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y })

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const visible = await win.webContents.executeJavaScript(`(() => {
      const content = document.querySelector('.chart-tooltip-content')
      if (!content) return false
      const tooltip = content.closest('div[style*="position: absolute"]')
      if (!tooltip) return false
      const style = getComputedStyle(tooltip)
      return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0 && tooltip.getBoundingClientRect().width > 0
    })()`)
    if (visible) {
      const after = await win.webContents.executeJavaScript(`({
        documentWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        workspaceWidth: document.querySelector('.workspace')?.scrollWidth,
        workspaceClientWidth: document.querySelector('.workspace')?.clientWidth,
        mainWidth: document.querySelector('.main')?.scrollWidth,
        mainClientWidth: document.querySelector('.main')?.clientWidth,
        tooltip: (() => {
          const content = document.querySelector('.chart-tooltip-content')
          const element = content?.closest('div[style*="position: absolute"]')
          if (!element) return null
          const bounds = element.getBoundingClientRect()
          const canvas = document.querySelector('[data-result-chart-canvas]')?.getBoundingClientRect()
          const style = getComputedStyle(element)
          const heading = content.querySelector('.chart-tooltip-heading')
          const row = content.querySelector('.chart-tooltip-row')
          let hovered = content.querySelector('.chart-tooltip-row-hovered')
          if (!hovered && row) { row.classList.add('chart-tooltip-row-hovered'); hovered = row }
          document.getElementById('_visual-preview-tooltip')?.remove()
          const frozen = element.cloneNode(true)
          frozen.id = '_visual-preview-tooltip'
          Object.assign(frozen.style, { position: 'fixed', left: bounds.left + 'px', top: bounds.top + 'px', right: 'auto', bottom: 'auto', visibility: 'visible', opacity: '1', zIndex: '9999' })
          document.body.append(frozen)
          return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom,
            width: bounds.width, height: bounds.height,
            canvasLeft: canvas?.left, canvasTop: canvas?.top, canvasRight: canvas?.right, canvasBottom: canvas?.bottom,
            overflowX: style.overflowX, overflowY: style.overflowY,
            fontSize: parseFloat(style.fontSize), headingFontSize: heading ? parseFloat(getComputedStyle(heading).fontSize) : null,
            rowHeight: row?.getBoundingClientRect().height, hoveredBackground: hovered ? getComputedStyle(hovered).backgroundColor : null }
        })()
      })`)
      if (after.documentWidth > after.clientWidth || after.workspaceWidth > after.workspaceClientWidth ||
          after.mainWidth > after.mainClientWidth || after.documentWidth !== before.documentWidth ||
          after.workspaceWidth !== before.workspaceWidth || after.mainWidth !== before.mainWidth) {
        throw new Error(`Chart tooltip changed layout or caused horizontal overflow: ${JSON.stringify({ before, after })}`)
      }
      if (!after.tooltip || after.tooltip.overflowX !== 'hidden' || after.tooltip.overflowY !== 'hidden') {
        throw new Error(`Chart tooltip must be bounded and non-scrollable: ${JSON.stringify(after.tooltip)}`)
      }
      if (after.tooltip.width > 300 || after.tooltip.height > 260 || after.tooltip.fontSize > 12 || after.tooltip.headingFontSize > 12 || after.tooltip.rowHeight > 20) {
        throw new Error(`Chart tooltip is not compact: ${JSON.stringify(after.tooltip)}`)
      }
      if (!after.tooltip.hoveredBackground || !/rgba\(255, 255, 255, 0\.0/.test(after.tooltip.hoveredBackground)) {
        throw new Error(`Hovered tooltip row is missing subtle emphasis: ${JSON.stringify(after.tooltip)}`)
      }
      const tolerance = 1
      if (after.tooltip.left < after.tooltip.canvasLeft - tolerance || after.tooltip.top < after.tooltip.canvasTop - tolerance ||
          after.tooltip.right > after.tooltip.canvasRight + tolerance || after.tooltip.bottom > after.tooltip.canvasBottom + tolerance) {
        throw new Error(`Chart tooltip escaped its chart viewport: ${JSON.stringify(after.tooltip)}`)
      }
      if (captureFilename) { await sleep(600); await capture(win, captureFilename) }
      await cleanupPreviewState(win)
      return
    }
    await sleep(100)
  }

  throw new Error('Chart tooltip did not become visible')
}

async function cleanupPreviewState(win) {
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('_visual-preview-tooltip')?.remove()
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    document.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0, clientY: 0 }))
  })()`)
}

async function assertCanonicalCaptureState(win, description) {
  const errors = await win.webContents.executeJavaScript(`[...document.querySelectorAll('[role="alert"]')]
    .filter((element) => element.offsetParent !== null)
    .map((element) => element.textContent?.trim()).filter(Boolean)`)
  if (errors.length) throw new Error(`${description} contains unexpected application errors: ${JSON.stringify(errors)}`)
  const transient = await win.webContents.executeJavaScript(`Boolean(document.getElementById('_visual-preview-tooltip'))`)
  if (transient) throw new Error(`${description} contains leaked preview-only DOM`)
}

async function seedPreviewData(win) {
  const report = await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore
    if (!store) return { error: 'window.__datakoalaStore is unavailable' }

    const rows = []
    const markets = ['France', 'Germany', 'Spain', 'United Kingdom', 'A very long regional series label that must truncate safely inside the tooltip', ...Array.from({ length: 19 }, (_, index) => "Market " + (index + 1))]
    for (let month = 0; month < 12; month += 1) {
      for (let index = 0; index < markets.length; index += 1) {
        rows.push({
          time_bucket: new Date(Date.UTC(2025, month, 1)),
          series: markets[index],
          count: index === 5 ? '0' : index === 6 ? null : String(800 + month * 120 + index * 210 + ((month + index) % 3) * 90)
        })
      }
    }

    store.getState().setResult({
      columns: [
        { name: 'time_bucket', dataTypeID: 1184, dataTypeName: 'timestamptz' },
        { name: 'series', dataTypeID: 25, dataTypeName: 'text' },
        { name: 'count', dataTypeID: 20, dataTypeName: 'int8' }
      ],
      rows,
      rowCount: rows.length,
      durationMs: 18
    }, null)

    return { ok: true }
  })()`)

  if (report?.error) throw new Error(report.error)
}

async function seedDocumentationData(win) {
  const report = await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore
    if (!store) return { error: 'window.__datakoalaStore is unavailable' }
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
    store.getState().setResult({
      columns: [
        { name: 'time_bucket', dataTypeID: 1184, dataTypeName: 'timestamptz', logicalType: 'timestamp' },
        { name: 'series', dataTypeID: 25, dataTypeName: 'text', logicalType: 'string' },
        { name: 'count', dataTypeID: 20, dataTypeName: 'int8', logicalType: 'number' }
      ], rows, rowCount: rows.length, durationMs: 18
    }, null)
    return { ok: true }
  })()`)
  if (report?.error) throw new Error(report.error)
}

async function configureDocumentationSql(win, mode, view) {
  await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore
    const state = store.getState()
    const profile = { id: 'docs-postgres', name: 'Market analytics', kind: 'postgres', version: 1, host: 'localhost', port: 5432, database: 'analytics', user: 'demo', password: '', ssl: false, readonly: true }
    const schemas = [{ name: 'analytics', isSystem: false, relations: [
      { schema: 'analytics', name: 'monthly_market_activity', qualifiedName: 'analytics.monthly_market_activity', kind: 'r', columnsStatus: 'loaded', columns: [
        { name: 'time_bucket', dataTypeID: 1184, dataTypeName: 'timestamptz', logicalType: 'timestamp' },
        { name: 'series', dataTypeID: 25, dataTypeName: 'text', logicalType: 'string' },
        { name: 'count', dataTypeID: 20, dataTypeName: 'int8', logicalType: 'number' }
      ] },
      { schema: 'analytics', name: 'market_summary', qualifiedName: 'analytics.market_summary', kind: 'v', columnsStatus: 'idle' },
      { schema: 'analytics', name: 'customer_activity', qualifiedName: 'analytics.customer_activity', kind: 'r', columnsStatus: 'idle' }
    ] }]
    store.setState({
      profiles: [profile], activeProfileId: profile.id, connected: true, connecting: false,
      connectionStatus: 'connected', connectionError: null, serverVersion: '17',
      metadataByProfileId: { ...state.metadataByProfileId, [profile.id]: { schemas, status: 'loaded', error: null, isStale: false } },
      tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? {
        ...tab, connectionProfileId: profile.id, queryMode: '${mode}',
        sql: 'select time_bucket, series, count\\nfrom analytics.monthly_market_activity\\norder by time_bucket, series;',
        sqlResultFilters: [], builderResultFilters: [], builderFilterNotice: null,
        builder: { ...tab.builder, table: { schema: 'analytics', name: 'monthly_market_activity' }, timeColumn: 'time_bucket', timeBucket: 'month', seriesColumns: ['series'] },
        builderHasRun: true,
        sqlVisualization: { ...tab.sqlVisualization, view: '${view}', xColumn: 'time_bucket', valueColumn: 'count', seriesColumn: 'series', seriesColumns: [], aggregation: 'sum' },
        builderVisualization: { ...tab.builderVisualization, view: '${view}', xColumn: 'time_bucket', valueColumn: 'count', seriesColumn: null, seriesColumns: ['series'], aggregation: 'sum' }
      } : tab)
    })
  })()`)
  await waitForRendererState(win, `'${mode}' === 'builder' ? document.querySelector('[aria-label="Query mode"] .active')?.textContent?.trim() === 'Builder' : document.querySelector('[aria-label="Query mode"] .active')?.textContent?.trim() === 'SQL'`, `visible ${mode} documentation mode`)
}

async function expandDocumentationRelation(win) {
  await win.webContents.executeJavaScript(`(() => {
    const schema = document.querySelector('[role="tree"] > [role="treeitem"]')
    if (schema?.getAttribute('aria-expanded') === 'false') schema.querySelector('button')?.click()
  })()`)
  await waitForRendererState(win, `document.body.innerText.includes('monthly_market_activity')`, 'analytics relation tree')
  await win.webContents.executeJavaScript(`(() => {
    const relationButton = document.querySelector('[role="tree"] button[aria-label="Select analytics.monthly_market_activity for Builder"]')
    const relation = relationButton?.closest('[role="treeitem"]')
    if (relation?.getAttribute('aria-expanded') === 'false') relation.querySelector('button[aria-label^="Expand"], button[aria-label^="Collapse"]')?.click()
  })()`)
  await waitForRendererState(win, `document.body.innerText.includes('time_bucket') && document.body.innerText.includes('series') && document.body.innerText.includes('count')`, 'monthly market activity columns')
}

async function assertDocumentationSourceTree(win, mode) {
  const report = await win.webContents.executeJavaScript(`({
    mode: document.querySelector('[aria-label="Query mode"] .active')?.textContent?.trim(),
    profile: document.querySelector('[data-connection-live="true"], [data-connection-item]')?.textContent,
    status: document.querySelector('[role="status"][data-state="connected"]')?.textContent,
    tree: document.querySelector('[role="tree"]')?.innerText ?? document.querySelector('aside[aria-label="Connections and objects"]')?.innerText,
    filters: document.querySelectorAll('[data-result-filter-chip]').length
  })`)
  const expectedMode = mode === 'builder' ? 'Builder' : 'SQL'
  if (report.mode !== expectedMode || !report.profile?.includes('Market analytics') || !report.status?.includes('Market analytics') ||
      !report.tree?.includes('monthly_market_activity') || !report.tree.includes('time_bucket') || !report.tree.includes('series') || !report.tree.includes('count')) {
    throw new Error(`Documentation source tree assertion failed: ${JSON.stringify(report)}`)
  }
}

async function finalizeDocumentationBuilder(win, view) {
  await win.webContents.executeJavaScript(`(() => { const store = window.__datakoalaStore; const state = store.getState(); store.setState({ tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? { ...tab, builderVisualization: { ...tab.builderVisualization, view: '${view}', xColumn: 'time_bucket', valueColumn: 'count', seriesColumn: null, seriesColumns: ['series'], aggregation: 'sum' } } : tab) }) })()`)
  await waitForRendererState(win, `document.querySelector('.builder-pane')`, 'visible SQL Builder')
  await sleep(100)
  const visible = await win.webContents.executeJavaScript(`document.querySelector('.builder-pane')?.innerText + ' ' + [...document.querySelectorAll('.builder-pane input')].map((input) => input.value).join(' ')`)
  for (const value of ['analytics', 'monthly_market_activity', 'time_bucket', 'Month', 'count', 'Sum', 'series']) if (!visible.includes(value)) throw new Error(`Builder value ${value} is not visible: ${visible}`)
}

async function assertDocumentationChart(win, filename) {
  await waitForRendererState(win, `document.querySelectorAll('[data-result-chart-canvas] canvas').length === 1 && new Set(window.__datakoalaStore.getState().tabs.find((tab) => tab.id === window.__datakoalaStore.getState().activeTabId).result.rows.map((row) => row.series)).size === 5`, `${filename} five-series chart`)
  const report = await win.webContents.executeJavaScript(`({
    filters: document.querySelectorAll('[data-result-filter-chip]').length,
    seriesCount: new Set(window.__datakoalaStore.getState().tabs.find((tab) => tab.id === window.__datakoalaStore.getState().activeTabId).result.rows.map((row) => row.series)).size,
    activeView: document.querySelector('[role="toolbar"][aria-label="Result view"] button[aria-pressed="true"]')?.textContent?.trim()
  })`)
  if (report.filters || report.seriesCount !== 5 || !['Bar', 'Line'].includes(report.activeView)) throw new Error(`${filename} semantic assertion failed: ${JSON.stringify(report)}`)
  await sleep(1200)
}

async function configureDocumentationPrometheus(win) {
  await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore
    const state = store.getState()
    const profile = { id: 'docs-prometheus', name: 'Service metrics', kind: 'prometheus', version: 1, readonly: true, transport: { kind: 'gcx', datasourceUid: 'sample-metrics' } }
    const schemas = [{ name: 'Prometheus', isSystem: false, relations: [
      { schema: 'Prometheus', name: 'http_requests_total', qualifiedName: 'http_requests_total', kind: 'metric', columnsStatus: 'idle', details: { kind: 'metric', type: 'counter', help: 'Total HTTP requests.' } },
      { schema: 'Prometheus', name: 'http_request_duration_seconds_bucket', qualifiedName: 'http_request_duration_seconds_bucket', kind: 'metric', columnsStatus: 'idle', details: { kind: 'metric', type: 'histogram', help: 'HTTP request duration buckets.' } },
      { schema: 'Prometheus', name: 'process_memory_bytes', qualifiedName: 'process_memory_bytes', kind: 'metric', columnsStatus: 'idle', details: { kind: 'metric', type: 'gauge', help: 'Resident process memory.' } }
    ] }]
    store.setState({
      profiles: [profile], activeProfileId: profile.id, connected: true, connecting: false,
      connectionStatus: 'connected', connectionError: null, serverVersion: null,
      metadataByProfileId: { ...state.metadataByProfileId, [profile.id]: { schemas, status: 'loaded', error: null, isStale: false } },
      tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? {
        ...tab, connectionProfileId: profile.id, queryMode: 'builder', result: null, pendingResult: null,
        sqlResultFilters: [], builderResultFilters: [],
        sql: 'histogram_quantile(\\n  0.95,\\n  sum by (service, le) (rate(http_request_duration_seconds_bucket{environment="production"}[5m]))\\n)',
        prometheusTimeRange: { kind: 'rolling', amount: 6, unit: 'hour' }, prometheusStep: '30s',
        promqlBuilder: { ...tab.promqlBuilder, metric: 'http_request_duration_seconds_bucket', filterBy: ['environment'], groupBy: ['service'], labelValues: { environment: ['production'], service: ['api', 'worker'] }, calculation: 'percentile', aggregation: 'sum', percentile: 0.95, window: '5m' }
      } : tab)
    })
  })()`)
  await waitForRendererState(win, `document.querySelector('[aria-label="Query mode"] .active')?.textContent?.trim() === 'Builder' && document.querySelector('.promql-builder-form') && document.body.innerText.includes('http_request_duration_seconds_bucket')`, 'visible configured Prometheus Builder')
  const report = await win.webContents.executeJavaScript(`(() => { const state = window.__datakoalaStore.getState(); const tab = state.tabs.find((item) => item.id === state.activeTabId); return { mode: tab.queryMode, result: tab.result, metric: tab.promqlBuilder.metric, tables: document.querySelectorAll('table tbody tr').length } })()`)
  if (report.mode !== 'builder' || report.result !== null || report.metric !== 'http_request_duration_seconds_bucket' || report.tables) throw new Error(`Prometheus documentation assertion failed: ${JSON.stringify(report)}`)
}

async function configureDocumentationTreemap(win) {
  await configureDocumentationSql(win, 'sql', 'treemap')
  await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore
    const rows = [
      ['Europe', 'France', 'Web', 1480], ['Europe', 'France', 'Marketplace', 920],
      ['Europe', 'Germany', 'Web', 1320], ['Europe', 'Germany', 'Marketplace', 810],
      ['Europe', 'Spain', 'Web', 980], ['Europe', 'Spain', 'Marketplace', 640],
      ['North America', 'United States', 'Web', 1760], ['North America', 'United States', 'Marketplace', 1210],
      ['North America', 'Canada', 'Web', 890], ['North America', 'Canada', 'Marketplace', 570]
    ].map(([region, country, channel, value], index) => ({ record: 'Segment ' + (index + 1), region, country, channel, value }))
    store.getState().setResult({ columns: [
      { name: 'record', dataTypeID: 25, dataTypeName: 'text', logicalType: 'string' },
      { name: 'region', dataTypeID: 25, dataTypeName: 'text', logicalType: 'string' },
      { name: 'country', dataTypeID: 25, dataTypeName: 'text', logicalType: 'string' },
      { name: 'channel', dataTypeID: 25, dataTypeName: 'text', logicalType: 'string' },
      { name: 'value', dataTypeID: 20, dataTypeName: 'int8', logicalType: 'number' }
    ], rows, rowCount: rows.length, durationMs: 12 }, null)
    store.getState().setSql('select region, country, channel, value\\nfrom analytics.market_summary\\norder by region, country, channel;')
    store.getState().setVisualization('sql', { view: 'treemap', xColumn: 'record', valueColumn: 'value', seriesColumn: null, seriesColumns: ['region', 'country', 'channel'], hierarchyDimensions: ['region', 'country', 'channel'], aggregation: 'sum' })
  })()`)
  await waitForRendererState(win, `document.querySelector('[role="toolbar"][aria-label="Result view"] button[aria-pressed="true"]')?.textContent?.trim() === 'Treemap' && Boolean(document.querySelector('[data-result-chart-canvas] canvas'))`, 'rendered documentation Treemap')
  const report = await win.webContents.executeJavaScript(`({ view: document.querySelector('[role="toolbar"][aria-label="Result view"] button[aria-pressed="true"]')?.textContent?.trim(), hierarchy: document.querySelector('[aria-label="Hierarchy order"]')?.innerText, filters: document.querySelectorAll('[data-result-filter-chip]').length, empty: Boolean(document.querySelector('[data-result-empty]')) })`)
  if (report.view !== 'Treemap' || report.filters || report.empty || !report.hierarchy?.includes('region') || !report.hierarchy.includes('country') || !report.hierarchy.includes('channel')) throw new Error(`Treemap documentation assertion failed: ${JSON.stringify(report)}`)
}

async function configureMode(win, mode) {
  const report = await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore
    if (!store) return { error: 'window.__datakoalaStore is unavailable' }

    store.getState().setQueryMode('${mode}')

    if ('${mode}' === 'sql') {
      store.getState().setProfiles([{ id: 'preview-postgres', name: 'Preview database', kind: 'postgres', version: 1, readonly: false, host: 'localhost', port: 5432, database: 'preview', user: 'preview', password: '', ssl: false }])
      store.getState().setMetadata([{ name: 'analytics', isSystem: false, relations: [{
        schema: 'analytics', name: 'monthly_market_activity', qualifiedName: 'analytics.monthly_market_activity', kind: 'r', columnsStatus: 'loaded', columns: [
          { name: 'time_bucket', dataTypeID: 1184, dataTypeName: 'timestamptz', logicalType: 'timestamp' },
          { name: 'series', dataTypeID: 25, dataTypeName: 'text', logicalType: 'string' },
          { name: 'count', dataTypeID: 20, dataTypeName: 'int8', logicalType: 'number' }
        ]
      }] }], 'loaded', null, 'preview-postgres')
      const current = store.getState()
      store.setState({ tabs: current.tabs.map((item) => item.id === current.activeTabId ? { ...item, connectionProfileId: 'preview-postgres' } : item) })
      store.getState().clearResultFilters('sql')
      store.getState().addResultFilter('sql', {
        id: 'preview-chart-series-france',
        column: 'series',
        operator: 'equals',
        value: 'France'
      })
      store.getState().setSql('select time_bucket, series, count from monthly_market_activity order by time_bucket, series;')
      store.getState().setVisualization('sql', {
        view: 'bar',
        xColumn: 'time_bucket',
        valueColumn: 'count',
        seriesColumn: 'series',
        aggregation: 'sum'
      })
    } else {
      store.getState().setMetadata([
        { name: 'analytics', isSystem: false, relations: [
          { schema: 'analytics', name: 'monthly_market_activity', qualifiedName: 'analytics.monthly_market_activity', kind: 'r', columnsStatus: 'loaded', columns: [
            { name: 'time_bucket', dataTypeID: 1184, dataTypeName: 'timestamptz', logicalType: 'timestamp' },
            { name: 'series', dataTypeID: 25, dataTypeName: 'text', logicalType: 'string' },
            { name: 'count', dataTypeID: 20, dataTypeName: 'int8', logicalType: 'number' }
          ] },
          { schema: 'analytics', name: 'market_summary', qualifiedName: 'analytics.market_summary', kind: 'v', columnsStatus: 'idle' }
        ] },
        { name: 'public', isSystem: false, relations: [] },
        { name: 'pg_catalog', isSystem: true, relations: [] }
      ], 'loaded')
      store.getState().clearResultFilters('builder')
      store.getState().setBuilder({
        table: { schema: 'analytics', name: 'monthly_market_activity' },
        timeColumn: 'time_bucket',
        timeBucket: 'minute',
        seriesColumns: ['series']
      })
      store.getState().addResultFilter('builder', {
        id: 'preview-builder-series-france',
        column: 'series',
        operator: 'equals',
        value: 'France'
      })
      store.getState().setResultFilterExecution('builder', 'preview-builder-series-france', 'query')
      store.getState().setBuilderHasRun(true)
      store.getState().setVisualization('builder', {
        view: 'line',
        xColumn: 'time_bucket',
        valueColumn: 'count',
        seriesColumn: 'series',
        aggregation: 'sum'
      })
    }

    return { ok: true }
  })()`)

  if (report?.error) throw new Error(report.error)
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await win.webContents.executeJavaScript(
      `'${mode}' === 'builder' ? Boolean(document.querySelector('.builder-pane')) : Boolean(document.querySelector('.sql-layout'))`
    )
    if (ready) break
    if (attempt === 39) throw new Error(`The ${mode} editor did not render`)
    await sleep(100)
  }
  await waitForChart(win)
  await sleep(600)
}

async function configurePrometheusToolbar(win) {
  const report = await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore
    const state = store?.getState()
    if (!state) return { error: 'window.__datakoalaStore is unavailable' }
    state.setProfiles([{ id: 'preview-prometheus', name: 'Metrics', kind: 'prometheus', version: 1, readonly: true, transport: { kind: 'gcx', datasourceUid: 'preview-prometheus' } }])
    state.setMetadata([{ name: 'Metrics', isSystem: false, relations: [
      { schema: 'Metrics', name: 'http_requests_total', qualifiedName: 'Metrics.http_requests_total', kind: 'metric', columnsStatus: 'idle', details: { kind: 'metric', type: 'counter', help: 'Total number of HTTP requests processed.' } },
      { schema: 'Metrics', name: 'process_memory_bytes', qualifiedName: 'Metrics.process_memory_bytes', kind: 'metric', columnsStatus: 'idle', details: { kind: 'metric', type: 'gauge', help: 'Resident process memory in bytes.' } },
      { schema: 'Metrics', name: 'request_duration_seconds', qualifiedName: 'Metrics.request_duration_seconds', kind: 'metric', columnsStatus: 'idle', details: { kind: 'metric', type: 'histogram', help: 'Observed request duration in seconds.' } }
    ] }], 'loaded', null, 'preview-prometheus')
    const tab = state.tabs.find((item) => item.id === state.activeTabId)
    store.setState({ tabs: state.tabs.map((item) => item.id === tab.id ? {
      ...item, connectionProfileId: 'preview-prometheus', queryMode: 'sql',
      sql: 'sum by(status)(rate(http_requests_total{service="api"}[5m]))',
      prometheusTimeRange: { kind: 'rolling', amount: 6, unit: 'hour' }, prometheusStep: '30s'
    } : item) })
    return { ok: true }
  })()`)
  if (report?.error) throw new Error(report.error)
  await waitForRendererState(win, `document.body.innerText.includes('http_requests_total') || Boolean([...document.querySelectorAll('[role="treeitem"]')].find((node) => node.textContent?.includes('Metrics')))`, 'Prometheus metric browser')
  await win.webContents.executeJavaScript(`(() => {
    const item = [...document.querySelectorAll('[role="treeitem"]')].find((node) => node.textContent?.includes('Metrics'))
    if (item?.getAttribute('aria-expanded') === 'false') item.querySelector('button')?.click()
  })()`)
  await waitForRendererState(win, `document.body.innerText.includes('http_requests_total')`, 'expanded Prometheus metrics')
}

async function configurePrometheusBuilder(win) {
  await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore
    const state = store.getState()
    state.setMetadata([{ name: 'Prometheus', isSystem: false, relations: [{
      schema: 'Prometheus', name: 'http_request_duration_seconds_bucket', qualifiedName: 'http_request_duration_seconds_bucket', kind: 'metric',
      columnsStatus: 'idle', details: { kind: 'metric', type: 'histogram', help: 'HTTP request duration buckets' }
    }] }], 'loaded', null, 'preview-prometheus')
    state.setPromqlBuilder({ metric: 'http_request_duration_seconds_bucket', filterBy: ['environment'], groupBy: ['continent'], labelValues: { continent: ['Europe'], environment: ['production'] }, calculation: 'percentile', aggregation: 'sum', percentile: 0.95, window: '5m' })
    state.setSql('histogram_quantile(\\n  0.95,\\n  sum by (continent, le) (\\n    rate(http_request_duration_seconds_bucket{continent="Europe",environment="production"}[5m])\\n  )\\n)')
    state.setQueryMode('builder')
  })()`)
  await win.webContents.executeJavaScript(`document.querySelector('.generated-promql')?.setAttribute('open', '')`)
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'ESC' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'ESC' })
  await waitForRendererState(win, `document.querySelector('.promql-builder-form') && !document.querySelector('[role="listbox"]')`, 'closed Prometheus Builder controls')
}

async function verifyQueryToolbar(win) {
  const report = await win.webContents.executeJavaScript(`(() => {
    const toolbar = document.querySelector('.editor-head')
    const pane = document.querySelector('.editor-pane')
    return toolbar && pane ? {
      toolbarScrollWidth: toolbar.scrollWidth, toolbarClientWidth: toolbar.clientWidth,
      paneScrollWidth: pane.scrollWidth, paneClientWidth: pane.clientWidth,
      hasRange: Boolean(toolbar.querySelector('[data-time-range-field]')),
      hasStep: Boolean(toolbar.querySelector('[data-field][data-field-name="Resolution"]')),
      hasExplain: [...toolbar.querySelectorAll('button')].some((button) => button.textContent?.includes('Explain'))
    } : null
  })()`)
  if (!report || !report.hasRange || !report.hasStep || report.hasExplain || report.toolbarScrollWidth > report.toolbarClientWidth || report.paneScrollWidth > report.paneClientWidth) {
    throw new Error(`Prometheus query toolbar is clipped or missing controls: ${JSON.stringify(report)}`)
  }
}

async function configureTablePreview(win) {
  const report = await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore
    if (!store) return { error: 'window.__datakoalaStore is unavailable' }

    store.getState().setQueryMode('sql')
    store.getState().setVisualization('sql', { view: 'table' })
    store.getState().clearResultFilters('sql')
    store.getState().addResultFilter('sql', {
      id: 'preview-series-france',
      column: 'series',
      operator: 'equals',
      value: 'France'
    })
    return { ok: true }
  })()`)

  if (report?.error) throw new Error(report.error)
  await waitForTable(win)
  await sleep(300)
}

async function configureBuilderControls(win, variant) {
  const report = await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore
    if (!store) return { error: 'window.__datakoalaStore is unavailable' }
    const variant = '${variant}'
    store.getState().setBuilderHasRun(false)
    store.getState().setResult(null, null)
    const temporal = variant === 'temporal-series'
    const count = variant === 'count-without-y'
    store.getState().setBuilder({
      table: { schema: 'analytics', name: 'monthly_market_activity' },
      timeColumn: 'time_bucket',
      timeBucket: 'month',
      timeRange: { kind: 'rolling', amount: 6, unit: 'month' },
      seriesColumns: temporal ? ['series'] : []
    })
    store.getState().setVisualization('builder', {
      view: temporal ? 'line' : 'bar',
      xColumn: temporal ? 'time_bucket' : 'series',
      valueColumn: count ? null : 'count',
      seriesColumn: null,
      seriesColumns: temporal ? ['series'] : [],
      aggregation: count ? 'count' : 'sum'
    })
    store.getState().setBuilderHasRun(true)
    return { ok: true }
  })()`)
  if (report?.error) throw new Error(report.error)
  await sleep(250)
}

async function capture(win, filename) {
  if (captureKind === 'regression') await assertPreviewReady(win, filename)
  await win.webContents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
  await sleep(150)
  const image = await win.webContents.capturePage()
  const path = resolve(outputDir, filename)
  await writeFile(path, image.toPNG())
  console.log(`Visual preview written to ${path}`)
}

async function verifySeriesTriggerAlignment(win) {
  const metrics = await win.webContents.executeJavaScript(`(() => {
    const schemaControl = document.querySelector('[data-field][data-field-name="Schema"]')
    const seriesControl = document.querySelector('[data-field][data-field-name="Series"]')
    const schemaTrigger = schemaControl?.querySelector('[data-popover-trigger]')
    const seriesTrigger = seriesControl?.querySelector('[data-popover-trigger]')
    const schemaLabel = schemaControl?.querySelector('[data-field-label]')
    const seriesLabel = seriesControl?.querySelector('[data-field-label]')
    if (!schemaTrigger || !seriesTrigger || !seriesLabel || !schemaLabel) return null
    const schemaTriggerStyle = getComputedStyle(schemaTrigger); const seriesTriggerStyle = getComputedStyle(seriesTrigger)
    const controlProperties = ['height', 'borderRadius', 'borderColor', 'backgroundColor', 'paddingLeft', 'paddingRight', 'fontSize', 'fontWeight', 'fontFamily']
    const labelProperties = ['color', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing']
    return {
      trigger: Object.fromEntries(controlProperties.map((property) => [property, seriesTriggerStyle[property]])),
      reference: Object.fromEntries(controlProperties.map((property) => [property, schemaTriggerStyle[property]])),
      seriesLabel: Object.fromEntries(labelProperties.map((property) => [property, getComputedStyle(seriesLabel)[property]])),
      schemaLabel: Object.fromEntries(labelProperties.map((property) => [property, getComputedStyle(schemaLabel)[property]]))
    }
  })()`)
  if (!metrics) throw new Error('Series trigger or neighboring Builder combobox is missing')
  for (const property of Object.keys(metrics.trigger)) {
    if (metrics.trigger[property] !== metrics.reference[property]) throw new Error(`Series trigger ${property} does not match Builder combobox: ${JSON.stringify(metrics)}`)
  }
  for (const property of Object.keys(metrics.seriesLabel)) {
    if (metrics.seriesLabel[property] !== metrics.schemaLabel[property]) throw new Error(`Series label ${property} does not match Schema label: ${JSON.stringify(metrics)}`)
  }
}

async function verifySharedFieldGeometry(win) {
  const report = await win.webContents.executeJavaScript(`(() => {
    const field = (name) => document.querySelector('[data-field][data-field-name="' + name + '"]')
    const rect = (element) => { const bounds = element?.getBoundingClientRect(); return bounds ? { top: bounds.top, height: bounds.height } : null }
    const control = (name) => rect(field(name)?.querySelector('[data-popover-trigger], input'))
    const label = (name) => rect(field(name)?.querySelector('[data-field-label]')?.parentElement)
    const names = ['X axis', 'Y axis', 'Series']
    const controls = names.map(control)
    const timeControls = ['Time column', 'Time range'].map(control)
    const timeLabels = ['Time column', 'Time range'].map(label)
    return { controls, timeControls, timeLabels }
  })()`)
  const aligned = (rects) => rects.every(Boolean) && Math.max(...rects.map((rect) => rect.top)) - Math.min(...rects.map((rect) => rect.top)) <= 1
    && Math.max(...rects.map((rect) => rect.height)) - Math.min(...rects.map((rect) => rect.height)) <= 1
  if (!aligned(report.controls)) throw new Error(`X/Y/Series shared controls are misaligned: ${JSON.stringify(report.controls)}`)
  if (!aligned(report.timeControls) || !aligned(report.timeLabels)) throw new Error(`Time column/range field geometry differs: ${JSON.stringify(report)}`)
}

async function verifyCompactAxisScale(win) {
  const width = await win.webContents.executeJavaScript(`document.querySelector('[data-field][data-field-name="Value axis scale"] [data-popover-trigger]')?.getBoundingClientRect().width`)
  if (width < 90 || width > 110) throw new Error(`Value axis scale is not compact: ${JSON.stringify(width)}`)
}

async function verifyCompactTableSearch(win) {
  const report = await win.webContents.executeJavaScript(`(() => {
    const field = document.querySelector('[data-result-toolbar] [data-field][data-field-name="Filter rows"]')
    const input = field?.querySelector('input')
    return { present: Boolean(input), accessible: input?.getAttribute('aria-labelledby') || input?.labels?.length > 0, hiddenLabel: field?.getAttribute('data-label-visibility') === 'sr-only', toolbarOverflow: document.querySelector('[data-result-toolbar]')?.scrollWidth > document.querySelector('[data-result-toolbar]')?.clientWidth }
  })()`)
  if (!report.present || !report.accessible || !report.hiddenLabel || report.toolbarOverflow) throw new Error(`Result-table search regression: ${JSON.stringify(report)}`)
}

async function dragDivider(win, selector, deltaX, deltaY) {
  const point = await win.webContents.executeJavaScript(`(() => {
    const bounds = document.querySelector('${selector}')?.getBoundingClientRect()
    return bounds ? { x: Math.round(bounds.left + bounds.width / 2), y: Math.round(bounds.top + bounds.height / 2) } : null
  })()`)
  if (!point) throw new Error(`Missing divider ${selector}`)
  win.webContents.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  win.webContents.sendInputEvent({ type: 'mouseMove', x: point.x + deltaX, y: point.y + deltaY, movementX: deltaX, movementY: deltaY })
  win.webContents.sendInputEvent({ type: 'mouseUp', x: point.x + deltaX, y: point.y + deltaY, button: 'left', clickCount: 1 })
  await sleep(200)
}

async function verifyInterruptedDragCleanup(win) {
  const point = await win.webContents.executeJavaScript(`(() => {
    const bounds = document.querySelector('.sidebar-resizer').getBoundingClientRect()
    return { x: Math.round(bounds.left + bounds.width / 2), y: Math.round(bounds.top + 80) }
  })()`)
  win.webContents.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  win.webContents.sendInputEvent({ type: 'mouseMove', x: point.x + 24, y: point.y, movementX: 24, movementY: 0 })
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const active = await win.webContents.executeJavaScript(`document.body.classList.contains('resizing-column')`)
    if (active) break
    if (attempt === 19) throw new Error('Sidebar drag did not start before blur test')
    await sleep(25)
  }
  await win.webContents.executeJavaScript(`window.dispatchEvent(new Event('blur'))`)
  const blurClean = await win.webContents.executeJavaScript(`!document.body.classList.contains('resizing-column')`)
  if (!blurClean) throw new Error('Sidebar drag remained active after window blur')

  win.webContents.sendInputEvent({ type: 'mouseUp', x: point.x + 24, y: point.y, button: 'left', clickCount: 1 })
  const nextPoint = await win.webContents.executeJavaScript(`(() => {
    const bounds = document.querySelector('.sidebar-resizer').getBoundingClientRect()
    return { x: Math.round(bounds.left + bounds.width / 2), y: Math.round(bounds.top + 80) }
  })()`)
  win.webContents.sendInputEvent({ type: 'mouseDown', x: nextPoint.x, y: nextPoint.y, button: 'left', clickCount: 1 })
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const active = await win.webContents.executeJavaScript(`document.body.classList.contains('resizing-column')`)
    if (active) break
    if (attempt === 19) throw new Error('A second sidebar drag could not start after blur cleanup')
    await sleep(25)
  }
  win.webContents.sendInputEvent({ type: 'mouseMove', x: win.getContentSize()[0] + 50, y: nextPoint.y, movementX: 100, movementY: 0 })
  win.webContents.sendInputEvent({ type: 'mouseUp', x: win.getContentSize()[0] + 50, y: nextPoint.y, button: 'left', clickCount: 1 })
  await sleep(100)
  const releaseClean = await win.webContents.executeJavaScript(`!document.body.classList.contains('resizing-column')`)
  if (!releaseClean) throw new Error('Sidebar drag remained active after an outside release')
}

async function configureLongObjectTree(win) {
  await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore
    store.getState().setConnected(true, '17', null)
    store.getState().setMetadata([{ name: 'analytics_schema_with_an_exceptionally_long_name', isSystem: false, relations: [{
      schema: 'analytics_schema_with_an_exceptionally_long_name',
      name: 'monthly_market_activity_relation_with_a_name_that_needs_more_space',
      qualifiedName: 'analytics_schema_with_an_exceptionally_long_name.monthly_market_activity_relation_with_a_name_that_needs_more_space',
      kind: 'r', columnsStatus: 'loaded', columns: [{
        name: 'a_column_name_that_is_intentionally_long_to_verify_sidebar_truncation',
        dataTypeID: 25, dataTypeName: 'character varying with a long display name'
      }]
    }] }], 'loaded')
  })()`)
  await sleep(250)
  await win.webContents.executeJavaScript(`(() => { const row = document.querySelector('[role="tree"] > [role="treeitem"] > button'); if (row?.parentElement?.getAttribute('aria-expanded') === 'false') row.click() })()`)
  await sleep(400)
  await win.webContents.executeJavaScript(`(() => { const row = document.querySelector('[role="tree"] button[aria-label^="Expand"], [role="tree"] button[aria-label^="Collapse"]'); if (row?.closest('[role="treeitem"]')?.getAttribute('aria-expanded') === 'false') row.click() })()`)
  await sleep(400)
}

app.whenReady().then(async () => {
  ipcMain.handle('connections:list', async () => [])
  ipcMain.handle('query:run', async () => ({
    columns: [
      { name: 'time_bucket', dataTypeID: 1184, dataTypeName: 'timestamptz', logicalType: 'timestamp' },
      { name: 'series', dataTypeID: 25, dataTypeName: 'text', logicalType: 'string' },
      { name: 'count', dataTypeID: 20, dataTypeName: 'int8', logicalType: 'number' }
    ],
    rows: Array.from({ length: 12 }, (_, index) => ({ time_bucket: new Date(Date.UTC(2026, index, 1)), series: index % 2 ? 'France' : 'Germany', count: 900 + index * 125 })),
    rowCount: 12,
    durationMs: 12
  }))
  ipcMain.handle('connections:prometheus:metric-labels', async () => ['continent', 'environment', 'service', 'le', '__name__'])
  ipcMain.handle('connections:prometheus:label-values', async (_event, _id, _metric, label) => label === 'environment' ? ['production', 'staging'] : label === 'continent' ? ['Europe', 'Asia'] : ['api', 'worker'])

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
    await waitForRenderer(win)
    await seedPreviewData(win)

    if (captureKind === 'documentation') {
      await win.webContents.executeJavaScript(`window.__datakoalaDocumentationCapture = true`)
      await rm(outputDir, { recursive: true, force: true })
      await mkdir(outputDir, { recursive: true })
      await seedDocumentationData(win)
      await configureDocumentationSql(win, 'builder', 'line')
      await expandDocumentationRelation(win)
      await finalizeDocumentationBuilder(win, 'line')
      await assertDocumentationSourceTree(win, 'builder')
      await assertDocumentationChart(win, 'docs-overview.png')
      await capture(win, 'docs-overview.png')

      await configureDocumentationSql(win, 'sql', 'table')
      await expandDocumentationRelation(win)
      await win.webContents.executeJavaScript(`window.__datakoalaStore.getState().addResultFilter('sql', { id: 'docs-france', column: 'series', operator: 'equals', value: 'France' })`)
      await waitForTable(win)
      await waitForRendererState(win, `document.querySelector('[aria-label="Query mode"] .active')?.textContent?.trim() === 'SQL' && document.querySelector('[role="toolbar"][aria-label="Result view"] button[aria-pressed="true"]')?.textContent?.trim() === 'Table' && document.querySelectorAll('table tbody tr').length === 12`, 'filtered SQL documentation table')
      await assertDocumentationSourceTree(win, 'sql')
      await capture(win, 'docs-sql.png')

      await configureDocumentationSql(win, 'builder', 'bar')
      await expandDocumentationRelation(win)
      await finalizeDocumentationBuilder(win, 'bar')
      await assertDocumentationSourceTree(win, 'builder')
      await assertDocumentationChart(win, 'docs-builder.png')
      await capture(win, 'docs-builder.png')

      await configureDocumentationPrometheus(win)
      await dragDivider(win, '.sidebar-resizer', 110, 0)
      await win.webContents.executeJavaScript(`(() => { const schema = [...document.querySelectorAll('[role="treeitem"]')].find((item) => item.textContent?.includes('Prometheus')); if (schema?.getAttribute('aria-expanded') === 'false') schema.querySelector('button')?.click() })()`)
      await waitForRendererState(win, `document.querySelector('[data-connection-live="true"]')?.innerText.includes('Service metrics') && document.querySelector('[role="status"][data-state="connected"]')?.innerText.includes('Service metrics') && document.body.innerText.includes('http_request_duration_seconds_bucket')`, 'connected Prometheus metric tree')
      await capture(win, 'docs-prometheus.png')
      await dragDivider(win, '.sidebar-resizer', -110, 0)

      await configureDocumentationTreemap(win)
      await capture(win, 'docs-visualization.png')

      await win.webContents.executeJavaScript(`window.__datakoalaStore.setState({ profiles: ${JSON.stringify(syntheticSources)} })`)
      await waitForRendererState(win, `${syntheticSources.map((profile) => `document.body.innerText.includes(${JSON.stringify(profile.name)})`).join(' && ')}`, 'all documentation datasource names')
      await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find((button) => button.textContent?.includes('new connection'))?.click()`)
      await waitForRendererState(win, `document.querySelector('[role="dialog"]') && document.body.innerText.includes('Choose a connection type')`, 'datasource picker dialog')
      const sourcesReport = await win.webContents.executeJavaScript(`({ names: ${JSON.stringify(syntheticSources.map((profile) => profile.name))}.filter((name) => document.body.innerText.includes(name)), dialog: Boolean(document.querySelector('[role="dialog"]')) })`)
      if (sourcesReport.names.length !== syntheticSources.length || !sourcesReport.dialog) throw new Error(`Datasource documentation assertion failed: ${JSON.stringify(sourcesReport)}`)
      await capture(win, 'docs-data-sources.png')

      const actual = (await readdir(outputDir)).filter((name) => name.endsWith('.png')).sort()
      const expected = [...documentationScreenshots].sort()
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Documentation screenshot set mismatch. Expected ${expected.join(', ')}, received ${actual.join(', ')}`)
      app.exit(0)
      return
    }

    await configureMode(win, 'sql')
    await assertCompactObjectFilter(win, 'Filter database objects')
    await assertVisibleSeriesField(win)
    await verifyCompactAxisScale(win)
    await capture(win, 'sql-default.png')

    await configurePrometheusToolbar(win)
    await assertCompactObjectFilter(win, 'Filter metrics')
    await verifyQueryToolbar(win)
    await capture(win, 'prometheus-toolbar.png')
    win.setSize(760, 760)
    await sleep(350)
    await verifyQueryToolbar(win)
    await capture(win, 'prometheus-toolbar-narrow.png')
    win.setSize(1440, 900)
    await configurePrometheusBuilder(win)
    await capture(win, 'prometheus-builder.png')
    win.setSize(760, 760)
    await sleep(350)
    await capture(win, 'prometheus-builder-narrow.png')
    win.setSize(1440, 900)
    await configureMode(win, 'sql')

    await dragDivider(win, '.sidebar-resizer', 170, 0)
    await dragDivider(win, '.editor-resizer', 0, 90)
    await capture(win, 'sql-resized-panes.png')
    await verifyInterruptedDragCleanup(win)

    await win.webContents.executeJavaScript(`window.__datakoalaStore.getState().setSql(Array.from({ length: 80 }, (_, i) =>
      'select ' + (i + 1) + ' as deliberately_long_query_line_' + (i + 1) + ';').join('\\n'))`)
    await waitForRendererState(win, `document.querySelector('.cm-content')?.textContent?.includes('deliberately_long_query_line_80')`, 'long SQL query rendering')
    await win.webContents.executeJavaScript(`(() => { const scroller = document.querySelector('.cm-scroller'); if (scroller) scroller.scrollTop = scroller.scrollHeight })()`)
    await capture(win, 'sql-long-query-scroll.png')

    await configureLongObjectTree(win)
    await capture(win, 'sql-wide-sidebar-long-names.png')

    await win.webContents.executeJavaScript(`window.__datakoalaStore.getState().clearResultFilters('sql')`)
    await dragDivider(win, '.editor-resizer', 0, -1000)
    win.setSize(1000, 640)
    await sleep(350)
    await verifyResponsiveChartPicker(win)
    await showChartTooltip(win, 'sql-narrow-short-tooltip.png')

    win.setSize(1440, 900)
    await sleep(350)
    // Restore the canonical SQL metadata after the long-name sidebar scenario so
    // Builder geometry checks exercise real temporal controls rather than the
    // unavailable placeholders.
    await configureDocumentationSql(win, 'builder', 'line')
    await verifySeriesTriggerAlignment(win)
    await configureBuilderControls(win, 'temporal-series')
    await waitForRendererState(win, `document.querySelector('[data-builder-form] [data-field][data-field-name="Time range"]')`, 'shared Builder time-range field')
    await verifySharedFieldGeometry(win)
    await assertCanonicalCaptureState(win, 'Builder temporal Series preview')
    await capture(win, 'builder-temporal-series.png')

    await configureBuilderControls(win, 'categorical-numeric')
    await assertCanonicalCaptureState(win, 'Builder categorical preview')
    await capture(win, 'builder-categorical-numeric.png')

    await configureBuilderControls(win, 'count-without-y')
    await assertCanonicalCaptureState(win, 'Builder Count preview')
    await capture(win, 'builder-count-without-y.png')

    win.setSize(760, 760)
    await sleep(350)
    await capture(win, 'builder-narrow.png')

    win.setSize(1440, 900)
    await sleep(350)
    await seedPreviewData(win)
    await configureTablePreview(win)
    await verifyCompactTableSearch(win)
    await assertCanonicalCaptureState(win, 'Result table preview')
    await capture(win, 'table.png')

    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
