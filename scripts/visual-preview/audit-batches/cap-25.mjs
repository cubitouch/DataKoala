/** CAP-25: Tempo service-map/cohort and span-hierarchy characterization. Audit only. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles, auditRange } from '../audit-fixtures.mjs'
import { previewTraceSearchResult, previewTraceResult } from '../trace-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'

export const screenshots = [
  'cap25-tempo-service-map-desktop.png',
  'cap25-traces-open-desktop.png',
  'cap25-span-inspector-desktop.png',
  'cap25-traces-expanded-desktop.png',
  'cap25-tempo-empty-or-error-desktop.png',
]
const origin = Date.parse('2026-08-19T16:20:00.000Z')
const ids = {
  a: '00000000000000000000000000000201',
  b: '00000000000000000000000000000202',
  c: '00000000000000000000000000000203',
  rootOnly: '00000000000000000000000000000204',
}
const spanIds = {
  root: '00000000000000a1',
  child: '00000000000000a2',
  db: '00000000000000a3',
  producer: '00000000000000a4',
  worker: '00000000000000a5',
}
const profile = {
  ...auditProfiles.tempo,
  grafana: {
    baseUrl: 'https://grafana.example.invalid',
    datasourceUid: 'example-tempo',
    datasourceType: 'tempo',
    orgId: 1,
  },
}
const row = (traceId, rootService, startTimeMs, durationMs, status = 'ok') => ({
  traceId, rootService, rootOperation: 'CAP25 synthetic request',
  startTimeMs, durationMs, matchedSpans: 4, status,
})
const searchRows = [
  row(ids.a, 'gateway', origin, 10000, 'error'),
  row(ids.b, 'gateway', origin + 120000, 7000),
  row(ids.c, 'legacy-only', origin + 240000, 8000),
]
const searchResult = (filtered = false, empty = false) => {
  const rows = empty ? [] : filtered ? searchRows.slice(0, 2) : searchRows
  return {
    ...previewTraceSearchResult,
    rows, rowCount: rows.length,
    notice: 'CAP25 deterministic synthetic traces',
    execution: { provider: 'tempo', durationMs: 2, rowCount: rows.length },
  }
}
const span = (traceId, spanId, parentSpanId, service, name, start, duration, kind, extras = {}) => ({
  traceId, spanId, parentSpanId, service, serviceNamespace: 'cap25',
  name, startTimeMs: (traceId === ids.a ? origin : traceId === ids.b ? origin + 120000 : origin + 240000) + start,
  durationMs: duration, status: extras.status ?? 'OK', statusMessage: extras.statusMessage ?? '',
  kind, scopeName: 'cap25.synthetic',
  resourceAttributes: JSON.stringify({ 'service.name': service, 'service.namespace': 'cap25' }),
  attributes: JSON.stringify(extras.attributes ?? {}),
  events: JSON.stringify(extras.events ?? []),
  links: JSON.stringify([]),
})
const traces = {
  [ids.a]: [
    span(ids.a, spanIds.root, '', 'gateway', 'inbound request', 0, 10000, 'SERVER'),
    span(ids.a, spanIds.child, spanIds.root, 'checkout', 'authorize payment', 100, 900, 'CLIENT'),
    span(ids.a, spanIds.db, spanIds.child, 'database', 'SELECT account', 180, 80, 'CLIENT', {
      status: 'ERROR', statusMessage: 'Synthetic database timeout',
      attributes: { 'db.system': 'postgresql', 'db.operation.name': 'SELECT', 'example.long': 'detail '.repeat(36) },
      events: [{ name: 'exception', attributes: { 'exception.type': 'TimeoutError' } }],
    }),
    span(ids.a, spanIds.producer, spanIds.root, 'queue', 'publish work', 6500, 110, 'PRODUCER'),
    span(ids.a, spanIds.worker, spanIds.producer, 'worker', 'consume work', 6650, 160, 'CONSUMER'),
  ],
  [ids.b]: [
    span(ids.b, '00000000000000b1', '', 'gateway', 'inbound request', 0, 7000, 'SERVER'),
    span(ids.b, '00000000000000b2', '00000000000000b1', 'checkout', 'handle checkout', 200, 1500, 'CLIENT'),
    span(ids.b, '00000000000000b3', '00000000000000b2', 'cache', 'fetch cache', 400, 95, 'CLIENT'),
  ],
  [ids.c]: [
    span(ids.c, '00000000000000c1', '', 'legacy-only', 'retired request', 0, 8000, 'SERVER'),
    span(ids.c, '00000000000000c2', '00000000000000c1', 'retired', 'legacy dependency', 300, 200, 'CLIENT'),
  ],
  [ids.rootOnly]: [
    span(ids.rootOnly, '00000000000000d1', '', 'standalone', 'root only', 0, 100, 'SERVER'),
  ],
}
const graphExpected = {
  all: { traces: 3, nodes: 8, edges: 6 },
  filtered: { traces: 2, nodes: 6, edges: 5 },
}
const requests = []
const externalUrls = []

export function installAuditIpc(ipc) {
  requests.length = 0
  externalUrls.length = 0
  installBaseIpc(ipc)
  const handle = (channel, fn) => { ipc.removeHandler(channel); ipc.handle(channel, fn) }
  handle('query:run', (_event, connectionId, query, parameters, options) => {
    const id = String(query).trim().toLowerCase()
    const isTrace = /^[0-9a-f]{32}$/.test(id)
    const { progressRequestId: _progressRequestId, ...semanticOptions } = options ?? {}
    requests.push({ connectionId, query, parameters, options: semanticOptions, kind: isTrace ? 'trace' : 'search' })
    if (isTrace) {
      if (!traces[id]) return { ok: false, message: 'Synthetic CAP25 trace not found', kind: 'query' }
      return { ok: true, result: {
        ...previewTraceResult, rows: traces[id], rowCount: traces[id].length,
        execution: { provider: 'tempo', durationMs: 2, rowCount: traces[id].length },
      } }
    }
    return { ok: true, result: searchResult(id.includes('legacy-only'), id.includes('cap25-empty')) }
  })
  handle('external:open-url', (_event, url) => {
    externalUrls.push(url)
    return null
  })
}

export async function runVisualAudit({ win, outputDir, waitFor, capture, dragDivider }) {
  await mkdir(outputDir, { recursive: true })
  const observations = [], ledger = [], transitions = []
  const js = source => win.webContents.executeJavaScript(source).catch(error => {
    console.error('CAP25_EVAL_FAILED', source.slice(0, 400), error.message); throw error
  })
  const settle = () => js('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))')
  const waited = (source, label) => waitFor(win, source, label)
  const exists = selector => js('Boolean(document.querySelector(' + data(selector) + '))')
  const count = selector => js('document.querySelectorAll(' + data(selector) + ').length')
  const click = async selector => {
    await waited('document.querySelector(' + data(selector) + ')', selector)
    await js('document.querySelector(' + data(selector) + ').click()')
    await settle()
  }
  const button = async (label, selector = 'button') => {
    const target = '[...document.querySelectorAll(' + data(selector) + ')].find(b=>b.textContent.trim()===' + data(label) + ')'
    await waited(target, 'button: ' + label)
    await js(target + '.click()')
    await settle()
  }
  const run = async () => {
    const before = requests.length
    await click('[data-tempo-run-query]')
    await waited('!window.__datakoalaStore.getState().tabs[0].running', 'Tempo query completion')
    assert.ok(requests.length > before, 'Run must execute the synthetic IPC')
  }
  const frame = async (filename, description, targetSelector) => {
    await settle()
    const measure = await js('(() => {const e=document.querySelector(' + data(targetSelector) + '),r=e?.getBoundingClientRect();return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,target:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,visibleSpanIds:[...document.querySelectorAll("[data-span-id]")].map(x=>x.getAttribute("data-span-id")),selectedSpan:[...document.querySelectorAll("[data-span-id] button[aria-pressed=true]")].map(e=>e.closest("[data-span-id]")?.dataset.spanId),inspector:document.querySelector("[aria-label=\\"Selected span details\\"]")?.textContent?.slice(0,1800)??null,graph:{traces:document.querySelector("[data-trace-service-map]")?.getAttribute("data-visual-traces"),nodes:document.querySelector("[data-trace-service-map]")?.getAttribute("data-visual-nodes"),edges:document.querySelector("[data-trace-service-map]")?.getAttribute("data-visual-edges")},gapCount:document.querySelectorAll("[data-trace-idle-gap]").length,alerts:[...document.querySelectorAll("[role=alert]")].map(e=>e.textContent.trim()),bodyOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1}})()')
    assert.deepEqual([measure.width, measure.height, measure.dpr], [1440, 900, 1])
    measure.zoom = win.webContents.getZoomFactor()
    assert.equal(measure.zoom, 1)
    assert.ok(measure.target?.width > 0 && measure.target?.height > 0, filename + ': semantic target must be visible')
    observations.push({ filename, description, ...measure, requests: requests.length })
    await capture(win, filename)
  }
  const graphState = () => js('(() => {const m=document.querySelector("[data-trace-service-map]");return {traces:Number(m?.dataset.visualTraces),nodes:Number(m?.dataset.visualNodes),edges:Number(m?.dataset.visualEdges),finished:m?.dataset.visualFinished==="true",body:m?.textContent?.slice(0,1000)}})()')
  const graphMatches = async (expected, reason) => {
    await waited('document.querySelector("[data-trace-service-map]")?.dataset.visualFinished==="true"', reason + ': graph drawn')
    const observed = await graphState()
    assert.deepEqual([observed.traces, observed.nodes, observed.edges],
      [expected.traces, expected.nodes, expected.edges], reason + ': exact graph counts')
    return observed
  }
  const traceRequests = () => requests.filter(r => r.kind === 'trace')
  const sourceRequestCount = () => requests.length
  const assertNoRequest = (before, reason) => assert.equal(requests.length, before, reason)
  const visibleRows = () => js('[...document.querySelectorAll("[data-span-id]")].map(e=>e.dataset.spanId)')
  const selectSpan = async (id) => click('[data-span-id="' + id + '"] button[aria-pressed]')
  const expanded = async (id) => js('document.querySelector(' + data('[data-span-id="' + id + '"] button[aria-expanded]') + ')?.getAttribute("aria-expanded")')
  const inspectorText = () => js('document.querySelector("[aria-label=\\"Selected span details\\"]")?.innerText??""')

  win.show(); win.focus(); win.setContentSize(1440, 900); win.webContents.setZoomFactor(1)
  await js('(() => {const s=window.__datakoalaStore,t=JSON.parse(JSON.stringify(s.getState().tabs[0])),p=' + data(profile) + ';t.id="cap25";t.title="CAP-25 Tempo";t.connectionProfileId=p.id;t.queryMode="sql";t.sql="{ span:duration > 300ms }";t.result=null;t.queryError=null;t.running=false;t.tempoResultView="list";t.tempoTimeRange=' + data(auditRange) + ';t.tempoSampleSize="100";s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:"connected",generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:"loaded",error:null,isStale:false,revision:1}}})})()')
  await waited('document.querySelector("[aria-label=\\"Trace explorer\\"]")', 'Tempo renderer')
  const delta = await js('document.querySelector(".main").getBoundingClientRect().top+230-document.querySelector(".editor-resizer").getBoundingClientRect().top')
  if (Math.abs(delta)>1) await dragDivider(win, '.editor-resizer', 0, Math.round(delta))

  // Drive Run and service-map selection through real controls, not a synthetic React map mount.
  await run()
  await waited('document.querySelectorAll(\'button[class*="traceResult"]\').length===3', 'three search results')
  await button('Service map')
  const all = await graphMatches(graphExpected.all, 'original cohort')
  assert.deepEqual(traceRequests().map(r=>r.query).sort(), [ids.a,ids.b,ids.c].sort(), 'map separately fetches each full trace')
  ledger.push({ state:'unfiltered', searchIds:searchRows.map(r=>r.traceId), expected:graphExpected.all, observed:all, requests:requests.slice() })
  await button('List')
  assert.equal((await count('button[class*="traceResult"]')), 3, 'back to same list cohort')
  const priorLocal = sourceRequestCount()
  await button('Scatter')
  await button('List')
  assertNoRequest(priorLocal, 'List/Scatter switches cannot refetch provider')

  // Change the real query session's TraceQL, then Run using its visible toolbar.
  // The edit is a controlled store injection; the execution and view transition are native.
  await js('window.__datakoalaStore.getState().setSql(' + data('{ resource.service.name != "legacy-only" }') + ', "cap25")')
  await run()
  await waited('document.querySelectorAll(\'button[class*="traceResult"]\').length===2', 'filtered search results')
  await button('Service map')
  const filtered = await graphMatches(graphExpected.filtered, 'filtered cohort')
  const filteredTraceRequests = traceRequests().filter(r => [ids.a, ids.b].includes(r.query))
  assert.ok(filteredTraceRequests.length >= 2, 'two filtered full-trace summaries must be available')
  assert.equal((await graphState()).body.includes('legacy-only'), false, 'excluded legacy service cannot remain in graph')
  ledger.push({state:'query-filtered',predicate:'resource.service.name != "legacy-only"',searchIds:[ids.a,ids.b],excluded:[ids.c],expected:graphExpected.filtered,observed:filtered,requests:requests.slice()})
  await frame(screenshots[0], 'Filtered map: two analyzed traces; legacy-only and retired relationship absent', '[data-trace-service-map]')
  const mapBefore = sourceRequestCount()
  await button('List')
  assertNoRequest(mapBefore, 'returning from map to list is local')
  await click('button[class*="traceResult"]')
  await waited('document.querySelector(' + data('[data-span-id="' + spanIds.root + '"]') + ')', 'opened CAP25 trace root')
  assert.deepEqual((await visibleRows()).slice(0,3), [spanIds.root,spanIds.child,spanIds.db], 'visible deterministic hierarchy ordering')
  assert.equal((await count('[data-span-id]')), 3, 'async branches are hidden by default')
  assert.equal(traceRequests().at(-1).query, ids.a, 'opened trace retains exact selected identity')
  await frame(screenshots[1], 'Opened first trace, three visible hierarchy rows with async branches hidden', '[data-trace-waterfall]')

  // Expand/collapse, selected descendant identity and non-refetch must survive transitions.
  const stableBefore = sourceRequestCount()
  assert.equal(await expanded(spanIds.root), 'true')
  await click('[data-span-id="' + spanIds.root + '"] button[aria-expanded]')
  assert.equal(await expanded(spanIds.root), 'false')
  assert.deepEqual(await visibleRows(), [spanIds.root], 'collapsed descendants are hidden')
  await click('[data-span-id="' + spanIds.root + '"] button[aria-expanded]')
  assert.equal(await expanded(spanIds.root), 'true')
  assert.ok((await visibleRows()).includes(spanIds.db))
  await selectSpan(spanIds.db)
  await waited('document.querySelector("[aria-label=\\"Selected span details\\"]")', 'span inspector opened')
  assert.ok((await inspectorText()).includes(spanIds.db), 'inspector must show exact selected span ID')
  assert.ok((await inspectorText()).includes('Synthetic database timeout'), 'inspector must show status details')
  assert.ok((await inspectorText()).includes('exception'), 'inspector must show event details')
  await frame(screenshots[2], 'Selected nested database child: identity, status, attributes and event', '[aria-label="Selected span details"]')
  await click('[data-span-id="' + spanIds.root + '"] button[aria-expanded]')
  assert.deepEqual(await visibleRows(), [spanIds.root])
  assert.ok((await inspectorText()).includes(spanIds.db), 'collapsed selected child remains inspectable under current contract')
  await click('[data-span-id="' + spanIds.root + '"] button[aria-expanded]')
  assert.ok((await inspectorText()).includes(spanIds.db), 're-expansion does not replace span identity')
  await click('[aria-label^="Client "]')
  assert.equal(await exists('[aria-label="Selected span details"]'), false, 'hidden CLIENT kind hides current inspector')
  await button('Show all kinds')
  assert.ok((await inspectorText()).includes(spanIds.db), 'restoring visible kind restores selected inspector')
  await button('Show async branches')
  assert.ok((await visibleRows()).includes(spanIds.worker), 'async branch restores worker span')
  assert.equal(await count('[data-span-id]'), 5)
  const compressed = await count('[data-trace-idle-gap]')
  assert.ok(compressed > 0, 'known fixture idle gap must be marked when compression is enabled')
  await button('Use wall-clock scale')
  assert.equal(await count('[data-trace-idle-gap]'), 0, 'wall-clock scale removes visual gap compression')
  assert.ok((await inspectorText()).includes('80.0ms'), 'duration label must remain from source data')
  await button('Compress idle gaps')
  assert.ok((await count('[data-trace-idle-gap]')) > 0, 're-enabled compression marks idle gap')
  assertNoRequest(stableBefore, 'local hierarchy/kind/timeline/inspector interactions must not refetch')
  transitions.push({scenario:'hierarchy-hide-compression',root:spanIds.root,selectedSpan:spanIds.db,visible:await visibleRows(),compressedGapCount:compressed,wallClockGapCount:0,sourceDurationMs:80,providerRequestsAdded:0})
  await frame(screenshots[3], 'Expanded async hierarchy, compressed gaps and unchanged database inspector', '[data-trace-waterfall]')
  await click('[aria-label="Close span details"]')
  assert.equal(await exists('[aria-label="Selected span details"]'), false)
  await selectSpan(spanIds.child)
  assert.ok((await inspectorText()).includes(spanIds.child))
  transitions.push({scenario:'inspector-close-reopen',selectedSpan:spanIds.child})

  // The existing Grafana query handoff is toolbar-level, not span deep-link.
  const handoffBefore = sourceRequestCount()
  await click('[aria-label="Grafana handoff"]')
  await waited('[...document.querySelectorAll("[role=menuitem]")].some(b=>b.textContent.includes("Open in Grafana"))', 'Grafana handoff menu')
  await button('Open in Grafana ↗', '[role=menuitem]')
  assert.equal(externalUrls.length, 1)
  const handoff = new URL(externalUrls[0])
  assert.equal(handoff.origin, 'https://grafana.example.invalid', 'configured Grafana host')
  assert.equal(handoff.pathname, '/explore', 'Grafana Explore destination')
  assert.equal(handoff.searchParams.get('orgId'), '1', 'Grafana org context')
  const pane = JSON.parse(handoff.searchParams.get('panes')).datakoala
  assert.equal(pane.datasource, 'example-tempo', 'Grafana datasource UID')
  assert.equal(pane.queries[0].datasource.type, 'tempo', 'Grafana datasource type')
  assert.equal(pane.queries[0].queryType, 'traceql', 'Grafana query type')
  assert.equal(pane.queries[0].query, '{ resource.service.name != "legacy-only" }', 'exact active query')
  assert.deepEqual(pane.range, {
    from: String(Date.parse('2026-08-19T16:00:00.000Z')),
    to: String(Date.parse('2026-08-19T17:00:00.000Z')),
  }, 'Grafana epoch-millisecond UTC range')
  assertNoRequest(handoffBefore, 'Grafana handoff cannot mutate Tempo requests')
  transitions.push({scenario:'grafana-query-handoff',url:externalUrls[0],traceId:ids.a,spanId:spanIds.child,kind:'query-level-not-span-deep-link'})
  // Return to search and exercise an empty *search* (distinct from missing trace lookup).
  await button('← Search results')
  await js('window.__datakoalaStore.getState().setSql(' + data('{ span.name = "cap25-empty" }') + ', "cap25")')
  await run()
  await waited('!document.querySelector("button[class*=traceResult]")', 'empty trace search')
  assert.equal((await graphState()).traces || 0, 0, 'no stale graph after empty cohort')
  await frame(screenshots[4], 'Empty Tempo search cohort after real Run; no stale rows or service graph', '[aria-label="Trace explorer"]')
  ledger.push({state:'empty',predicate:'span.name = "cap25-empty"',searchIds:[],observedSearchRows:0,requests:requests.slice()})

  const sourceHead = process.env.DATAKOALA_AUDIT_HEAD
  assert.match(sourceHead ?? '', /^[0-9a-f]{40}$/, 'sourceHead must identify generating commit')
  await writeFile(resolve(outputDir,'measurements.json'), JSON.stringify({
    sourceHead,
    execution:'real Electron renderer + isolated deterministic Tempo IPC; no authenticated service',
    viewport:{width:1440,height:900,dpr:1,zoom:1},
    fixtures:{ids,spanIds,origin,searchRows,traces,graphExpected},
    requests,externalUrls,ledger,transitions,observations,
    limitations:[
      'Filtered TraceQL was set through the controlled session store; Run and result-view controls were clicked',
      'Provider data is synthetic, not live Tempo or Grafana',
      'One root-only trace and unavailable trace-detail lookup are fixture-defined but not separately opened',
      'Time-range brush and keyboard selection were not exercised',
    ],
  },null,2)+'\n')
  console.log('CAP25_OK '+JSON.stringify({sourceHead,screenshots:observations.map(o=>o.filename),providerRequests:requests.length}))
}
