/** CAP-30 isolated sharing audit: real renderer, deterministic synthetic IPC, no production changes. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { nativeImage } from 'electron'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles, auditRange, auditLogResult } from '../audit-fixtures.mjs'
import { previewTraceResult, previewTraceSearchResult } from '../trace-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'

export const screenshots = [
  'cap30-clipboard-query-success-desktop.png',
  'cap30-clipboard-query-error-desktop.png',
  'cap30-clipboard-log-success-desktop.png',
  'cap30-tempo-diagram-export-desktop.png',
  'cap30-postgres-plan-share-desktop.png',
]

const sql = "SELECT 'CAP30 O''Brien' AS \"quoted\"\nFROM \"example\".\"events\";"
const promql = 'sum(rate(http_requests_total{service="checkout"}[5m]))'
const logql = '{service_name="checkout"} |= "CAP30"'
const traceql = '{ resource.service.name = "checkout" }'
const from = '2026-08-19T16:00:00.000Z'
const to = '2026-08-19T17:00:00.000Z'
const traceId = '00000000000000000000000000000301'
const spanIds = { root: '0000000000000301', checkout: '0000000000000302', db: '0000000000000303' }
const logMessage = 'CAP30 raw message: quote "value", slash \\, and newline\nsecond line'
const logRaw = JSON.stringify({ message: logMessage, trace_id: traceId, span_id: spanIds.db })
const log = {
  id: 'cap30-log-1', timestampMs: Date.parse('2026-08-19T16:30:00.000Z'),
  timestampNs: String(BigInt(Date.parse('2026-08-19T16:30:00.000Z')) * 1000000n),
  line: logRaw, severity: 'ERROR', labels: { service_name: 'checkout' },
  structuredMetadata: { region: 'eu-west-1' }, parsedFields: { retry: 2 },
  traceId, spanId: spanIds.db,
}
const logs = { ...auditLogResult, rows: [log], logRows: [log], rowCount: 1 }
const origin = Date.parse('2026-08-19T16:20:00.000Z')
const span = (id, parentSpanId, service, name, startMs, durationMs) => ({
  traceId, spanId: id, parentSpanId, service, serviceNamespace: 'cap30', name,
  startTimeMs: origin + startMs, durationMs, status: 'OK', statusMessage: '',
  kind: parentSpanId ? 'CLIENT' : 'SERVER', scopeName: 'cap30.synthetic',
  resourceAttributes: JSON.stringify({ 'service.name': service, 'service.namespace': 'cap30' }),
  attributes: '{}', events: '[]', links: '[]',
})
const spans = [
  span(spanIds.root, '', 'gateway', 'request', 0, 10000),
  span(spanIds.checkout, spanIds.root, 'checkout', 'authorize', 200, 1200),
  span(spanIds.db, spanIds.checkout, 'database', 'SELECT', 400, 80),
]
const traces = {
  ...previewTraceSearchResult,
  rows: [{
    traceId, rootService: 'gateway', rootOperation: 'CAP30 synthetic request',
    startTimeMs: origin, durationMs: 10000, matchedSpans: 3, status: 'ok',
  }],
  rowCount: 1, notice: 'CAP30 controlled trace cohort',
  execution: { provider: 'tempo', durationMs: 2, rowCount: 1 },
}
const plan = {
  id: '0', plan: 'Hash Join', nodeType: 'Hash Join', planRows: 10,
  totalCost: 12, actualRows: 12, actualTotalTime: 3.2, loops: 1,
  children: [
    { id: '0.0', plan: 'Seq Scan', nodeType: 'Seq Scan', relation: 'events',
      schema: 'example', planRows: 10, totalCost: 4, actualRows: 12, actualTotalTime: 1, loops: 1 },
    { id: '0.1', plan: 'Index Scan', nodeType: 'Index Scan', relation: 'lookup',
      schema: 'example', index: 'lookup_pkey', planRows: 10, totalCost: 5,
      actualRows: 12, actualTotalTime: 1.4, loops: 1 },
  ],
}
const profiles = Object.fromEntries(['postgres', 'prometheus', 'loki', 'tempo'].map(kind => [kind, {
  ...auditProfiles[kind], grafana: {
    baseUrl: 'https://grafana.example.invalid',
    datasourceUid: 'cap30-' + kind, datasourceType: kind, orgId: 17,
  },
}]))
const requests = []
const external = []
const images = []
const scenes = []
const savedSvg = []

const pngInfo = value => {
  assert.match(value, /^data:image\/png;base64,/)
  const bytes = Buffer.from(value.slice(value.indexOf(',') + 1), 'base64')
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const image = nativeImage.createFromBuffer(bytes)
  const size = image.getSize()
  assert.ok(size.width > 20 && size.height > 20, 'copy image must have nonzero useful dimensions')
  assert.equal(image.isEmpty(), false, 'image must be decodable')
  const pixels = image.toBitmap()
  assert.ok(pixels.length > 1024, 'raster payload must include pixels')
  const colors = new Set()
  for (let i = 0; i < pixels.length; i += Math.max(4, Math.floor(pixels.length / 20000 / 4) * 4)) {
    colors.add(pixels.readUInt32LE(i - i % 4))
  }
  assert.ok(colors.size >= 3, 'service-map PNG cannot be a blank/flat image')
  return { width: size.width, height: size.height, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), sampledColors: colors.size }
}

export function installAuditIpc(ipc) {
  installBaseIpc(ipc)
  requests.length = 0; external.length = 0; images.length = 0; scenes.length = 0; savedSvg.length = 0
  const handle = (channel, fn) => { ipc.removeHandler(channel); ipc.handle(channel, fn) }
  handle('query:run', (_event, connectionId, query, parameters, options) => {
    requests.push({ kind: 'tempo', connectionId, query, parameters,
      options: { ...(options ?? {}), progressRequestId: undefined } })
    if (String(query).trim() === traceId) return { ok: true, result: {
      ...previewTraceResult, rows: spans, rowCount: spans.length,
      execution: { provider: 'tempo', durationMs: 2, rowCount: spans.length },
    } }
    return { ok: true, result: traces }
  })
  handle('query:run-loki', (_event, id, request) => {
    requests.push({ kind: 'loki', id, request })
    return logs
  })
  handle('external:open-url', (_event, url) => { external.push(url); return null })
  handle('clipboard:write-png', (_event, value) => {
    const info = pngInfo(value)
    images.push(info)
    return { ok: true }
  })
  handle('clipboard:write-excalidraw', (_event, value) => {
    const scene = JSON.parse(value)
    assert.equal(scene.type, 'excalidraw/clipboard')
    assert.ok(Array.isArray(scene.elements))
    scenes.push(scene)
    return { ok: true }
  })
  handle('export:save-text', (_event, value) => {
    savedSvg.push(value)
    return '/synthetic/cap30-service-map.svg'
  })
}

export async function runVisualAudit({ win, outputDir, waitFor, capture }) {
  await mkdir(outputDir, { recursive: true })
  const observations = [], matrix = [], grafana = [], diagrams = [], defects = []
  const js = code => win.webContents.executeJavaScript(code)
  const settle = () => js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
  const selector = value => 'document.querySelector(' + data(value) + ')'
  const click = async value => {
    await waitFor(win, selector(value), 'CAP30 control ' + value)
    await js(selector(value) + '.click()')
    await settle()
  }
  const button = async (name, scope = 'document') => {
    const root = scope === 'document' ? 'document' : selector(scope)
    const found = '[...' + root + '.querySelectorAll("button")].find(b=>b.textContent.trim()===' + data(name) + ')'
    await waitFor(win, found, 'CAP30 button ' + name)
    await js(found + '.click()')
    await settle()
  }
  const notifications = () => js('[...document.querySelectorAll("[role=alert],[role=status]")].map(x=>({role:x.getAttribute("role"),text:x.textContent.trim()})).filter(x=>x.text)')
  const copied = () => js('window.__cap30Clipboard.writes')
  const seed = async (kind, query, patch = {}) => {
    const p = profiles[kind]
    await js('(() => {const s=window.__datakoalaStore,t=JSON.parse(JSON.stringify(s.getState().tabs[0])),p=' + data(p) +
      ',q=' + data(query) + ',patch=' + data(patch) +
      ';Object.assign(t,{id:"cap30-"+p.kind,title:"CAP-30 "+p.kind,connectionProfileId:p.id,queryMode:"sql",sql:q,result:null,queryError:null,running:false,showExplain:false,explainTree:null,explainText:null,explainSnapshot:null,activeExplainRequest:null,tempoResultView:"list",lokiResultView:"list",tempoTimeRange:' + data(auditRange) + ',lokiTimeRange:' + data(auditRange) + ',prometheusTimeRange:' + data(auditRange) + '},patch);s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:"connected",generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:"loaded",error:null,isStale:false,revision:1}}})})()')
    await settle()
  }
  const frame = async (filename, target, description) => {
    await waitFor(win, selector(target) + '?.getBoundingClientRect().width>0', filename + ' target')
    await settle()
    const m = await js('(() => {const e=' + selector(target) +
      ',r=e.getBoundingClientRect();return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,target:{x:r.x,y:r.y,width:r.width,height:r.height},' +
      'alerts:[...document.querySelectorAll("[role=alert],[role=status]")].map(e=>e.textContent.trim()),' +
      'overflow:document.documentElement.scrollWidth>innerWidth+1}})()')
    assert.deepEqual([m.width,m.height,m.dpr],[1440,900,1])
    m.zoom = win.webContents.getZoomFactor()
    assert.equal(m.zoom,1)
    observations.push({ filename, description, ...m, providerRequests:requests.length })
    await capture(win, filename)
  }
  const installClipboard = () => js('(() => {window.__cap30Clipboard={writes:[],fail:false,completed:0,rejected:0};window.__cap30Unhandled=[];window.addEventListener("unhandledrejection",e=>{if(String(e.reason).includes("CAP30 clipboard denied")){window.__cap30Unhandled.push(String(e.reason));e.preventDefault()}});Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText(value){const c=window.__cap30Clipboard;c.writes.push(value);if(c.fail){c.rejected++;return Promise.reject(Error("CAP30 clipboard denied"))}c.completed++;return Promise.resolve()}}})})()')
  const verifyCopy = async ({ surface, action, expected, label, fail = false, captureName, target }) => {
    await js('window.__cap30Clipboard.fail=' + (fail ? 'true' : 'false'))
    const previous = (await copied()).length
    const before = requests.length
    if (action.startsWith('[')) await click(action)
    else await button(action)
    await waitFor(win,'window.__cap30Clipboard.writes.length===' + (previous + 1), surface + ' intercepted clipboard')
    await settle()
    const payloads = await copied()
    assert.equal(payloads.at(-1), expected, surface + ': clipboard exact-byte text equality')
    const feedback = await notifications()
    if (fail) {
      await waitFor(win,'[...document.querySelectorAll("[role=alert]")].some(x=>x.textContent.includes("CAP30 clipboard denied"))', surface + ' failure feedback')
      assert.ok((await notifications()).some(x=>x.role==='alert' && x.text.includes('CAP30 clipboard denied')))
    } else if (label) {
      await waitFor(win,'document.body.innerText.includes(' + data(label) + ')', surface + ' success feedback')
    }
    assert.equal(requests.length,before,surface + ': copy cannot execute provider request')
    const entry = { surface, action, type:'text/plain', expected, actual:payloads.at(-1),
      bytes:Buffer.byteLength(expected), rejected:fail, invocation:previous+1,
      completion: !fail, feedback:await notifications(), providerDelta:0,
      unhandled:await js('window.__cap30Unhandled') }
    matrix.push(entry)
    if (captureName) await frame(captureName,target,surface + (fail ? ' rejected clipboard' : ' successful clipboard'))
    return entry
  }
  const testGrafana = async (kind, query) => {
    const before = requests.length
    const beforeExternal = external.length
    await click('[aria-label="Grafana handoff"]')
    await button('Open in Grafana ↗','[role=menu]')
    assert.equal(external.length,beforeExternal+1,kind + ' external open intercepted')
    const url = new URL(external.at(-1))
    assert.equal(url.origin,'https://grafana.example.invalid')
    assert.equal(url.pathname,'/explore')
    assert.equal(url.searchParams.get('orgId'),'17')
    assert.equal(url.searchParams.get('schemaVersion'),'1')
    const pane = JSON.parse(url.searchParams.get('panes')).datakoala
    assert.equal(pane.datasource,'cap30-'+kind)
    assert.equal(pane.queries[0].datasource.uid,'cap30-'+kind)
    assert.equal(pane.queries[0].datasource.type,kind)
    assert.equal(pane.queries[0].refId,'A')
    assert.equal(pane.queries[0][kind==='tempo'?'query':'expr'],query)
    if (kind==='tempo') assert.equal(pane.queries[0].queryType,'traceql')
    if (kind==='loki') assert.equal(pane.queries[0].queryType,'range')
    assert.deepEqual(pane.range,{from:String(Date.parse(from)),to:String(Date.parse(to))})
    assert.equal(requests.length,before,'Grafana handoff must not query provider')
    await click('[aria-label="Grafana handoff"]')
    await button('Copy Grafana link','[role=menu]')
    await waitFor(win,'window.__cap30Clipboard.writes.at(-1)===' + data(url.href),'Grafana exact copied URL')
    assert.equal(requests.length,before)
    grafana.push({kind,query,orgId:17,datasource:'cap30-'+kind,
      path:url.pathname,range:pane.range,params:Object.fromEntries(url.searchParams.entries()),
      exactCopiedUrl:true,externalOpened:false,providerDelta:0,
      authenticatedGrafana:'not tested'})
  }

  win.show();win.focus();win.setContentSize(1440,900);win.webContents.setZoomFactor(1)
  await installClipboard()

  await seed('postgres',sql)
  await waitFor(win,'document.querySelector("[aria-label=\\"SQL editor\\"]")','PG editor')
  assert.equal(await js('window.__datakoalaStore.getState().tabs[0].sql'),sql)
  await verifyCopy({surface:'PostgreSQL raw SQL',action:'[aria-label="Copy SQL to clipboard"]',expected:sql,
    label:'Copied to clipboard',captureName:screenshots[0],target:'[data-query-toolbar]'})
  await verifyCopy({surface:'PostgreSQL rejected clipboard',action:'[aria-label="Copy SQL to clipboard"]',
    expected:sql,fail:true,captureName:screenshots[1],target:'[role=alert]'})
  const denied = matrix.at(-1)
  assert.equal(denied.unhandled.length,0,'handled query-copy rejection cannot escape')
  await verifyCopy({surface:'PostgreSQL clipboard recovery',action:'[aria-label="Copy SQL to clipboard"]',
    expected:sql,label:'Copied to clipboard'})
  assert.ok(!(await notifications()).some(n=>n.role==='alert' && n.text.includes('CAP30 clipboard denied')),
    'successful retry must dismiss prior error')
  defects.push({id:'VC30-01',classification:'ALREADY_CONVERGED',scope:'SQL clipboard rejection/retry',
    result:'Rejected query copy shows error and retry succeeds with identical payload'})

  await seed('prometheus',promql)
  await waitFor(win, `document.querySelector('[data-query-toolbar] [aria-label="Copy PromQL to clipboard"]')`, 'PromQL Copy label')
  assert.equal(await js(`document.querySelector('[data-query-toolbar] [aria-label="Copy SQL to clipboard"]')`),null)
  await verifyCopy({surface:'PromQL raw query',action:'[data-query-toolbar] [aria-label="Copy PromQL to clipboard"]',
    expected:promql,label:'Copied to clipboard'})
  defects.push({id:'VC30-02',classification:'FIXED_REGRESSION',scope:'X06/V-08',
    result:'PromQL query copies exactly and accessible action announces PromQL'})
  await testGrafana('prometheus',promql)

  await seed('loki',logql,{result:logs,resultRevision:1})
  await waitFor(win, 'document.querySelector("[aria-label=\\"Log results\\"] article")', 'Loki synthetic log row')
  const logCopyAction = await js('[...document.querySelectorAll("[data-query-toolbar] button")].find(b=>b.getAttribute("aria-label")?.includes("Copy"))?.getAttribute("aria-label")')
  assert.ok(logCopyAction,'Loki query copy control is present')
  await verifyCopy({surface:'LogQL raw query',action:'[aria-label="'+logCopyAction+'"]',
    expected:logql,label:'Copied to clipboard'})
  await click('[aria-label="Log results"] article button')
  await waitFor(win,'document.querySelector("[aria-label=\\"Selected log details\\"]")','Loki inspector')
  for (const [name,payload] of [['Copy message',logMessage],['Copy raw log',logRaw],
    ['Copy Trace ID',traceId],['Copy Span ID',spanIds.db],['Copy region','eu-west-1'],['Copy retry','2']]) {
    await verifyCopy({surface:'Loki '+name,action:'[aria-label="'+name+'"]',expected:payload})
  }
  await frame(screenshots[2],'[aria-label="Selected log details"]',
    'Actual inspector and exact message, raw, trace, span and field copies')
  const beforeRejected = (await copied()).length
  await js('window.__cap30Clipboard.fail=true')
  await click('[aria-label="Copy raw log"]')
  await waitFor(win,'window.__cap30Clipboard.writes.length==='+(beforeRejected+1),'Loki denial invocation')
  await waitFor(win,`[...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('Try Copy again'))`,'Loki copy denial feedback')
  assert.equal((await copied()).at(-1),logRaw)
  const rejectionFeedback = await notifications()
  assert.equal(rejectionFeedback.length,1,'one actionable clipboard error')
  assert.match(rejectionFeedback[0].text,/Could not copy.*Try Copy again/)
  const rejectedCount = await js('window.__cap30Unhandled.length')
  assert.equal(rejectedCount,0,'clipboard rejection must not escape')
  matrix.push({surface:'Loki raw rejection',type:'text/plain',expected:logRaw,
    actual:(await copied()).at(-1),rejected:true,completion:false,
    feedback:await notifications(),unhandled:rejectedCount,
    providerDelta:0,knownDefect:false})
  await js('window.__cap30Clipboard.fail=false')
  await click('[aria-label="Copy raw log"]')
  await waitFor(win,'window.__cap30Clipboard.writes.length==='+(beforeRejected+2),'Loki retry')
  assert.equal((await copied()).at(-1),logRaw)
  await waitFor(win,`document.querySelector('[role=status]')?.textContent.includes('Copied to clipboard')`,'Loki successful retry feedback')
  assert.equal(await js(`document.querySelectorAll('[role=alert]').length`),0)
  assert.ok(await js(`document.querySelector('[aria-label="Selected log details"]') !== null`), 'copy failure/retry preserves selected inspector')
  assert.equal(requests.length,0,'Loki copying must not refetch')
  matrix.push({surface:'Loki raw retry',type:'text/plain',expected:logRaw,
    actual:(await copied()).at(-1),rejected:false,completion:true,feedback:await notifications(),
    unhandled:await js('window.__cap30Unhandled.length'),providerDelta:0})
  defects.push({id:'VC30-03',classification:'FIXED_REGRESSION',scope:'X10/V-07',
    result:'Loki clipboard denial shows one actionable error without unhandled rejection; retry writes exact text, no provider refetch'})
  await testGrafana('loki',logql)

  await seed('tempo',traceql)
  await waitFor(win,'document.querySelector("[data-tempo-run-query]")','Tempo controls')
  const tempoQueryCopy = await js('[...document.querySelectorAll("[data-query-toolbar] button")].find(b=>b.getAttribute("aria-label")?.includes("Copy"))?.getAttribute("aria-label")')
  assert.ok(tempoQueryCopy,'TraceQL query copy must be present')
  await verifyCopy({surface:'TraceQL raw query',action:'[aria-label="'+tempoQueryCopy+'"]',expected:traceql,
    label:'Copied to clipboard'})
  await testGrafana('tempo',traceql)
  await click('[data-tempo-run-query]')
  await waitFor(win,'!window.__datakoalaStore.getState().tabs[0].running','Tempo synthetic Run')
  await waitFor(win,'document.querySelectorAll("button[class*=traceResult]").length===1','Tempo one trace')
  await button('Service map')
  await waitFor(win,'document.querySelector("[data-trace-service-map]")?.dataset.visualFinished==="true"','Tempo graph ready')
  const graph = await js('(() => {const e=document.querySelector("[data-trace-service-map]");return {nodes:Number(e.dataset.visualNodes),edges:Number(e.dataset.visualEdges),traces:Number(e.dataset.visualTraces),svgText:e.querySelector("[data-joint-service-map] svg")?.textContent ?? ""}})()')
  assert.deepEqual([graph.traces,graph.nodes,graph.edges],[1,3,2])
  for(const service of ['gateway','checkout','database']) assert.ok(graph.svgText.includes(service),'visible graph node '+service)
  const mapBefore = requests.length
  await button('Copy image','[data-trace-service-map]')
  await waitFor(win,'document.body.innerText.includes("Image copied to clipboard")','PNG copy feedback')
  assert.equal(images.length,1,'one IPC image copy')
  assert.equal(requests.length,mapBefore,'PNG copy cannot refetch')
  await button('Copy for Excalidraw','[data-trace-service-map]')
  await waitFor(win,'document.body.innerText.includes("Diagram copied to clipboard for Excalidraw")','Excalidraw copy feedback')
  assert.equal(scenes.length,1)
  const scene = scenes[0]
  const sceneText = JSON.stringify(scene.elements)
  for(const service of ['gateway','checkout','database']) assert.ok(sceneText.includes(service),'exported graph node '+service)
  assert.ok(scene.elements.length >= 5,'three service nodes and two edges must be exported')
  await button('Export SVG','[data-trace-service-map]')
  assert.equal(savedSvg.length,1,'one SVG IPC export')
  for (const service of ['gateway','checkout','database'])
    assert.ok(savedSvg[0].content.includes(service),'SVG must retain '+service)
  assert.equal(requests.length,mapBefore,'diagram sharing cannot refetch')
  await frame(screenshots[3],'[data-trace-service-map]',
    'Three-node/two-edge current Tempo service map with image, SVG and Excalidraw copies')
  diagrams.push({source:'Tempo service map',png:images[0],excalidraw:{
    type:scene.type,elements:scene.elements.length,serviceLabels:['gateway','checkout','database'],
    exactGraph:true},svg:{present:true,containsServiceLabels:true},providerDelta:0,
    nativeOsClipboard:'not tested'})
  defects.push({id:'VC30-04',classification:'INTENTIONAL_DIFFERENCE',scope:'X12/UX-20',
    result:'Tempo graph supports raster PNG, SVG and structured Excalidraw graph sharing'})

  await seed('postgres',sql,{showExplain:true,explainText:'CAP30 synthetic text plan',
    explainTree:plan,explainSnapshot:{mode:'explain',query:sql,planningTimeMs:0.6},
    activeExplainRequest:null})
  await waitFor(win,'document.querySelector("[aria-label=\\"Explain results\\"]")','Postgres plan')
  await waitFor(win,'document.querySelector("[aria-label=\\"Execution plan diagram\\"]")?.getAttribute("data-node-count")==="3"','Postgres three-node plan')
  await button('Copy plan JSON','[aria-label="Explain results"]')
  await waitFor(win,'document.body.innerText.includes("Plan JSON copied")','Postgres JSON feedback')
  const jsonPayload = (await copied()).at(-1)
  const parsed = JSON.parse(jsonPayload)
  assert.deepEqual(parsed,plan,'plan clipboard JSON must match current tree exactly')
  assert.equal(jsonPayload,JSON.stringify(plan,null,2),'plan JSON formatting and identity')
  await button('Copy text plan','[aria-label="Explain results"]')
  await waitFor(win,'document.body.innerText.includes("Text plan copied")','Postgres text feedback')
  assert.equal((await copied()).at(-1),'CAP30 synthetic text plan')
  await frame(screenshots[4],'[aria-label="Explain results"]',
    'Postgres plan root and child graph, JSON/text clipboard actions')
  diagrams.push({source:'PostgreSQL EXPLAIN plan',jsonExact:true,root:parsed.id,
    children:parsed.children.map(x=>x.id),textPlanExact:true,format:'structured tree JSON, not image export',
    providerDelta:0,nativeOsClipboard:'not tested'})
  assert.equal(requests.length,mapBefore,'Postgres plan copying cannot rerun SQL')
  defects.push({id:'VC30-05',classification:'INTENTIONAL_DIFFERENCE',scope:'C06/X12/UX-20',
    result:'PostgreSQL plan graph uses textual plan/JSON copy, not service-map PNG/Excalidraw actions'})

  const sourceHead = process.env.DATAKOALA_AUDIT_HEAD
  assert.match(sourceHead ?? '',/^[a-f0-9]{40}$/)
  await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({
    sourceHead,viewport:{width:1440,height:900,dpr:1,zoom:1},
    execution:'real Electron renderer, isolated deterministic IPC, intercepted synthetic clipboard and navigation',
    fixtures:{sql,promql,logql,traceql,logMessage,logRaw,traceId,spanIds,from,to,plan},
    requests,external,grafana,clipboardMatrix:matrix,diagrams,defects,observations,
    limitations:['Native OS pasteboard and authenticated Grafana not exercised',
      'Loki clipboard denial and retry assert positive recovery; OS pasteboard remains separate',
      'Tempo PNG bytes are decoded and sampled, but no external image paste performed',
      'PostgreSQL plan session seeded deterministically, not generated by executing EXPLAIN',
      'Only current raw-query copy contracts and one absolute UTC range tested'],
  },null,2)+'\n')
  console.log('CAP30_OK '+JSON.stringify({sourceHead,screenshots:observations.map(x=>x.filename),
    clipboardWrites:matrix.length,grafana:grafana.length,diagrams:diagrams.length,providerRequests:requests.length}))
}
