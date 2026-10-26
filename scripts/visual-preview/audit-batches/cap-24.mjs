/** CAP-24: Tempo trace lookup, progressive list and scatter local interval. Synthetic IPC only. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles, auditRange, auditSchemas, auditSpanResult, auditTraceResult } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'

export const screenshots = [
  'cap24-traces-default-desktop.png',
  'cap24-traces-open-desktop.png',
  'cap24-tempo-partial-desktop.png',
  'cap24-scatter-selected-desktop.png',
  'cap24-traces-empty-desktop.png',
]

const start = Date.UTC(2026, 7, 19, 16, 0)
const traceId = (number) => number.toString(16).padStart(32, '0')
const lookupId = traceId(0x101)
const missingId = traceId(0xdead)
const failureId = traceId(0xbeef)
const rows = [
  { traceId: lookupId, rootService: 'service-checkout', rootOperation: 'POST /checkout', startTimeMs: start + 50 * 60000, durationMs: 1480, matchedSpans: 16, status: 'error' },
  { traceId: traceId(0x102), rootService: 'service-api', rootOperation: 'GET /orders', startTimeMs: start + 38 * 60000, durationMs: 418, matchedSpans: 13, status: 'ok' },
  { traceId: traceId(0x103), rootService: 'service-worker', rootOperation: 'Process order', startTimeMs: start + 30 * 60000, durationMs: 392, matchedSpans: 12, status: 'ok' },
  { traceId: traceId(0x104), rootService: 'service-payments', rootOperation: 'POST /charge', startTimeMs: start + 22 * 60000, durationMs: 906, matchedSpans: 15, status: 'error' },
  { traceId: traceId(0x105), rootService: 'service-queue', rootOperation: 'Consume event', startTimeMs: start + 10 * 60000, durationMs: 447, matchedSpans: 13, status: 'ok' },
]
const searchResult = (set, notice = 'Synthetic CAP-24 trace search') => ({
  ...auditTraceResult, rows: set, rowCount: set.length, notice,
  execution: { provider: 'tempo', rowCount: set.length, durationMs: 12, requestId: 'cap24-synthetic' },
})
const spanResult = {
  ...auditSpanResult,
  rows: auditSpanResult.rows.map((row) => ({
    ...row,
    traceId: lookupId,
    ...(row.parentSpanId ? {} : { service: 'service-checkout', name: 'POST /checkout' }),
  })),
}
const calls = []
const progressEvents = []
const releaseGates = []
let outcome = 'success'
let ipcMain = null

function sendProgress(event, options, partialRows) {
  assert.ok(options?.progressRequestId, 'Progressive query must carry a renderer-scoped progress request ID')
  const progress = {
    provider: 'tempo', coveredMs: 1800000, totalMs: 3600000,
    completedChunks: 1, pendingChunks: 1, queriesCompleted: 1,
    tracesFound: partialRows.length, rows: partialRows,
  }
  progressEvents.push({ requestIdPresent: true, count: partialRows.length, coveredMs: progress.coveredMs })
  event.sender.send('query:progress', { requestId: options.progressRequestId, progress })
}

export function installAuditIpc(ipc) {
  ipcMain = ipc
  calls.length = 0
  progressEvents.length = 0
  releaseGates.length = 0
  outcome = 'success'
  installBaseIpc(ipc)
  ipc.removeHandler('query:run')
  ipc.handle('query:run', async (event, profileId, query, parameters, options) => {
    const isLookup = /^[0-9a-f]{32}$/.test(String(query).trim())
    const { progressRequestId, ...semanticOptions } = options ?? {}
    const entry = {
      operation: isLookup ? 'trace-id-lookup' : 'trace-search',
      profileId, query, parameters, options: Object.keys(semanticOptions).length ? semanticOptions : null,
      hasProgressRequestId: !!progressRequestId,
      outcome: isLookup ? query === lookupId ? 'found' : query === missingId ? 'missing' : 'provider-error' : outcome,
    }
    calls.push(entry)
    assert.equal(profileId, auditProfiles.tempo.id, 'Unexpected synthetic provider identity')
    assert.deepEqual(parameters, [], 'Tempo must not pass SQL parameters')
    if (isLookup) {
      if (query === lookupId) return { ok: true, result: spanResult }
      if (query === missingId) return { ok: false, kind: 'query', message: 'Synthetic trace not found: ' + query }
      return { ok: false, kind: 'connection', message: 'Synthetic Tempo lookup provider unavailable' }
    }
    assert.equal(query, '{ true }', 'Unexpected Tempo search TraceQL')
    assert.deepEqual(semanticOptions, { start: '2026-08-19T16:00:00.000Z', end: '2026-08-19T17:00:00.000Z' }, 'Search must preserve continuous UTC range')
    if (outcome === 'empty') return { ok: true, result: searchResult([], '') }
    if (outcome === 'failure') return { ok: false, kind: 'connection', message: 'Synthetic Tempo search unavailable' }
    if (outcome === 'progressive') {
      sendProgress(event, options, rows.slice(0, 2))
      await new Promise((done) => { releaseGates.push(done) })
    }
    return { ok: true, result: searchResult(rows) }
  })
}

export async function runVisualAudit({ win, outputDir, waitFor, capture, dragDivider }) {
  await mkdir(outputDir, { recursive: true })
  assert.ok(ipcMain, 'CAP-24 IPC not initialized')
  const observations = []
  const actions = []
  const evaluate = (expression) =>
    win.webContents.executeJavaScript(expression).catch((error) => {
      console.error('CAP24_RENDERER_EXPRESSION_FAILED', expression.slice(0, 450), error.message)
      throw error
    })
  const settle = () => evaluate('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))')
  const awaited = (expression, description) => waitFor(win, expression, description).catch((error) => { console.error("CAP24_WAIT_FAILED", description, expression, error.message); throw error })
  const rowSelector = '[class*="traceList"] [data-observability-row] > button'
  const countRows = () => evaluate('document.querySelectorAll(' + data(rowSelector) + ').length')
  const state = () => evaluate('window.__datakoalaStore.getState().tabs[0]')
  const click = async (selector) => {
    await awaited('document.querySelector(' + data(selector) + ')', 'CAP-24 element ' + selector)
    await evaluate('(() => {const e=document.querySelector(' + data(selector) + ');if(e.disabled)throw Error("CAP-24 disabled control");e.click()})()')
    await settle()
  }
  const clickText = async (label, scope = 'document') => {
    const expression = '[...' + scope + '.querySelectorAll("button")].find(e => e.textContent.trim() === ' + data(label) + ')'
    await awaited(expression, 'CAP-24 button ' + label)
    await evaluate('(() => {const e=' + expression + ';if(e.disabled)throw Error("CAP-24 disabled button: " + ' + data(label) + ');e.click()})()')
    await settle()
  }
  const textInput = async (selector, value) => {
    await evaluate('(() => {const e=document.querySelector(' + data(selector) + ');if(!(e instanceof HTMLInputElement))throw Error("Missing trace input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,' + data(value) + ');e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}))})()')
    await settle()
  }
  const assertNoFetch = async (label, callback) => {
    const before = calls.length
    await callback()
    assert.equal(calls.length, before, label + ' unexpectedly dispatched provider request')
    actions.push({ name: label, requestCountBefore: before, requestCountAfter: calls.length })
  }
  const observe = async (filename, description, selector = '[aria-label="Trace explorer"]') => {
    await settle()
    const geometry = await evaluate('(() => {const el=document.querySelector(' + data(selector) + '),r=el?.getBoundingClientRect();return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,target:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,overflow:document.documentElement.scrollWidth>innerWidth+1,visibleRows:[...document.querySelectorAll(' + data(rowSelector) + ')].map(e=>e.innerText.slice(0,240)),selectedView:document.querySelector("[aria-label=\\"Result view\\"] [aria-pressed=true]")?.textContent.trim()??null,filter:document.querySelector("[data-result-filter-chip]")?.innerText??null,progress:document.querySelector("progress[aria-label^=\\"Tempo search\\"]")?.getAttribute("aria-label")??null,alerts:[...document.querySelectorAll("[role=alert]")].map(e=>e.innerText),content:el?.innerText.slice(-2000)??""}})()')
    assert.deepEqual([geometry.width, geometry.height, geometry.dpr], [1440, 900, 1], filename + ' viewport')
    const zoom = win.webContents.getZoomFactor()
    assert.equal(zoom, 1, filename + ' zoom')
    assert.ok(geometry.target?.width > 0 && geometry.target?.height > 0, filename + ' positive semantic target')
    const tab = await state()
    const snapshot = {
      filename, description, ...geometry, zoom, sourceRevision: tab.resultRevision,
      queryPending: tab.running, queryError: tab.queryError,
      sourceResultRows: tab.result?.rows.length ?? null,
      calls: calls.length,
    }
    observations.push(snapshot)
    await capture(win, filename)
    return snapshot
  }
  const buttonState = () => evaluate('(() => {const view=document.querySelector("[aria-label=\\"Result view\\"]");return {run:document.querySelector("[data-tempo-run-query]")?.disabled,sample:[...document.querySelectorAll("[role=combobox]")].find(e=>e.getAttribute("aria-label")?.startsWith("Sample size:"))?.disabled,open:document.querySelector("#trace-id")?.closest("form")?.querySelector("button[type=submit]")?.disabled,list:[...view?.querySelectorAll("button")??[]].find(e=>e.textContent.trim()==="List")?.disabled,scatter:[...view?.querySelectorAll("button")??[]].find(e=>e.textContent.trim()==="Scatter")?.disabled,map:[...view?.querySelectorAll("button")??[]].find(e=>e.textContent.trim()==="Service map")?.disabled,rows:[...document.querySelectorAll(' + data(rowSelector) + ')].map(e=>e.disabled)}})()')
  const run = async () => {
    const prior = calls.length
    await click('[data-tempo-run-query]')
    await awaited('!window.__datakoalaStore.getState().tabs[0].running', 'CAP-24 search completed')
    assert.equal(calls.length, prior + 1, 'Expected one new search request')
  }

  win.show()
  win.focus()
  win.setContentSize(1440, 900)
  win.webContents.setZoomFactor(1)
  await evaluate('(() => {const s=window.__datakoalaStore,t=JSON.parse(JSON.stringify(s.getState().tabs[0])),p=' + data(auditProfiles.tempo) + ';t.id="cap24";t.title="CAP-24 Trace audit";t.connectionProfileId=p.id;t.queryMode="sql";t.sql="{ true }";t.result=null;t.queryError=null;t.running=false;t.tempoTimeRange=' + data(auditRange) + ';t.tempoSampleSize="all";t.tempoResultView="list";s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:"connected",generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:' + data(auditSchemas) + ',status:"loaded",error:null,isStale:false}}})})()')
  await awaited('document.querySelector("[aria-label=\\"Trace explorer\\"]") && document.querySelector("[data-tempo-run-query]")', 'CAP-24 Tempo renderer')
  const sidebarDelta = await evaluate('240 - document.querySelector("[aria-label=\\"Resize sidebar\\"]").getBoundingClientRect().left')
  if (Math.abs(sidebarDelta) > 1) await dragDivider(win, '[aria-label="Resize sidebar"]', Math.round(sidebarDelta), 0)
  const editorDelta = await evaluate('document.querySelector(".main").getBoundingClientRect().top + 330 - document.querySelector(".editor-resizer").getBoundingClientRect().top')
  if (Math.abs(editorDelta) > 1) await dragDivider(win, '.editor-resizer', 0, Math.round(editorDelta))

  // T15/T16: search through actual Run, then inspect real list order and statuses.
  await run()
  await awaited('document.querySelectorAll(' + data(rowSelector) + ').length===5', 'CAP-24 five search rows')
  const list = await evaluate('[...document.querySelectorAll(' + data(rowSelector) + ')].map(e=>e.innerText)')
  assert.deepEqual(list.map((text) => rows.find((row) => text.includes(row.rootService))?.traceId), rows.map((row) => row.traceId), 'Five deterministic trace summaries are ordered newest-first')
  const statuses = await evaluate('[...document.querySelectorAll(' + data(rowSelector) + ')].map(e=>e.querySelector("[aria-label$=\\"trace\\"]")?.getAttribute("aria-label"))')
  assert.deepEqual(statuses, ['Error trace','Successful trace','Successful trace','Error trace','Successful trace'], 'Visible statuses reflect each fixture')
  const initial = await observe('cap24-traces-default-desktop.png', 'Five deterministic trace search results, identity, status, ordering and count')
  assert.equal(initial.overflow, false, 'Trace default viewport has horizontal document overflow')
  actions.push({ name: 'initial-search', request: calls[0], visible: list.length, statusLabels: statuses })

  // T14: opening through an actual search row retains the selected identity and bounded lookup.
  await click(rowSelector)
  await awaited('document.body.innerText.includes(' + data(lookupId) + ') && document.querySelector("header[class*=traceHeader_]")', 'CAP-24 opened trace')
  assert.equal(calls.at(-1).operation, 'trace-id-lookup')
  assert.equal(calls.at(-1).query, lookupId)
  assert.deepEqual(calls.at(-1).options, {
    start: '2026-08-19T16:49:55.000Z', end: '2026-08-19T16:50:06.480Z',
  }, 'Lookup of a search row must use bounded trace timestamps')
  await observe('cap24-traces-open-desktop.png', 'Search result opened with matching exact canonical trace ID', 'header[class*="traceHeader_"]')
  await assertNoFetch('back-to-search-results', async () => {
    await clickText('← Search results')
    await awaited('document.querySelectorAll(' + data(rowSelector) + ').length===5', 'CAP-24 returned list')
  })
  assert.equal((await state()).result?.rows.length, 5, 'Back navigation must retain search cohort')

  // Direct ID not-found and provider errors must remain distinguishable.
  await textInput('#trace-id', missingId)
  await clickText('Open trace', 'document.querySelector("#trace-id").closest("form")')
  await awaited('document.querySelector("[role=alert]")?.innerText.includes("Synthetic trace not found")', 'CAP-24 explicit not found')
  assert.equal(calls.at(-1).query, missingId)
  assert.equal(calls.at(-1).options, null, 'Direct trace lookup has no searched-row range')
  assert.equal(await evaluate('!!document.querySelector("header[class*=traceHeader_]")'), false, 'Missing trace cannot be presented as successful open')
  actions.push({ name: 'missing-trace', request: calls.at(-1), notice: 'Synthetic trace not found' })
  await textInput('#trace-id', failureId)
  await clickText('Open trace', 'document.querySelector("#trace-id").closest("form")')
  await awaited('document.querySelector("[role=alert]")?.innerText.includes("provider unavailable")', 'CAP-24 explicit provider failure')
  assert.equal(calls.at(-1).query, failureId)
  actions.push({ name: 'provider-lookup-error', request: calls.at(-1), notice: 'Synthetic Tempo lookup provider unavailable' })

  // T15/T17: actual progressive IPC emits 2 then resolves to 5; inspect disabled controls.
  outcome = 'progressive'
  const countBeforeProgress = calls.length
  await click('[data-tempo-run-query]')
  await awaited('document.querySelectorAll(' + data(rowSelector) + ').length===2 && document.body.innerText.includes("2 traces so far")', 'CAP-24 progressive 2 traces')
  assert.equal(calls.length, countBeforeProgress + 1)
  assert.equal(releaseGates.length, 1, 'Pending provider completion must remain explicitly gated')
  const pending = await buttonState()
  assert.equal(pending.run, true, 'Run disabled during progressive fetch')
  assert.equal(pending.sample, true, 'Sample size disabled during progressive fetch')
  assert.equal(pending.open, true, 'Open trace disabled during progressive fetch')
  assert.equal(pending.map, true, 'Service map disabled during progressive fetch')
  assert.deepEqual(pending.rows, [true, true], 'Individual trace buttons disabled during progressive fetch')
  assert.equal(pending.list, false, 'List view remains selectable during progress')
  assert.equal(pending.scatter, false, 'Scatter view remains selectable during progress')
  const partial = await observe('cap24-tempo-partial-desktop.png', 'Actual two-trace progressive batch; pending service map and row actions')
  assert.equal(partial.queryPending, true)
  const release = releaseGates.shift()
  assert.ok(release)
  release()
  await awaited('!window.__datakoalaStore.getState().tabs[0].running && document.querySelectorAll(' + data(rowSelector) + ').length===5', 'CAP-24 completed five traces')
  const completed = await buttonState()
  assert.equal(completed.run, false)
  assert.equal(completed.sample, false)
  assert.equal(completed.map, false)
  assert.deepEqual(completed.rows, [false,false,false,false,false])
  assert.equal(progressEvents.length, 1, 'Expected one deterministic two-trace progress envelope')
  const finalRows = await evaluate('[...document.querySelectorAll(' + data(rowSelector) + ')].map(e=>e.innerText)')
  assert.ok(finalRows[0].includes(rows[0].rootService) && finalRows[1].includes(rows[1].rootService), 'Existing progressive rows retained their identity')
  actions.push({ name: 'two-to-five-completion', pending, completed, partialRows: 2, finalRows: 5, request: calls.at(-1) })

  // T17/T18: switch real view controls, drag a native brush, verify no provider dispatch.
  await assertNoFetch('list-to-scatter', () => clickText('Scatter', 'document.querySelector("[aria-label=\\"Result view\\"]")'))
  await awaited('(() => {const chart=document.querySelector("[data-visual-type=scatter][data-visual-finished=true]");return chart && chart.getAttribute("data-visual-items")==="5"})()', 'CAP-24 real scatter populated')
  const brushBefore = calls.length
  const canvasRect = await evaluate('(() => {const c=document.querySelector("[data-visual-type=scatter] canvas");if(!c)throw Error("Missing ECharts canvas");const r=c.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()')
  assert.ok(canvasRect.width > 240 && canvasRect.height > 100, 'ECharts must have meaningful plot size')
  const plotWidth = canvasRect.width - 98
  const from = { x: Math.round(canvasRect.x + 72 + plotWidth * .19), y: Math.round(canvasRect.y + Math.min(canvasRect.height - 65, 116)) }
  const to = { x: Math.round(canvasRect.x + 72 + plotWidth * .69), y: from.y }
  win.webContents.sendInputEvent({ type: 'mouseMove', ...from })
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...from })
  for (const fraction of [.2,.4,.6,.8,1]) {
    const x = Math.round(from.x + (to.x - from.x) * fraction)
    win.webContents.sendInputEvent({ type: 'mouseMove', button: 'left', x, y: from.y })
  }
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', ...to })
  await awaited('document.querySelector("[data-result-filter-chip]") && document.querySelector("[data-visual-type=scatter]")', 'CAP-24 real ECharts brush created local filter')
  await settle()
  assert.equal(calls.length, brushBefore, 'Native scatter brush must not fetch Tempo')
  const filterText = await evaluate('document.querySelector("[data-result-filter-chip]").innerText')
  const match = filterText.match(/\[([^,\]]+), ([^\)]+)\)/)
  assert.ok(match, 'Local range filter must expose its exact half-open bounds: ' + filterText)
  const selectedStart = Date.parse(match[1])
  const selectedEnd = Date.parse(match[2])
  assert.ok(Number.isFinite(selectedStart) && selectedEnd > selectedStart, 'Native selected interval valid')
  const visibleScatter = Number(await evaluate('document.querySelector("[data-visual-type=scatter]").getAttribute("data-visual-items")'))
  const expected = rows.filter(row => row.startTimeMs >= selectedStart && row.startTimeMs < selectedEnd).length
  assert.equal(visibleScatter, expected, 'Actual scatter marks reflect half-open local cohort')
  assert.ok(visibleScatter > 0 && visibleScatter < 5, 'Native brush should select a nontrivial subset')
  await observe('cap24-scatter-selected-desktop.png', 'Native chart brush, displayed [start,end) filter and matching subset', '[data-trace-scatter]')
  actions.push({ name: 'native-brush', interval: { startMs: selectedStart, endMs: selectedEnd, startInclusive: match[1], endExclusive: match[2] }, visibleScatter, includedIds: rows.filter(row => row.startTimeMs >= selectedStart && row.startTimeMs < selectedEnd).map(row => row.traceId), requestCountBefore: brushBefore, requestCountAfter: calls.length })

  await assertNoFetch('scatter-to-list-after-brush', () => clickText('List', 'document.querySelector("[aria-label=\\"Result view\\"]")'))
  assert.equal(await countRows(), expected, 'List and scatter must share filtered cohort')

  // Inject a deterministic *source* result at exactly both selected boundaries.
  // This is renderer-state fixture replacement, not a second provider fetch or brush.
  const boundaryRows = [
    { ...rows[0], traceId: traceId(0x201), rootService: 'Boundary start included', startTimeMs: selectedStart },
    { ...rows[1], traceId: traceId(0x202), rootService: 'Boundary end excluded', startTimeMs: selectedEnd },
    { ...rows[2], traceId: traceId(0x203), rootService: 'Inside interval', startTimeMs: Math.floor((selectedStart + selectedEnd) / 2) },
    { ...rows[3], traceId: traceId(0x204), rootService: 'Before interval', startTimeMs: selectedStart - 2000 },
    { ...rows[4], traceId: traceId(0x205), rootService: 'After interval', startTimeMs: selectedEnd + 2000 },
  ]
  const countBeforeBoundary = calls.length
  await evaluate('(() => {const s=window.__datakoalaStore,t=s.getState().tabs[0];s.setState({tabs:[{...t,result:' + data(searchResult(boundaryRows)) + ',resultRevision:(t.resultRevision??0)+1}]})})()')
  await settle()
  const boundaryDiagnostic = await evaluate('(() => { const t=window.__datakoalaStore.getState().tabs[0];return {activeTab:window.__datakoalaStore.getState().activeTabId,storedResultRows:t.result?.rows.map(row=>({service:row.rootService,start:row.startTimeMs})),selectedView:document.querySelector("[aria-label=\\\"Result view\\\"] [aria-pressed=true]")?.textContent.trim(),visibleRows:[...document.querySelectorAll(' + data(rowSelector) + ')].map(e=>e.innerText),filter:document.querySelector("[data-result-filter-chip]")?.innerText} })()')
  console.log('CAP24_BOUNDARY_DIAGNOSTIC', JSON.stringify(boundaryDiagnostic))
  const boundaryVisible = boundaryDiagnostic.visibleRows
  assert.ok(boundaryDiagnostic.storedResultRows?.length === 5, 'All five source boundary fixture traces must be present')
  assert.ok(boundaryVisible.some(x => x.includes('Inside interval')), 'Native list must show inside-interval trace')
  assert.equal(boundaryVisible.length, 2, 'Expected a two-trace filtered cohort')
  const startVisible = boundaryVisible.some(x => x.includes('Boundary start included'))
  const endVisible = boundaryVisible.some(x => x.includes('Boundary end excluded'))
  const displayBoundaryContractSatisfied = startVisible && !endVisible
  const boundaryFinding = {
    name: 'displayed-half-open-boundary',
    fixtureInjection: 'renderer-store source-result replacement after native pointer brush',
    intervalLabel: boundaryDiagnostic.filter,
    selectedStart, selectedEnd,
    traceAtDisplayedStart: traceId(0x201),
    traceAtDisplayedEnd: traceId(0x202),
    startVisible, endVisible,
    expected: {startVisible: true, endVisible: false},
    displayBoundaryContractSatisfied,
    visibleRows: boundaryVisible,
    providerRequestDelta: calls.length - countBeforeBoundary,
    sourceExplanation: 'Brush bounds are truncated toward zero after clamping; the chip and local half-open membership share those millisecond bounds.',
  }
  assert.equal(calls.length, countBeforeBoundary, 'Local boundary fixture swap must not fetch')
  actions.push(boundaryFinding)
  if (!displayBoundaryContractSatisfied) console.error('CAP24_CONFIRMED_DISPLAY_BOUNDARY_MISMATCH', JSON.stringify(boundaryFinding))
  await assertNoFetch('remove-local-filter', () => click('[data-result-filter-chip] button[aria-label^="Remove filter"]'))
  await awaited('document.querySelectorAll(' + data(rowSelector) + ').length===5', 'CAP-24 restored source cohort')
  assert.equal(await evaluate('!!document.querySelector("[data-result-filter-chip]")'), false, 'Clearing local filter must remove chip')

  // Empty and failed searches are distinct from pending and from direct-ID lookup failures.
  outcome = 'empty'
  await run()
  await awaited('!document.querySelector(' + data(rowSelector) + ') && !document.querySelector("[role=status] progress")', 'CAP-24 empty settled result')
  const empty = await observe('cap24-traces-empty-desktop.png', 'Completed empty trace search, no phantom rows')
  assert.equal(empty.sourceResultRows, 0)
  assert.equal(empty.queryPending, false)
  assert.equal(empty.visibleRows.length, 0)
  outcome = 'failure'
  await run()
  await awaited('document.querySelector("[role=alert]")?.innerText.includes("Synthetic Tempo search unavailable")', 'CAP-24 failed search warning')
  assert.equal((await state()).queryError, 'Synthetic Tempo search unavailable')
  actions.push({ name: 'search-error', error: 'Synthetic Tempo search unavailable', request: calls.at(-1) })
  assert.ok(calls.length >= 6, 'All expected trace searches/lookups exercised')

  const sourceHead = process.env.DATAKOALA_AUDIT_HEAD
  assert.match(sourceHead ?? '', /^[0-9a-f]{40}$/, 'Source commit provenance is mandatory')
  await writeFile(resolve(outputDir, 'measurements.json'), JSON.stringify({
    sourceHead,
    execution: 'Native Electron real controls and synthetic Tempo query:run/progress IPC; never authenticated provider',
    viewport: {width:1440,height:900,dpr:1,zoom:1},
    fixtures: {traceIds:rows.map(row=>row.traceId),startIso:new Date(start).toISOString(),found:lookupId,missing:missingId,failed:failureId,progressiveCounts:[2,5]},
    calls,progressEvents,actions,observations,boundaryFinding,
    residual: ['No authenticated Tempo backend behavior','Stale completion supersession and progressive interruption not exercised','Empty successful span result differs from provider not-found error and is untested'],
  }, null, 2) + '\n')
  console.log('CAP24_EVIDENCE_CAPTURED '+JSON.stringify({sourceHead,screenshots:observations.map(o=>o.filename),calls:calls.length,actions:actions.map(a=>a.name),displayBoundaryContractSatisfied}))
  // Positive regression for the displayed half-open interval; historical reports remain immutable.
  const characterizedMembership = {
    startVisible: boundaryFinding.startVisible,
    endVisible: boundaryFinding.endVisible,
    insideVisible: boundaryFinding.visibleRows.some(row => row.includes('Inside interval')),
    beforeVisible: boundaryFinding.visibleRows.some(row => row.includes('Before interval')),
    afterVisible: boundaryFinding.visibleRows.some(row => row.includes('After interval')),
    visibleServices: boundaryFinding.visibleRows.map(row => row.split(String.fromCharCode(10))[0]),
  }
  assert.deepEqual(characterizedMembership, {
    startVisible: true,
    endVisible: false,
    insideVisible: true,
    beforeVisible: false,
    afterVisible: false,
    visibleServices: ['Boundary start included', 'Inside interval'],
  }, 'CAP-24 displayed bounds must include the start and exclude the end')
  assert.equal(displayBoundaryContractSatisfied, true,
    'CAP-24 requires passing displayed [start, end) product acceptance')
  console.log('CAP24_DISPLAY_BOUNDARY_VERIFIED '+JSON.stringify({
    sourceHead, characterizedMembership, productAcceptance: 'PASS',
    finding: 'VC24-03 displayed-boundary regression passes',
  }))
}
