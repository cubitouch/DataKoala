import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const outputArgument = process.argv.slice(2).find((argument) => !argument.endsWith('.mjs'))
const outputDir = resolve(process.env.DATAKOALA_PREVIEW_OUTPUT ?? outputArgument ?? 'visual-preview')

process.env.DATAKOALA_SMOKE = '1'

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

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
      `Boolean(document.querySelector('.result-chart-canvas canvas'))`
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
      `Boolean(document.querySelector('table.results tbody tr'))`
    )
    if (ready) return
    await sleep(100)
  }

  throw new Error('Result table did not render')
}

async function verifyResponsiveChartPicker(win) {
  const report = await win.webContents.executeJavaScript(`(() => {
    const pane = document.querySelector('.result-explorer')
    const picker = document.querySelector('.result-view-bar')
    const labels = [...document.querySelectorAll('.result-view-bar .view-label')]
    const active = picker?.querySelector('button.active[aria-pressed="true"]')
    const inactive = picker?.querySelector('button:not(.active)')
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
    const canvas = document.querySelector('.result-chart-canvas canvas')
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
          const canvas = document.querySelector('.result-chart-canvas')?.getBoundingClientRect()
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
      return
    }
    await sleep(100)
  }

  throw new Error('Chart tooltip did not become visible')
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

async function configureMode(win, mode) {
  const report = await win.webContents.executeJavaScript(`(() => {
    const store = window.__datakoalaStore
    if (!store) return { error: 'window.__datakoalaStore is unavailable' }

    store.getState().setQueryMode('${mode}')

    if ('${mode}' === 'sql') {
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
            { name: 'time_bucket', dataTypeName: 'timestamptz' },
            { name: 'series', dataTypeName: 'text' },
            { name: 'count', dataTypeName: 'int8' }
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

async function capture(win, filename) {
  const image = await win.webContents.capturePage()
  const path = resolve(outputDir, filename)
  await writeFile(path, image.toPNG())
  console.log(`Visual preview written to ${path}`)
}

async function verifySeriesTriggerAlignment(win) {
  const metrics = await win.webContents.executeJavaScript(`(() => {
    const controls = Array.from(document.querySelectorAll('.builder-control'))
    const schemaControl = controls.find((control) => control.textContent?.includes('Schema'))
    const seriesControl = controls.find((control) => control.textContent?.includes('Series'))
    const schemaTrigger = schemaControl?.querySelector('.popover-trigger')
    const seriesTrigger = seriesControl?.querySelector('.popover-trigger')
    const schemaLabel = schemaControl?.querySelector('.builder-field-label')
    const seriesLabel = seriesControl?.querySelector('.builder-field-label')
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
  await win.webContents.executeJavaScript(`(() => { const row = document.querySelector('.schema-row'); if (row?.parentElement?.getAttribute('aria-expanded') === 'false') row.click() })()`)
  await sleep(400)
  await win.webContents.executeJavaScript(`(() => { const row = document.querySelector('.chevron-button'); if (row?.closest('[role="treeitem"]')?.getAttribute('aria-expanded') === 'false') row.click() })()`)
  await sleep(400)
}

app.whenReady().then(async () => {
  ipcMain.handle('connections:list', async () => [])

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

    await configureMode(win, 'sql')
    await capture(win, 'sql-default.png')

    await dragDivider(win, '.sidebar-resizer', 170, 0)
    await dragDivider(win, '.editor-resizer', 0, 90)
    await capture(win, 'sql-resized-panes.png')
    await verifyInterruptedDragCleanup(win)

    await win.webContents.executeJavaScript(`window.__datakoalaStore.getState().setSql(Array.from({ length: 80 }, (_, i) =>
      'select ' + (i + 1) + ' as deliberately_long_query_line_' + (i + 1) + ';').join('\\n'))`)
    await sleep(200)
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

    await configureMode(win, 'builder')
    await verifySeriesTriggerAlignment(win)
    await capture(win, 'builder.png')

    await configureTablePreview(win)
    await capture(win, 'table.png')

    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
