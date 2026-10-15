/** CAP-23: isolated Tempo advanced subsystem, comparator and range audit. No live Tempo. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles, auditRange, auditSchemas, auditTraceResult } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'

export const screenshots = [
  'cap23-tempo-messaging-desktop.png',
  'cap23-tempo-database-desktop.png',
  'cap23-tempo-comparators-desktop.png',
  'cap23-tempo-exact-span-desktop.png',
  'cap23-tempo-no-options-desktop.png',
]

const attributes = [
  { name: 'http.status_code', scope: 'span', traceql: 'span.http.status_code' },
  { name: 'custom_duration', scope: 'span', traceql: 'span.custom_duration' },
  { name: 'custom_tag', scope: 'span', traceql: 'span.custom_tag' },
  { name: 'service.version', scope: 'resource', traceql: 'resource.service.version' },
]
const requests = [], discoveries = []
let missingOptional = false, failAttributes = false

export function installAuditIpc(ipc) {
  requests.length = 0
  discoveries.length = 0
  missingOptional = false
  failAttributes = false
  installBaseIpc(ipc)
  const handle = (channel, fn) => { ipc.removeHandler(channel); ipc.handle(channel, fn) }
  handle('connections:tempo:attributes', (_event, profileId, query) => {
    discoveries.push({ type: 'attributes', profileId, query: query ?? null, missingOptional, failAttributes })
    if (failAttributes) throw Error('Synthetic CAP-23 attribute metadata unavailable')
    return missingOptional ? [] : attributes
  })
  handle('connections:tempo:attribute-values', (_event, profileId, attribute, query) => {
    discoveries.push({ type: 'values', profileId, attribute, query: query ?? null, missingOptional })
    if (missingOptional) return []
    if (attribute === 'span.messaging.system') return ['kafka', 'rabbitmq']
    if (attribute === 'span.http.status_code') return ['200', '500', '503']
    if (attribute === 'resource.service.version') return ['v2', 'legacy "beta"']
    return ['alpha', 'beta']
  })
  handle('query:run', (_event, profileId, query, parameters, options) => {
    requests.push({ profileId, query, parameters, options })
    return { ok: true, result: auditTraceResult }
  })
}

const compact = query => query.replace(/\s+/g, ' ').trim()
const baseBuilder = {
  serviceNamespace: '', service: '', spanKind: 'any', protocol: 'any',
  httpMethod: '', endpoint: '', rpcSystem: '', rpcService: '', rpcMethod: '',
  messagingSystem: '', messagingDestination: '', messagingOperation: '',
  dbSystem: '', dbOperation: '', spanName: '', advancedFilters: [],
  status: 'any', minDurationMs: '',
}
const duration = 'span:duration > 300ms'
const wrap = (...conditions) => '{ ' + [...conditions, duration].join(' && ') + ' }'
const equal = (key, value) => key + ' = ' + JSON.stringify(value)
const alternatives = (keys, value) => '(' + keys.map(key => equal(key, value)).join(' || ') + ')'

export async function runVisualAudit({ win, outputDir, waitFor, capture, dragDivider }) {
  await mkdir(outputDir, { recursive: true })
  const observations = [], interactions = []
  const evaluate = source => win.webContents.executeJavaScript(source).catch(error => { console.error('CAP23_EVAL_FAILED', source.slice(0, 1000), error.message); throw error })
  const settle = () => evaluate('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))')
  const waited = (source, description) => waitFor(win, source, description).catch(error => { console.error('CAP23_WAIT_FAILED', description, source, error.message); throw error })
  const state = () => evaluate('window.__datakoalaStore.getState().tabs[0]')
  const click = async selector => {
    await waited('document.querySelector(' + data(selector) + ')', selector)
    await evaluate('document.querySelector(' + data(selector) + ').click()')
    await settle()
  }
  const button = async label => {
    const expression = '[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ' + data(label) + ')'
    await waited(expression, label + ' button')
    await evaluate('(() => { const b = ' + expression + '; if (!b || b.disabled) throw Error("Unavailable button: " + ' + data(label) + '); b.click() })()')
    await settle()
  }
  const choose = async (label, option) => {
    console.log('CAP23_CHOOSE_START', label, option)
    const trigger = '[...document.querySelectorAll("[role=combobox]")].find(e => e.getAttribute("aria-label")?.startsWith(' + data(label + ':') + '))'
    console.log('CAP23_CHOOSE_WAIT_TRIGGER', label)
    await waited(trigger, label + ' combobox')
    await evaluate('(() => { const e = ' + trigger + '; if (!e || e.disabled) throw Error("Unavailable combobox"); e.click() })()')
    console.log('CAP23_CHOOSE_WAIT_LISTBOX', label)
    await waited('document.querySelector("[role=listbox]")', label + ' listbox')
    const target = '[...document.querySelectorAll("[role=option]")].find(e => e.querySelector("[data-combobox-option-label]")?.textContent.trim() === ' + data(option) + ')'
    console.log('CAP23_CHOOSE_WAIT_OPTION', label, option)
    await waited(target, option + ' option')
    await evaluate('(() => { const e = ' + target + '; if (!e) throw Error("Option missing"); e.click() })()')
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await settle()
    console.log('CAP23_CHOOSE_END', label, option)
  }
  const input = async (label, value) => {
    await evaluate('(() => { const l = [...document.querySelectorAll("label")].find(e => e.textContent.trim() === ' + data(label) + '); const e = document.getElementById(l?.htmlFor); if (!(e instanceof HTMLInputElement)) throw Error("Missing labeled input: " + ' + data(label) + '); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, ' + data(value) + '); e.dispatchEvent(new Event("input", {bubbles:true})); e.dispatchEvent(new Event("change", {bubbles:true})) })()')
    await settle()
  }
  const query = () => evaluate('document.querySelector("[aria-label=\\"Generated TraceQL query\\"] .cm-content")?.innerText.trim() ?? ""')
  const exact = async (expected, scenario) => {
    await waited('document.querySelector("[aria-label=\\"Generated TraceQL query\\"] .cm-content")', 'generated TraceQL')
    const actual = compact(await query())
    assert.equal(actual, expected, scenario + ': exact generated TraceQL mismatch')
    return actual
  }
  const record = (name, detail = {}) => interactions.push({ name, ...detail, requestCount: requests.length })
  const save = async (filename, description) => {
    await settle()
    const geometry = await evaluate('(() => { const el=document.querySelector("[aria-label=\\"Trace explorer\\"]"),r=el?.getBoundingClientRect();return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,target:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,overflow:document.documentElement.scrollWidth>innerWidth+1,controls:[...document.querySelectorAll("[data-tempo-builder] [role=combobox]")].map(x=>({label:x.getAttribute("aria-label"),invalid:x.getAttribute("aria-invalid")})),body:document.body.innerText.slice(0,1800)} })()')
    assert.equal(geometry.width, 1440)
    assert.equal(geometry.height, 900)
    assert.equal(geometry.dpr, 1)
    geometry.zoom = win.webContents.getZoomFactor()
    assert.equal(geometry.zoom, 1)
    assert.ok(geometry.target?.width > 0 && geometry.target?.height > 0)
    observations.push({
      filename, description, ...geometry, builder: (await state()).tempoBuilder,
      generatedTraceql: await query(), requestCount: requests.length,
    })
    await capture(win, filename)
  }
  const noDispatch = async (name, action) => {
    const count = requests.length
    await action()
    assert.equal(requests.length, count, name + ': changed control unexpectedly dispatched')
    record(name, { suppressed: true })
  }

  console.log('CAP23_STAGE setup')
  win.show(); win.focus(); win.setContentSize(1440, 900); win.webContents.setZoomFactor(1)
  await evaluate('(() => { const s=window.__datakoalaStore, t=JSON.parse(JSON.stringify(s.getState().tabs[0])),p=' + data(auditProfiles.tempo) + '; t.id="cap23"; t.title="CAP-23"; t.connectionProfileId=p.id; t.queryMode="builder"; t.sql="{ span:name = \\"raw preserved draft\\" }"; t.result=null; t.queryError=null; t.running=false; t.tempoBuilder=' + data(baseBuilder) + '; t.tempoTimeRange=' + data(auditRange) + '; t.tempoSampleSize="250"; t.tempoResultView="list"; s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:"connected",generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:' + data(auditSchemas) + ',status:"loaded",error:null,isStale:false}}}) })()')
  console.log('CAP23_STAGE seeded')
  await waited('document.querySelector("[data-tempo-builder]")', 'Tempo builder')
  const sidebarDelta = await evaluate('240 - document.querySelector("[aria-label=\\"Resize sidebar\\"]").getBoundingClientRect().left')
  if (Math.abs(sidebarDelta) > 1) await dragDivider(win, '[aria-label="Resize sidebar"]', Math.round(sidebarDelta), 0)
  const editorDelta = await evaluate('document.querySelector(".main").getBoundingClientRect().top + 610 - document.querySelector(".editor-resizer").getBoundingClientRect().top')
  if (Math.abs(editorDelta) > 1) await dragDivider(win, '.editor-resizer', 0, Math.round(editorDelta))
  await click('[data-generated-query-panel] summary')
  await waited('document.querySelector("[aria-label=\\"Generated TraceQL query\\"] .cm-content")', 'generated query editor')
  await exact(wrap(), 'baseline')
  await waited('document.querySelector("[role=combobox][aria-label^=\\"Attributes:\\"]")', 'Attributes available')

  console.log('CAP23_STAGE baseline-verified')
  // T09: real subsystem selection, observed discovery, quoted destinations and operation.
  await noDispatch('select-messaging', () => choose('Protocol or subsystem', 'Messaging'))
  await waited('document.querySelector("[role=combobox][aria-label^=\\"Messaging system:\\"]")', 'messaging fields')
  await waited('document.querySelector("[role=listbox]") === null', 'dismissed listbox')
  await waited('document.querySelector("[role=combobox][aria-label^=\\"Messaging system:\\"]:not([disabled])', 'messaging selector')
  await choose('Messaging system', 'kafka')
  await input('Destination / topic', 'orders."vip"\\main')
  await choose('Messaging operation', 'Publish')
  const messaging = wrap(
    equal('span.messaging.system', 'kafka'),
    alternatives(['span.messaging.destination.name', 'span.messaging.destination'], 'orders."vip"\\main'),
    alternatives(['span.messaging.operation.type', 'span.messaging.operation'], 'publish'),
  )
  await exact(messaging, 'messaging')
  assert.ok(discoveries.some(d => d.attribute === 'span.messaging.system'), 'No real messaging metadata discovery')
  await save('cap23-tempo-messaging-desktop.png', 'Messaging system, destination, operation and escaped TraceQL')
  record('messaging', { traceql: messaging, metadata: 'kafka/rabbitmq, synthetic' })

  // T10: inactive messaging drafts may survive, but must not appear in active Database TraceQL.
  await noDispatch('switch-database', () => choose('Protocol or subsystem', 'Database'))
  assert.equal((await state()).tempoBuilder.messagingSystem, 'kafka', 'Expected inactive draft to be retained')
  await choose('Database system', 'PostgreSQL')
  await input('DB operation', 'SELECT "audit"')
  const database = wrap(
    alternatives(['span.db.system.name', 'span.db.system'], 'postgresql'),
    alternatives(['span.db.operation.name', 'span.db.operation'], 'SELECT "audit"'),
  )
  await exact(database, 'database')
  assert.equal((await state()).tempoBuilder.protocol, 'database')
  assert.ok(!database.includes('messaging.'), 'Inactive messaging predicate leaked')
  await save('cap23-tempo-database-desktop.png', 'Database details with retained but inactive messaging draft')
  record('database', { traceql: database, inactiveMessagingDraft: true })

  await choose('Protocol or subsystem', 'Messaging')
  await exact(messaging, 'switch-back-messaging')
  await choose('Protocol or subsystem', 'Any protocol')
  await exact(wrap(), 'return-to-any')

  // T11: select a discovered facet and drive each actual comparison mode through the UI.
  await click('[data-collapsible-title="Advanced filters"] summary')
  await choose('Attributes', 'span.http.status_code')
  assert.equal((await state()).tempoBuilder.advancedFilters[0].attribute, 'span.http.status_code')
  await choose('span.http.status_code match mode', 'Greater than (>)')
  await input('span.http.status_code value', '500')
  for (const [label, operator] of [
    ['Greater than (>)', '>'],
    ['Greater than or equal (>=)', '>='],
    ['Less than (<)', '<'],
    ['Less than or equal (<=)', '<='],
  ]) {
    await choose('span.http.status_code match mode', label)
    await exact(wrap('span.http.status_code ' + operator + ' 500'), 'comparator-' + operator)
    record('comparator-' + operator, { attribute: 'span.http.status_code', value: '500', type: 'numeric' })
  }
  await choose('span.http.status_code match mode', 'Matches regex (=~)')
  await input('span.http.status_code value', 'v2-.*')
  await exact(wrap('span.http.status_code =~ "v2-.*"'), 'regex')
  record('regex', { attribute: 'span.http.status_code', value: 'v2-.*' })
  await choose('span.http.status_code match mode', 'Does not match regex (!~)')
  await exact(wrap('span.http.status_code !~ "v2-.*"'), 'negative-regex')
  await choose('span.http.status_code match mode', 'Greater than or equal (>=)')
  await input('span.http.status_code value', '500')
  await exact(wrap('span.http.status_code >= 500'), 'numeric-final')
  await save('cap23-tempo-comparators-desktop.png', 'Selected facet, numeric comparison and visible operator/value')
  await noDispatch('clear-comparison-scalar', () => input('span.http.status_code value', ''))
  await exact(wrap(), 'empty-comparison')
  assert.equal((await state()).tempoBuilder.advancedFilters.length, 1, 'Cleared scalar should keep draft facet')
  await choose('Attributes', 'span.http.status_code')
  assert.equal((await state()).tempoBuilder.advancedFilters.length, 0, 'Unselected facet must be removed')

  // T12/T13: exact span and duration produce predicates; sample and range are request parameters.
  await input('Exact span / operation name', 'POST /"checkout"\\audit')
  await input('Min duration (ms)', '125')
  await choose('Sample size', '100 traces')
  const exactSpan = '{ ' + equal('span:name', 'POST /"checkout"\\audit') + ' && span:duration > 125ms }'
  await exact(exactSpan, 'exact-span-and-duration')
  assert.equal((await state()).tempoSampleSize, '100')
  await save('cap23-tempo-exact-span-desktop.png', 'Exact span name, duration, custom UTC window and sample size')
  const beforeRun = requests.length
  await button('Run')
  await waited('!window.__datakoalaStore.getState().tabs[0].running && window.__datakoalaStore.getState().tabs[0].result', 'sampled Tempo query completed')
  assert.equal(requests.length, beforeRun + 1)
  assert.deepEqual(requests.at(-1), {
    profileId: 'audit-tempo', query: exactSpan, parameters: [],
    options: { start: '2026-08-19T16:00:00.000Z', end: '2026-08-19T17:00:00.000Z', sampleSize: 100 },
  })
  record('exact-span-execution', { traceql: exactSpan, request: requests.at(-1) })

  // The picker is shared, but a changed range without execution should not silently rerun.
  await noDispatch('open-time-range-picker', () => click('[data-time-range-field] button'))
  await button('Cancel')

  // T09-T13: empty optional discovery must not silently pick a fallback or preserve an active predicate.
  await input('Exact span / operation name', '')
  await input('Min duration (ms)', '')
  await choose('Protocol or subsystem', 'Messaging')
  await choose('Messaging system', 'Any messaging system')
  await input('Destination / topic', '')
  await choose('Messaging operation', 'Any operation')
  missingOptional = true
  const valuesBefore = discoveries.length
  await evaluate('(() => { const s=window.__datakoalaStore; const v=s.getState().connectionStateByProfileId["audit-tempo"]; s.setState({connectionStateByProfileId:{"audit-tempo":{...v,generation:v.generation+1}}}) })()')
  await waited('document.querySelector("[data-tempo-builder]")', 'fresh metadata render')
  await waited('document.querySelector("[role=combobox][aria-label^=\\"Messaging system:\\"]")', 'empty messaging control')
  await waited('document.querySelector("[role=combobox][aria-label^=\\"Attributes:\\"]")', 'empty attribute control')
  await waited('document.querySelector("[role=combobox][aria-label^=\\"Messaging system: Any messaging system\\"]")', 'no silent messaging fallback')
  await waited('document.querySelector("[role=combobox][aria-label^=\\"Attributes: Select attributes\\"]")', 'no stale attribute selections')
  assert.ok(discoveries.length > valuesBefore && discoveries.some(d => d.missingOptional), 'No empty synthetic refresh observed')
  await exact(wrap('span.messaging.system != nil'), 'empty-discovery-protocol-fallback')
  await click('[data-collapsible-title="Advanced filters"] summary')
  await click('[data-collapsible-title="Advanced filters"] summary')
  await evaluate('(() => { const e=[...document.querySelectorAll("[role=combobox]")].find(x => x.getAttribute("aria-label")?.startsWith("Attributes:"));if(!e)throw Error("Attributes control absent");e.click() })()')
  await waited('document.body.innerText.includes("No attributes discovered.")', 'explicit no-attributes state')
  assert.equal((await state()).tempoBuilder.advancedFilters.length, 0)
  const beforeEmpty = requests.length
  await save('cap23-tempo-no-options-desktop.png', 'No discovered optional attributes, no stale predicates; explicit empty list')
  assert.equal(requests.length, beforeEmpty)
  record('missing-optional-metadata', { selectedMessagingSystem: '', attributeCount: 0, fallbackProtocolPredicate: true })

  const sourceHead = process.env.DATAKOALA_AUDIT_HEAD
  assert.match(sourceHead ?? '', /^[0-9a-f]{40}$/, 'Generating sourceHead must be an exact commit')
  await writeFile(resolve(outputDir, 'measurements.json'), JSON.stringify({
    sourceHead, execution: 'real Electron renderer + deterministic Tempo IPC; no authenticated Tempo',
    viewport: { width: 1440, height: 900, dpr: 1, zoom: 1 },
    fixtures: { attributes, messagingSystems: ['kafka', 'rabbitmq'], missingOptional: true },
    discoveries, requests, interactions, observations,
    limitations: ['Live Tempo TraceQL acceptance not exercised', 'Provider retry and initial loading/error visual states not separately captured'],
  }, null, 2) + '\n')
  console.log('CAP23_OK ' + JSON.stringify({ sourceHead, screenshots: observations.map(o => o.filename), requests: requests.length }))
}
