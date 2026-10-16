/** CAP-26 generic result visualization: deterministic IPC, actual Electron controls, audit only. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles, auditRange } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'

export const screenshots = [
  'cap26-views-postgres-default-desktop.png',
  'cap26-views-postgres-changed-desktop.png',
  'cap26-scatter-desktop.png',
  'cap26-treemap-desktop.png',
  'cap26-sunburst-desktop.png',
  'cap26-prometheus-chart-desktop.png',
]
const column = (name, logicalType, dataTypeName, dataTypeID) => ({
  name, logicalType, dataTypeName, dataTypeID,
})
const times = [0, 10, 20, 30].map(minute =>
  new Date(Date.parse('2026-08-19T16:00:00.000Z') + minute * 60000).toISOString())
const buckets = {
  North: { API: [10, 14, 8, 12], Worker: [5, 0, 7, null] },
  South: { API: [20, 9, -2, 11], Worker: [7, 4, 6, 3] },
}
const sqlColumns = [
  column('time_bucket', 'timestamp', 'timestamptz', 1184),
  column('series', 'string', 'text', 25),
  column('category', 'string', 'text', 25),
  column('duration_ms', 'number', 'int4', 23),
  column('value', 'number', 'float8', 701),
  column('other_value', 'number', 'int4', 23),
]
const sqlRows = times.flatMap((time_bucket, index) =>
  Object.entries(buckets).flatMap(([series, categories], si) =>
    Object.entries(categories).map(([category, values], ci) => ({
      time_bucket, series, category,
      duration_ms: 100 + index * 30 + si * 10 + ci * 3,
      value: values[index], other_value: 100 - index * 5 - ci * 8,
    }))))
const sqlResult = {
  columns: sqlColumns, rows: sqlRows, rowCount: sqlRows.length, durationMs: 7,
  execution: { provider: 'postgres', durationMs: 7, rowCount: sqlRows.length },
}
const promColumns = [
  column('timestamp', 'timestamp', 'timestamp', 0),
  column('value', 'number', 'float8', 0),
  column('status', 'string', 'text', 0),
  column('instance', 'string', 'text', 0),
]
const promRows = [0, 1, 2, 3, 4].flatMap((n) => [
  { timestamp: new Date(Date.parse(times[0]) + n * 60000).toISOString(),
    value: [8, 13, 7, 16, 12][n], status: '200', instance: 'gateway-east' },
  { timestamp: new Date(Date.parse(times[0]) + n * 60000).toISOString(),
    value: [3, 4, null, 2, 5][n], status: '500', instance: 'gateway-west' },
])
const promResult = {
  resultKind: 'metrics', columns: promColumns, rows: promRows,
  rowCount: promRows.length, durationMs: 7,
  execution: { provider: 'prometheus', durationMs: 7, rowCount: promRows.length },
}
const requests = []
let replyMode = 'normal'
const calls = kind => requests.filter(request => request.kind === kind).length
export function installAuditIpc(ipc) {
  installBaseIpc(ipc)
  requests.length = 0
  replyMode = 'normal'
  ipc.removeHandler('query:run')
  ipc.handle('query:run', (_event, id, query, parameters, options) => {
    const kind = id === auditProfiles.prometheus.id ? 'prometheus' : 'postgres'
    requests.push({ kind, id, query, parameterCount: parameters?.length ?? 0,
      range: options ? { start: options.start, end: options.end, step: options.step } : null })
    const result = kind === 'prometheus' ? promResult : sqlResult
    if (kind === 'postgres' && replyMode === 'empty') {
      return { ok: true, result: { ...result, rows: [], rowCount: 0 } }
    }
    if (kind === 'postgres' && replyMode === 'single') {
      return { ok: true, result: { ...result, rows: result.rows.slice(0, 1), rowCount: 1 } }
    }
    if (kind === 'postgres' && replyMode === 'shape') {
      const columns = [column('new_label', 'string', 'text', 25), column('amount', 'number', 'int4', 23)]
      return { ok: true, result: { ...result, columns, rows: [{ new_label: 'changed shape', amount: 9 }], rowCount: 1 } }
    }
    return { ok: true, result }
  })
}
export async function runVisualAudit({ win, outputDir, waitFor, capture, dragDivider }) {
  await mkdir(outputDir, { recursive: true })
  const observations = [], checks = []
  const js = expression => win.webContents.executeJavaScript(expression)
  const settle = () => js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
  const expectNoQueries = (before, label) => {
    assert.equal(requests.length, before, label + ': presentation must not query provider')
    checks.push({ label, expectedRequests: before, actualRequests: requests.length, providerQueryDelta: 0 })
  }
  const clickButton = async (name, selector = 'button') => {
    const target = '[...document.querySelectorAll(' + data(selector) +
      ')].find(e=>!e.disabled && (e.getAttribute("aria-label")===' + data(name) +
      '||e.textContent.trim()===' + data(name) + '))'
    await waitFor(win, target, 'button ' + name)
    await js('(' + target + ').click()')
    await settle()
  }
  const view = async name => {
    await clickButton(name, '[role="toolbar"][aria-label="Result view"] button')
    await waitFor(win, 'document.querySelector(' + data('[role="toolbar"][aria-label="Result view"] [aria-label="' + name + '"]') +
      ')?.getAttribute("aria-pressed")==="true"', 'selected ' + name + ' view')
  }
  const combobox = async (label, option) => {
    const trigger = '[...document.querySelectorAll("[role=combobox]")].find(e=>e.getAttribute("aria-label")?.startsWith(' + data(label + ':') + '))'
    await waitFor(win, trigger, label + ' combobox')
    await js('(' + trigger + ').click()')
    await waitFor(win, 'document.querySelector(' + data('[role=listbox][aria-label="' + label + '"]') + ')', label + ' options')
    const target = '[...document.querySelectorAll("[role=option]")].find(e=>e.querySelector("[data-combobox-option-label]")?.textContent.trim()===' + data(option) + ')'
    await waitFor(win, target, label + ': ' + option)
    await js('(' + target + ').click()')
    await settle()
  }
  const multi = async (label, option) => {
    const trigger = '[...document.querySelectorAll("[role=combobox]")].find(e=>e.getAttribute("aria-label")?.startsWith(' + data(label + ':') + '))'
    await waitFor(win, trigger, label + ' multi-combobox')
    await js('(' + trigger + ').click()')
    await waitFor(win, 'document.querySelector(' + data('[role=listbox][aria-label="' + label + '"]') + ')', label + ' options')
    const target = '[...document.querySelectorAll("[role=option]")].find(e=>e.querySelector("[data-combobox-option-label]")?.textContent.trim()===' + data(option) + ')'
    await waitFor(win, target, label + ': ' + option)
    await js('(' + target + ').click()')
    await js('(' + trigger + ').click()')
    await settle()
  }
  const tab = () => js('window.__datakoalaStore.getState().tabs[0]')
  const chart = () => js('(() => {const e=document.querySelector("[data-result-chart-canvas]");return e?{type:e.dataset.visualType,finished:e.dataset.visualFinished==="true",series:Number(e.dataset.visualSeries),items:Number(e.dataset.visualItems),fingerprint:e.dataset.visualFingerprint,expectedFingerprint:e.dataset.visualExpectedFingerprint,config:JSON.parse(e.dataset.visualConfig||"null"),canvas:Boolean(e.querySelector("canvas")),bounds:(()=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height}})()}:null})()')
  const chartReady = async (name, minSeries = 1) => {
    await waitFor(win, '(() => {const e=document.querySelector(' + data('[data-result-chart-canvas][data-visual-type="' + name + '"]') +
      ');return e?.dataset.visualFinished==="true" && e.dataset.visualFingerprint===e.dataset.visualExpectedFingerprint && !!e.querySelector("canvas")})()', 'finished fresh ' + name)
    const c = await chart()
    assert.equal(c.type, name)
    assert.ok(c.finished && c.canvas && c.bounds.width > 0 && c.bounds.height > 0)
    assert.ok(c.series >= minSeries && c.items > 0, name + ' chart must contain semantic marks')
    return c
  }
  const frame = async (filename, description, selector) => {
    await settle()
    const m = await js('(() => {const e=document.querySelector(' + data(selector) +
      '),r=e?.getBoundingClientRect();return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,target:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,overflow:document.documentElement.scrollWidth>innerWidth+1,viewButtons:[...document.querySelectorAll("[aria-label=\\"Result view\\"] button")].map(b=>({name:b.getAttribute("aria-label"),pressed:b.getAttribute("aria-pressed")})),comboboxes:[...document.querySelectorAll("[data-result-explorer] [role=combobox]")].map(e=>e.getAttribute("aria-label")),empty:document.querySelector("[data-result-empty]")?.textContent.trim()??null}})()')
    assert.deepEqual([m.width, m.height, m.dpr], [1440, 900, 1])
    m.zoom = win.webContents.getZoomFactor()
    assert.equal(m.zoom, 1)
    assert.ok(m.target?.width > 0 && m.target.height > 0, filename + ': semantic content visible')
    observations.push({ filename, description, ...m, requestCount: requests.length,
      configuration: (await tab()).sqlVisualization, chart: await chart() })
    await capture(win, filename)
  }
  const seed = async kind => {
    const p = auditProfiles[kind]
    await js('(() => {const s=window.__datakoalaStore,t=JSON.parse(JSON.stringify(s.getState().tabs[0])),p=' + data(p) +
      ';t.id=' + data('cap26-' + kind) + ';t.title="CAP-26 synthetic";t.connectionProfileId=p.id;t.queryMode="sql";t.sql=' +
      data(kind === 'postgres' ? 'select * from example.cap26_timeseries' : 'up') +
      ';t.result=null;t.queryError=null;t.running=false;t.pendingQuery=null;t.sqlResultFilters=[];t.builderResultFilters=[];t.seriesVisibility={};t.lastSuccessfulResultRevision=0;t.sqlVisualization={view:"table",xColumn:null,valueColumn:null,aggregation:"sum",seriesColumn:null,seriesColumns:[],hierarchyDimensions:[],valueAxisScale:"linear"};t.prometheusTimeRange=' +
      data(auditRange) +
      ';s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:"connected",generation:1,error:null,serverVersion:"17"}},metadataByProfileId:{[p.id]:{schemas:[],status:"loaded",error:null,isStale:false,revision:1}}})})()')
    await waitFor(win, 'window.__datakoalaStore.getState().activeTabId===' + data('cap26-' + kind) +
      ' && document.querySelector("[data-query-toolbar]")', kind + ' renderer')
    await settle()
  }
  const run = async (kind) => {
    const before = requests.length
    await clickButton('Run', '[data-query-toolbar] button')
    await waitFor(win, '(() => {const t=window.__datakoalaStore.getState().tabs[0];return !t.running && t.result && t.result.execution?.provider===' +
      data(kind) + '})()', kind + ' result finished')
    assert.equal(requests.length, before + 1, 'explicit Run makes one provider request')
  }
  win.show(); win.focus(); win.setContentSize(1440, 900); win.webContents.setZoomFactor(1)
  await seed('postgres')
  const editorDelta = await js('document.querySelector(".main").getBoundingClientRect().top+275-document.querySelector(".editor-resizer").getBoundingClientRect().top')
  if (Math.abs(editorDelta) > 1) await dragDivider(win, '.editor-resizer', 0, Math.round(editorDelta))
  await run('postgres')
  assert.equal(calls('postgres'), 1)
  assert.equal((await tab()).result.rows.length, 16)
  assert.ok(await js('document.querySelectorAll("[data-result-table-pane] tbody tr").length>0'), 'actual table rows')
  await frame(screenshots[0], 'PostgreSQL Table, 16 deterministic rows before chart selection', '[data-result-table-pane]')
  const postgresQueries = requests.length
  for (const name of ['Line', 'Bar', 'Area']) {
    await view(name)
    const c = await chartReady(name.toLowerCase(), 2)
    assert.deepEqual([c.config.x, c.config.y, ...c.config.series], ['time_bucket', 'value', 'series'])
    expectNoQueries(postgresQueries, name + ' view selection')
    checks.push({ label: name + ' mapped chart', type: c.type, series: c.series, items: c.items, configuration: c.config })
  }
  await frame(screenshots[1], 'Actual Area selection after Line and Bar with stable provider count', '[data-result-chart-canvas]')
  await view('Scatter')
  await combobox('X axis', 'duration_ms')
  await combobox('Y axis', 'other_value')
  const scatter = await chartReady('scatter', 2)
  assert.equal(scatter.items, 16, 'Exactly the 16 observed source coordinates are plotted, with no synthetic zero marks')
  assert.equal(scatter.config.x, 'duration_ms')
  assert.equal(scatter.config.y, 'other_value')
  assert.equal(scatter.config.series[0], 'series')
  assert.equal(sqlRows.find(r=>r.duration_ms===100 && r.series==='North')?.other_value, 100)
  checks.push({ label: 'scatter known source coordinates', sample: { x: 100, y: 100, series: 'North' },
    observedConfig: scatter.config, semanticItemCount: scatter.items })
  expectNoQueries(postgresQueries, 'scatter dimension mapping')
  await frame(screenshots[2], 'Scatter with actual X/Y combobox changes and two result-derived series', '[data-result-chart-canvas]')
  await combobox('Y axis', 'value')
  await multi('Series', 'category')
  await view('Treemap')
  const tree = await chartReady('treemap')
  const hierarchy = (await tab()).sqlVisualization.hierarchyDimensions
  assert.deepEqual(new Set(hierarchy), new Set(['series', 'category']))
  const sums = Object.fromEntries(Object.entries(buckets).map(([s, values]) =>
    [s, Object.fromEntries(Object.entries(values).map(([cat, v]) =>
      [cat, v.reduce((sum, value) => sum + (value ?? 0), 0)]))]))
  assert.deepEqual(sums, { North: { API: 44, Worker: 12 }, South: { API: 38, Worker: 20 } })
  checks.push({ label: 'treemap fixed hierarchy aggregates', hierarchy, sums,
    parentTotals: { North: 56, South: 58 }, chart: tree })
  expectNoQueries(postgresQueries, 'treemap hierarchy transition')
  await frame(screenshots[3], 'Treemap showing two-level 114-unit hierarchy', '[data-result-chart-canvas]')
  if (hierarchy.length > 1) {
    await clickButton('Move ' + hierarchy[0] + ' outward', '[aria-label="Hierarchy order"] button')
    await waitFor(win, 'window.__datakoalaStore.getState().tabs[0].sqlVisualization.hierarchyDimensions[0]===' +
      data(hierarchy[1]), 'actual hierarchy reorder')
    const reordered = (await tab()).sqlVisualization.hierarchyDimensions
    checks.push({ label: 'actual hierarchy reorder', before: hierarchy, after: reordered })
    expectNoQueries(postgresQueries, 'hierarchy reorder')
  }
  await view('Sunburst')
  const sunburst = await chartReady('sunburst')
  assert.equal(sunburst.series, 1)
  assert.deepEqual(new Set((await tab()).sqlVisualization.hierarchyDimensions), new Set(['series', 'category']))
  checks.push({ label: 'sunburst same source cohort and hierarchy totals', rows: sqlRows.length, total: 114,
    hierarchy: (await tab()).sqlVisualization.hierarchyDimensions, chart: sunburst })
  expectNoQueries(postgresQueries, 'sunburst visualization')
  await frame(screenshots[4], 'Sunburst preserving the same rows and 114-unit aggregate', '[data-result-chart-canvas]')
  await view('Line')
  await combobox('Value axis scale', 'Log')
  assert.equal((await tab()).sqlVisualization.valueAxisScale, 'log')
  await chartReady('line')
  checks.push({ label: 'logarithmic scale', status: await js('[...document.querySelectorAll("[role=status]")].map(e=>e.textContent.trim()).filter(t=>t.includes("Log scale"))') })
  expectNoQueries(postgresQueries, 'log-scale change')
  await combobox('Unit', 'Time')
  await combobox('Input time unit', 's')
  assert.deepEqual((await tab()).sqlVisualization.displayUnit, { family: 'time', unit: 's' })
  expectNoQueries(postgresQueries, 'temporal unit change')
  await view('Table')
  assert.ok(await js('Boolean(document.querySelector("[data-result-table-pane] table"))'))
  expectNoQueries(postgresQueries, 'return to Table')
  replyMode = 'empty'
  await run('postgres')
  await view('Line')
  await waitFor(win, 'document.querySelector("[data-result-empty]")?.textContent.includes("Query returned no rows")', 'empty result state')
  checks.push({ label: 'explicit empty response', resultRows: 0, message: await js('document.querySelector("[data-result-empty]").textContent.trim()') })
  replyMode = 'single'
  await run('postgres')
  await chartReady('line')
  assert.equal((await tab()).result.rows.length, 1)
  checks.push({ label: 'single point result', rows: 1 })
  replyMode = 'shape'
  await run('postgres')
  const reconciled = (await tab()).sqlVisualization
  assert.equal(reconciled.xColumn, 'new_label')
  assert.equal(reconciled.valueColumn, 'amount')
  checks.push({ label: 'shape change reconciles stale X/Y fields', config: reconciled })
  replyMode = 'normal'
  await seed('prometheus')
  await run('prometheus')
  assert.equal(calls('prometheus'), 1)
  await view('Line')
  await multi('Series', 'status')
  const prom = await chartReady('line', 2)
  assert.deepEqual([prom.config.x, prom.config.y, ...prom.config.series], ['timestamp', 'value', 'status'])
  assert.equal((await tab()).result.rows.length, promRows.length)
  checks.push({ label: 'Prometheus result-derived label series', labels: ['200', '500'], resultRows: promRows.length,
    zeroProviderDeltaAfterConfig: 0, chart: prom })
  const beforePromPresentation = requests.length
  await view('Area')
  await chartReady('area', 2)
  await view('Bar')
  await chartReady('bar', 2)
  await view('Line')
  await chartReady('line', 2)
  expectNoQueries(beforePromPresentation, 'Prometheus chart view transitions')
  await frame(screenshots[5], 'Prometheus two-label metric series, real Line chart and no presentation refetch', '[data-result-chart-canvas]')
  assert.equal(observations.length, screenshots.length)
  await writeFile(resolve(outputDir, 'measurements.json'), JSON.stringify({
    schemaVersion: 1,
    sourceHead: process.env.DATAKOALA_AUDIT_HEAD ?? 'local-working-tree',
    fixtures: { sqlRows: sqlRows.length, prometheusRows: promRows.length, times, totalHierarchyValue: 114 },
    observations, checks, requests,
  }, null, 2) + '\n')
}
