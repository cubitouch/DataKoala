/** CAP-22: isolated Tempo Builder characterization in the real Electron renderer. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles, auditRange, auditTraceResult } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'

export const screenshots = [
  'cap22-tempo-builder-default-desktop.png',
  'cap22-tempo-selector-options-desktop.png',
  'cap22-tempo-builder-filters-desktop.png',
  'cap22-tempo-builder-http-desktop.png',
  'cap22-tempo-builder-rpc-desktop.png',
]

const requests = []
const metadataCalls = []
const services = [
  { name: 'checkout-api', namespace: 'payments' },
  { name: 'invoice-api', namespace: 'payments' },
  { name: 'gateway', namespace: 'platform' },
  { name: 'worker', namespace: 'platform' },
]
const schema = (items = services) => [{
  name: 'tempo', isSystem: false,
  relations: items.map((item) => ({
    schema: 'tempo', name: item.name,
    qualifiedName: 'tempo.' + item.namespace + '.' + item.name,
    kind: 'service', columnsStatus: 'loaded', columns: [],
    details: { kind: 'service', serviceNamespace: item.namespace },
  })),
}]
const attributes = [
  { scope: 'span', name: 'http.status_code', traceql: 'span.http.status_code' },
  { scope: 'resource', name: 'cloud.region', traceql: 'resource.cloud.region' },
  { scope: 'span', name: 'rpc.method', traceql: 'span.rpc.method' },
]
export function installAuditIpc(ipc) {
  requests.length = 0
  metadataCalls.length = 0
  installBaseIpc(ipc)
  const handle = (name, fn) => { ipc.removeHandler(name); ipc.handle(name, fn) }
  handle('connections:tempo:attributes', (_event, id, query) => {
    metadataCalls.push({ type: 'attributes', id, query: query ?? null })
    return attributes
  })
  handle('connections:tempo:attribute-values', (_event, id, attribute, query) => {
    metadataCalls.push({ type: 'values', id, attribute, query: query ?? null })
    return attribute === 'span.http.status_code' ? ['200', '404', '503']
      : attribute === 'resource.cloud.region' ? ['eu-west-1', 'us-east-1']
      : ['Checkout', 'Refund']
  })
  handle('query:run', (_event, id, query, parameters, options) => {
    requests.push({ id, query, parameters, options })
    return { ok: true, result: auditTraceResult }
  })
}

const normalized = (value) => value.replace(/\\s+/g, ' ').trim()
const q = (value) => JSON.stringify(value.trim())
const equals = (field, value) => field + ' = ' + q(value)
const either = (fields, value) =>
  '(' + fields.map((field) => equals(field, value)).join(' || ') + ')'
const wrap = (conditions) => '{ ' + conditions.join(' && ') + ' }'

export async function runVisualAudit({ win, outputDir, waitFor, capture }) {
  await mkdir(outputDir, { recursive: true })
  const observations = [], interactions = [], generation = []
  const evalJs = (expr) => win.webContents.executeJavaScript(expr)
  const settle = () => evalJs('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))')
  const tab = () => evalJs('window.__datakoalaStore.getState().tabs[0]')
  const state = async () => (await tab()).tempoBuilder
  const assertNoRun = (prior, reason) => assert.equal(requests.length, prior, reason)
  const click = async (selector) => {
    await waitFor(win, 'document.querySelector(' + data(selector) + ')', selector)
    await evalJs('document.querySelector(' + data(selector) + ').click()')
    await settle()
  }
  const button = async (label, scope = 'document') => {
    const expr = '[...' + scope + '.querySelectorAll("button")].find(e => e.textContent.trim() === ' + data(label) + ')'
    await waitFor(win, expr, label)
    await evalJs(expr + '.click()')
    await settle()
  }
  const key = async (keyCode) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
    await settle()
  }
  const input = async (label, value) => {
    await evalJs('(() => {const l=[...document.querySelectorAll("label")].find(e=>e.textContent.trim()===' + data(label) + ');const e=document.getElementById(l?.htmlFor);if(!(e instanceof HTMLInputElement))throw Error("Missing input: " + ' + data(label) + ');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,' + data(value) + ');e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));})()')
    await settle()
  }
  const combo = async (label) => {
    const expr = '[...document.querySelectorAll("[role=combobox]")].find(e=>e.getAttribute("aria-label")?.startsWith(' + data(label + ':') + '))'
    await waitFor(win, expr, label + ' combobox')
    await evalJs(expr + '.click()')
    await waitFor(win, 'document.querySelector("[role=listbox]")', label + ' options')
    await settle()
  }
  const option = async (label) => {
    const expr = '[...document.querySelectorAll("[role=option]")].find(e=>e.querySelector("[data-combobox-option-label]")?.textContent.trim()===' + data(label) + ')'
    await waitFor(win, expr, label + ' option')
    await evalJs(expr + '.click()')
    await settle()
  }
  const choose = async (label, value) => {
    await combo(label)
    await option(value)
    await settle()
  }
  const rendered = () => evalJs('document.querySelector(' + data('[aria-label="Generated TraceQL query"] .cm-content') + ')?.innerText.trim() ?? ""')
  const exact = async (expected, context) => {
    await waitFor(win, 'Boolean(document.querySelector(' + data('[aria-label="Generated TraceQL query"] .cm-content') + '))', 'visible Generated TraceQL')
    const actual = await rendered()
    assert.equal(normalized(actual), normalized(expected), context + ' generated TraceQL')
    generation.push({ context, expected, observed: actual, exactAfterWhitespaceNormalization: true })
    return actual
  }
  const save = async (filename, description) => {
    await settle()
    const report = await evalJs('(() => {const e=document.querySelector(' + data('[aria-label="Trace explorer"]') + '),r=e.getBoundingClientRect(),b=document.querySelector("[data-tempo-builder]");return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,target:{x:r.x,y:r.y,width:r.width,height:r.height},documentOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,builderOverflow:b ? b.scrollWidth>b.clientWidth+1 : null,controls:[...document.querySelectorAll("[data-tempo-builder-row]")].map(r=>({kind:r.dataset.tempoBuilderRow,labels:[...r.querySelectorAll("label")].map(x=>x.textContent.trim())})),openedListbox:document.querySelector("[role=listbox]")?.textContent?.trim()??null}})()')
    assert.deepEqual([report.width, report.height, report.dpr], [1440, 900, 1])
    report.zoom = win.webContents.getZoomFactor()
    assert.equal(report.zoom, 1)
    assert.ok(report.target.width > 0 && report.target.height > 0)
    assert.equal(report.documentOverflow, false, filename + ' viewport overflow')
    observations.push({ filename, description, ...report, builder: await state(), query: await rendered(), dispatchCount: requests.length })
    await capture(win, filename)
  }
  win.show(); win.focus(); win.setContentSize(1440, 900); win.webContents.setZoomFactor(1)
  await evalJs('(() => {const s=window.__datakoalaStore,p=' + data(auditProfiles.tempo) + ',t=JSON.parse(JSON.stringify(s.getState().tabs[0]));t.id="cap22";t.title="CAP-22 Tempo";t.connectionProfileId=p.id;t.queryMode="builder";t.sql="{ span:name = \\"raw-only\\" }";t.result=null;t.queryError=null;t.running=false;t.tempoResultView="list";t.tempoSampleSize="100";t.tempoTimeRange=' + data(auditRange) + ';t.tempoBuilder={serviceNamespace:"",service:"",spanKind:"any",protocol:"any",httpMethod:"",endpoint:"",rpcSystem:"",rpcService:"",rpcMethod:"",messagingSystem:"",messagingDestination:"",messagingOperation:"",dbSystem:"",dbOperation:"",spanName:"",advancedFilters:[],status:"any",minDurationMs:""};s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:"connected",generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:' + data(schema()) + ',status:"loaded",error:null,isStale:false,revision:1}}})})()')
  await waitFor(win, 'document.querySelector("[data-tempo-builder]")', 'Tempo Builder mounted')
  await click('[data-generated-query-panel] summary')
  await exact('{ span:duration > 300ms }', 'default')
  assertNoRun(0, 'Builder initialization must not run searches')
  await save(screenshots[0], 'Populated synthetic Tempo metadata; default Builder query without dispatch')

  await choose('Namespace', 'payments')
  assert.equal((await state()).serviceNamespace, 'payments')
  await combo('Service')
  const available = await evalJs('[...document.querySelectorAll("[role=option] [data-combobox-option-label]")].map(e=>e.textContent.trim())')
  assert.ok(available.includes('checkout-api') && available.includes('invoice-api'))
  assert.ok(!available.includes('gateway') && !available.includes('worker'))
  await evalJs('(() => {const e=document.querySelector("[role=listbox] input");if(!e)throw Error("Service search input absent");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,"checkout");e.dispatchEvent(new Event("input",{bubbles:true}));})()')
  await waitFor(win, '[...document.querySelectorAll("[role=option] [data-combobox-option-label]")].some(e=>e.textContent.trim()==="checkout-api")', 'filtered checkout option')
  const filtered = await evalJs('[...document.querySelectorAll("[role=option] [data-combobox-option-label]")].map(e=>e.textContent.trim())')
  assert.deepEqual(filtered, ['checkout-api'])
  await save(screenshots[1], 'Real Service combobox filtered within the selected namespace')
  await key('Enter')
  await waitFor(win, 'window.__datakoalaStore.getState().tabs[0].tempoBuilder.service==="checkout-api"', 'keyboard commits service')
  assertNoRun(0, 'Selector navigation cannot execute a trace search')
  await exact(wrap([equals('resource.service.namespace','payments'),equals('resource.service.name','checkout-api'),'span:duration > 300ms']), 'namespace + service')
  interactions.push({ scenario: 'selector', available, filtered, keyboardEnterSelected: (await state()).service, queryRequests: requests.length })

  await choose('Span kind', 'Server')
  await choose('Status', 'Error')
  await input('Min duration (ms)', '450')
  await click('[data-collapsible-title="Advanced filters"] summary')
  await choose('Attributes', 'span.http.status_code')
  await key('Escape')
  await choose('span.http.status_code match mode', 'Greater than (>)')
  await input('span.http.status_code value', '499')
  const escapedSpan = 'POST /checkout "priority"'
  await input('Exact span / operation name', escapedSpan)
  const base = [
    equals('resource.service.namespace', 'payments'),
    equals('resource.service.name', 'checkout-api'),
    'span:kind = server',
  ]
  const tail = [
    equals('span:name', escapedSpan), 'span.http.status_code > 499',
    'span:status = error', 'span:duration > 450ms',
  ]
  await exact(wrap([...base, ...tail]), 'span/status/duration/advanced')
  assertNoRun(0, 'Filter edits must not auto-run')
  await save(screenshots[2], 'Real span kind/status/duration/advanced-attribute controls and escaped span name')

  await choose('Protocol or subsystem', 'HTTP / network')
  assert.equal((await state()).protocol, 'http')
  assert.equal(await evalJs('document.querySelector(' + data('[data-tempo-builder] input[placeholder="CartService"]') + ') !== null'), false)
  await choose('HTTP method', 'POST')
  const endpoint = '/checkout/"priority"'
  await input('Route / endpoint', endpoint)
  const http = [
    ...base, either(['span.http.request.method', 'span.http.method'], 'POST'),
    either(['span.http.route','span.url.template','span.url.path','span.http.target'], endpoint),
    ...tail,
  ]
  const httpQuery = await exact(wrap(http), 'HTTP method and route')
  assertNoRun(0, 'HTTP edits must not auto-run')
  await save(screenshots[3], 'HTTP-only controls visible; RPC-only controls absent')
  await click('[data-tempo-run-query]')
  await waitFor(win, '!window.__datakoalaStore.getState().tabs[0].running', 'HTTP query settled')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].id, auditProfiles.tempo.id)
  assert.equal(requests[0].query, httpQuery, 'Dispatched query must exactly match the visible generated TraceQL')
  assert.deepEqual(requests[0].parameters, [])
  assert.equal(requests[0].options.start, '2026-08-19T16:00:00.000Z')
  assert.equal(requests[0].options.end, '2026-08-19T17:00:00.000Z')
  assert.equal(requests[0].options.sampleSize, 100)

  await choose('Protocol or subsystem', 'RPC / gRPC')
  assert.equal(await evalJs('document.querySelector(' + data('[data-tempo-builder] input[placeholder="/checkout/{id}"]') + ') !== null'), false)
  await choose('RPC system', 'gRPC')
  await input('RPC service', 'Billing "V2"')
  await input('RPC method', 'Charge\\Card')
  const rpc = [
    ...base,
    equals('span.rpc.system', 'grpc'),
    equals('span.rpc.service', 'Billing "V2"'),
    equals('span.rpc.method', 'Charge\\Card'),
    ...tail,
  ]
  const rpcQuery = await exact(wrap(rpc), 'RPC system/service/method')
  assert.ok(!rpcQuery.includes('span.http.request.method') && !rpcQuery.includes('span.http.route'))
  assert.equal((await state()).httpMethod, 'POST', 'Inactive HTTP state is retained by existing contract')
  assertNoRun(1, 'Protocol switch must not auto-run')
  await save(screenshots[4], 'RPC controls replace HTTP controls; generated query excludes inactive HTTP detail fields')
  await click('[data-tempo-run-query]')
  await waitFor(win, '!window.__datakoalaStore.getState().tabs[0].running', 'RPC query settled')
  assert.equal(requests.length, 2)
  assert.equal(requests[1].query, rpcQuery)
  interactions.push({ scenario:'protocol', hiddenHttpPredicates:true, retainedInactiveHttpState:true, http:requests[0], rpc:requests[1] })

  await input('RPC method', '')
  assert.ok(!(await rendered()).includes('span.rpc.method'))
  assertNoRun(2, 'Clearing RPC field is editing only')

  const builderBeforeMode = await state()
  const generatedBeforeMode = await rendered()
  await button('Open in TraceQL mode')
  assert.equal((await tab()).queryMode, 'sql')
  assert.equal((await tab()).sql, generatedBeforeMode)
  assertNoRun(2, 'Opening raw mode may not execute')
  await evalJs('window.__datakoalaStore.getState().setSql("{ not valid TraceQL ??? }", "cap22")')
  assert.equal((await tab()).queryMode, 'sql')
  await button('Builder', 'document.querySelector(' + data('[aria-label="Query mode"]') + ')')
  assert.deepEqual(await state(), builderBeforeMode, 'Raw arbitrary predicates may not mutate Builder state')
  assertNoRun(2, 'Mode transition may not execute')
  interactions.push({ scenario:'raw-mode', generatedDraftCopied:true, arbitraryRawNotImported:true, runDelta:0, rawChangeSetup:'store injection; editor typing not asserted' })

  // This is an observed, not pre-judged boundary: negative duration is a
  // technically invalid number-input value yet the Builder can still dispatch.
  await input('Min duration (ms)', '-1')
  assert.equal((await state()).minDurationMs, '-1')
  const invalidGenerated = await rendered()
  assert.ok(!invalidGenerated.includes('span:duration'), 'Invalid duration silently omits its predicate')
  const priorInvalid = requests.length
  await click('[data-tempo-run-query]')
  await waitFor(win, '!window.__datakoalaStore.getState().tabs[0].running', 'invalid duration dispatched/settled')
  assert.equal(requests.length, priorInvalid + 1)
  assert.equal(requests.at(-1).query, invalidGenerated)
  interactions.push({ scenario:'negative-duration', input:'-1', omittedDuration:true, stillDispatched:true, disposition:'CONFIRMED_DEFECT', dispatchDelta:1 })

  // Metadata replacement is deterministic state injection, NOT evidence of
  // a real provider refresh or stale-response arbitration.
  const selected = (await state()).service
  await evalJs('(() => {const s=window.__datakoalaStore,p=' + data(auditProfiles.tempo.id) + ',old=s.getState().metadataByProfileId[p];s.setState({metadataByProfileId:{...s.getState().metadataByProfileId,[p]:{...old,status:"loading",refreshing:true,revision:2}}})})()')
  assert.equal((await state()).service, selected)
  await evalJs('(() => {const s=window.__datakoalaStore,p=' + data(auditProfiles.tempo.id) + ',old=s.getState().metadataByProfileId[p];s.setState({metadataByProfileId:{...s.getState().metadataByProfileId,[p]:{...old,schemas:' + data(schema([{name:'gateway',namespace:'platform'}])) + ',status:"loaded",refreshing:false,error:null,revision:3}}})})()')
  assert.equal((await state()).service, selected)
  interactions.push({ scenario:'metadata-state-replacement', priorService:selected, retained:true, setup:'direct store injection; real refresh, stale races and provider errors remain unverified' })

  const sourceHead = process.env.DATAKOALA_AUDIT_HEAD
  assert.ok(/^[0-9a-f]{40}$/.test(sourceHead ?? ''), 'Required generating commit provenance')
  await writeFile(resolve(outputDir, 'measurements.json'), JSON.stringify({
    sourceHead, execution:'Electron renderer + synthetic IPC', viewport:{width:1440,height:900,dpr:1,zoom:1},
    fixture:{ services, attributes }, metadataCalls, generation, interactions, requests, observations,
  }, null, 2) + '\n')
  console.log('CAP22_OK ' + JSON.stringify({ sourceHead, screenshots, requests:requests.length, interactions:interactions.map(x=>x.scenario) }))
}
