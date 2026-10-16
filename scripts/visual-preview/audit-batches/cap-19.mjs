/** CAP-19: isolated, deterministic Loki log exploration audit (no production changes). */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditLogs, auditLogResult, auditProfiles, auditRange } from '../audit-fixtures.mjs'
import { rendererValue } from '../renderer-value.mjs'

export const screenshots = [
  'cap19-logs-default-desktop.png',
  'cap19-logs-filtered-desktop.png',
  'cap19-logs-inspector-desktop.png',
  'cap19-logs-field-filter-desktop.png',
  'cap19-logs-copy-feedback-desktop.png',
]

const message = 'CAP19 needle: Checkout failed while confirming the payment\n' +
  'TimeoutError: upstream waited beyond 900ms\n    at authorize (checkout.ts:42:7)'
const raw = JSON.stringify({
  message,
  attempt: 3,
  nested: { provider: 'gateway', retries: [1, 2, 3] },
  note: 'quote " and slash \\ remain exact',
})
const records = auditLogs.concat(
  Array.from({ length: 120 }, (_, index) => ({
    ...auditLogs[index % auditLogs.length],
    id: 'cap19-extra-' + index,
    timestampMs: auditLogs.at(-1).timestampMs - (index + 1) * 1000,
    timestampNs: String(BigInt(auditLogs.at(-1).timestampMs - (index + 1) * 1000) * 1000000n),
  })),
).map((row, index) => ({
  ...row,
  severity: ['INFO', 'WARN', 'ERROR', 'DEBUG'][index % 4],
  labels: { service_name: index === 0 ? 'checkout-api' : 'example-service', environment: 'test' },
  structuredMetadata: { region: index === 0 ? 'us-east' : 'west', tenant: 'partner-"one"' },
  parsedFields: index === 0 ? { attempt: 3, nested: { provider: 'gateway', retries: [1, 2, 3] } } : {},
}))
records[0] = {
  ...records[0], id: 'cap19-target', line: raw, severity: 'ERROR',
  traceId: '0123456789abcdef0123456789abcdef', spanId: '0123456789abcdef',
}
const responses = []
const requestResult = (expression) => {
  const errorOnly = /severity[^}]*ERROR/i.test(expression)
  const rows = errorOnly ? records.filter(row => row.severity === 'ERROR') : records
  return { ...auditLogResult, rows, logRows: rows, rowCount: rows.length }
}

export function installAuditIpc(ipc) {
  responses.length = 0
  installBaseIpc(ipc)
  const handle = (name, fn) => { ipc.removeHandler(name); ipc.handle(name, fn) }
  handle('connections:loki:labels', () => ['service_name', 'severity', 'environment'])
  handle('connections:loki:label-values', (_event, _id, label) =>
    label === 'severity' ? ['ERROR', 'WARN', 'INFO', 'DEBUG'] : ['checkout-api', 'example-service'])
  handle('connections:loki:format-query', (_event, _id, expression) => expression)
  handle('query:run-loki', (_event, id, request) => {
    responses.push({ id, ...request })
    return requestResult(request.expression)
  })
}

export async function runVisualAudit({ win, outputDir, waitFor, capture, dragDivider }) {
  await mkdir(outputDir, { recursive: true })
  const observations = [], behavior = []
  const js = expression => win.webContents.executeJavaScript(expression)
  const settle = () => js('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))')
  const state = () => js('window.__datakoalaStore.getState().tabs[0]')
  const count = () => js('document.querySelector(\'[aria-label="Log results"]\')?.querySelectorAll("article").length ?? 0')
  const loaded = () => js('document.querySelector(\'[aria-label="Log results"]\')?.textContent.match(/\\d+ loaded/)?.[0] ?? null')
  const query = () => js('document.querySelector(\'[aria-label="Generated LogQL query"] .cm-content\')?.innerText.trim() ?? ""')
  const click = async selector => {
    await waitFor(win, 'document.querySelector(' + rendererValue(selector) + ')', 'click ' + selector)
    await js('document.querySelector(' + rendererValue(selector) + ').click()')
    await settle()
  }
  const button = async (label, scope = 'document') => {
    const expression = '[...' + scope + '.querySelectorAll("button")].find(e=>e.textContent.trim()===' + rendererValue(label) + ')'
    await waitFor(win, expression, 'button ' + label)
    await js(expression + '.click()')
    await settle()
  }
  const labeled = async (label, value) => {
    await js('(() => {const lab=[...document.querySelectorAll("label")].find(e=>e.textContent.trim()===' + rendererValue(label) + ');const e=lab?.htmlFor?document.getElementById(lab.htmlFor):[...document.querySelectorAll("input")].find(e=>e.getAttribute("aria-label")===' + rendererValue(label) + ');if(!(e instanceof HTMLInputElement))throw Error("Missing labeled input: "+' + rendererValue(label) + ');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,' + rendererValue(value) + ');e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}))})()')
    await settle()
  }
  const choose = async (label, option) => {
    await js('(() => {const e=[...document.querySelectorAll("[role=combobox]")].find(e=>e.getAttribute("aria-label")?.startsWith(' + rendererValue(label + ':') + ')||e.getAttribute("aria-label")===' + rendererValue(label) + ');if(!e)throw Error("Missing combo: "+' + rendererValue(label) + ');e.click()})()')
    await waitFor(win, 'document.querySelector("[role=listbox]")', 'options for ' + label)
    await js('(() => {const e=[...document.querySelectorAll("[role=option]")].find(e=>e.querySelector("[data-combobox-option-label]")?.textContent.trim()===' + rendererValue(option) + ');if(!e)throw Error("Missing option: "+' + rendererValue(option) + ');e.click()})()')
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await settle()
  }
  const save = async (filename, description) => {
    await settle()
    const measure = await js('(() => {const root=document.querySelector(\'[aria-label="Log results"]\'),r=root?.getBoundingClientRect(),scroll=root?.querySelector(\'[class*="logScroller"]\'),detail=document.querySelector("[data-resizable-detail]"),select=root?.querySelector(\'[aria-selected="true"]\');return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,target:r&&{x:r.x,y:r.y,width:r.width,height:r.height},bodyCount:document.body.scrollWidth,viewportWidth:document.documentElement.clientWidth,loaded:root?.textContent.match(/\\d+ loaded/)?.[0]??null,renderedRows:root?.querySelectorAll("article").length??0,rowIndices:[...root.querySelectorAll("article")].map(e=>Number(e.getAttribute("data-index"))),selectedText:select?.getAttribute("aria-label")??null,inspectorWidth:detail?.getAttribute("data-detail-width")??null,scrollTop:scroll?.scrollTop??null,scrollHeight:scroll?.scrollHeight??null,alertText:[...document.querySelectorAll("[role=alert]")].map(e=>e.textContent.trim()),statusText:[...document.querySelectorAll("[role=status]")].map(e=>e.textContent.trim()),highlightCount:root?.querySelectorAll("mark").length??0}})()')
    assert.equal(measure.width, 1440)
    assert.equal(measure.height, 900)
    assert.equal(measure.dpr, 1)
    measure.zoom = win.webContents.getZoomFactor()
    assert.equal(measure.zoom, 1)
    assert.ok(measure.target.width > 0 && measure.target.height > 0)
    observations.push({ filename, description, ...measure, query: await query(), queryCalls: responses.length })
    await capture(win, filename)
  }

  win.show(); win.focus(); win.setContentSize(1440, 900); win.webContents.setZoomFactor(1)
  await js('(() => {const s=window.__datakoalaStore,t=JSON.parse(JSON.stringify(s.getState().tabs[0])),p=' + rendererValue(auditProfiles.loki) + ',r=' + rendererValue(requestResult('')) + ';t.id="cap19";t.title="CAP-19";t.connectionProfileId=p.id;t.queryMode="builder";t.sql=\'{service_name="example-service"}\';t.result=r;t.resultRevision=1;t.queryError=null;t.running=false;t.lokiResultView="list";t.lokiGroupBy=[];t.lokiTimeRange=' + rendererValue(auditRange) + ';t.lokiResultLimit=500;t.lokiBuilder={labelMatchers:[{label:"service_name",operator:"=~",value:".+"}],lineFilters:[],parsers:[],fieldFilters:[]};s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:"connected",generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:"loaded",error:null,isStale:false}}})})()')
  await waitFor(win, 'document.querySelector("[aria-label=\\"Log results\\"] article")', 'populated Loki logs')
  const sidebarDelta = await js('240-document.querySelector(\'[aria-label="Resize sidebar"]\').getBoundingClientRect().left')
  if (Math.abs(sidebarDelta) > 1) await dragDivider(win, '[aria-label="Resize sidebar"]', Math.round(sidebarDelta), 0)
  const editorDelta = await js('document.querySelector(".main").getBoundingClientRect().top+300-document.querySelector(".editor-resizer").getBoundingClientRect().top')
  if (Math.abs(editorDelta) > 1) await dragDivider(win, '.editor-resizer', 0, Math.round(editorDelta))
  await waitFor(win, 'document.querySelector("[aria-label=\\"Log results\\"] article")', 'resized result')
  assert.equal(await loaded(), '360 loaded')
  assert.ok(await count() < 360 && await count() > 0, 'native virtualization renders a bounded row subset')
  assert.equal(responses.length, 0)
  await save(screenshots[0], 'Default loaded 360-row result, timestamp/order and bounded virtualization')
  behavior.push({ scenario: 'default', total: 360, rendered: await count(), requestDelta: 0,
    expectedFirst: records[0].id, firstDisplayed: await js('document.querySelector(\'[aria-label="Log results"] article button\')?.getAttribute("aria-label")') })

  await click('[data-generated-query-panel] summary')
  await waitFor(win, 'document.querySelector(\'[aria-label="Generated LogQL query"] .cm-content\')', 'generated LogQL editor')
  await labeled('Search loaded logs', 'CAP19 needle')
  await waitFor(win, 'document.querySelector(\'[aria-label="Log results"]\')?.textContent.includes("1 loaded")', 'local search count')
  assert.equal(await loaded(), '1 loaded')
  assert.equal(responses.length, 0)
  const marks = await js('[...document.querySelectorAll(\'[aria-label="Log results"] mark\')].map(e=>e.textContent)')
  assert.ok(marks.length > 0 && marks.every(text => text.toLowerCase().includes('cap19') || text.toLowerCase().includes('needle')))
  await labeled('Search loaded logs', '')
  await waitFor(win, 'document.querySelector(\'[aria-label="Log results"]\')?.textContent.includes("360 loaded")', 'search clear')
  const beforeSeverity = responses.length
  await choose('Level', 'ERROR')
  await waitFor(win, 'document.querySelector(\'[aria-label="Generated LogQL query"] .cm-content\')?.innerText.includes("ERROR")', 'severity LogQL generated')
  const severityExpression = await query()
  assert.match(severityExpression, /severity.*ERROR/i)
  assert.equal(responses.length, beforeSeverity, 'changing Builder Level is not an implicit provider query')
  await button('Run', 'document.querySelector("[data-query-toolbar]")')
  await waitFor(win, '!window.__datakoalaStore.getState().tabs[0].running && window.__datakoalaStore.getState().tabs[0].result', 'severity query')
  assert.equal(responses.length, beforeSeverity + 1)
  assert.equal(responses.at(-1).expression, severityExpression)
  const errorRows = records.filter(row => row.severity === 'ERROR')
  await waitFor(win, 'document.querySelector(\'[aria-label="Log results"]\')?.textContent.includes(' + rendererValue(errorRows.length + ' loaded') + ')', 'severity result count')
  await labeled('Search loaded logs', 'CAP19 needle')
  await waitFor(win, 'document.querySelector(\'[aria-label="Log results"]\')?.textContent.includes("1 loaded")', 'combined severity and search')
  assert.equal(await loaded(), '1 loaded')
  await save(screenshots[1], 'Query-level severity from explicit Run combined with local highlighted search')
  behavior.push({ scenario: 'search-severity', localSearchRestored: 360, severityResult: errorRows.length,
    searchedResult: 1, expression: severityExpression, requests: responses.slice(), highlight: marks })

  await labeled('Search loaded logs', '')
  await waitFor(win, 'document.querySelector(\'[aria-label="Log results"] article button\')?.getAttribute("aria-label")?.includes("CAP19 needle")', 'target row')
  await click('[aria-label="Log results"] article button')
  await waitFor(win, 'document.querySelector(\'[aria-label="Selected log details"]\')', 'selected inspector')
  assert.ok((await js('document.querySelector(\'[aria-label="Selected log details"]\').textContent')).includes(message))
  assert.ok((await js('document.querySelector(\'[aria-label="Selected log details"]\').textContent')).includes('nested'))
  assert.equal((await js('document.querySelector(\'[aria-label="Selected log details"]\').textContent')).includes('[object Object]'), false, 'nested values must remain inspectable JSON')
  assert.ok(await js("[...document.querySelectorAll('details pre')].some(e=>e.textContent.includes('gateway') && e.textContent.includes('retries'))"))
  const nestedBounds = await js("(()=>{const e=document.querySelector('details pre'),p=e.closest('dd');return {value:e.getBoundingClientRect().toJSON(),parent:p.getBoundingClientRect().toJSON(),scroll:e.scrollHeight,client:e.clientHeight}})()")
  assert.ok(nestedBounds.value.right <= nestedBounds.parent.right+1, 'structured value stays within inspector')
  const previousWidth = Number(await js('document.querySelector("[data-resizable-detail]").getAttribute("data-detail-width")'))
  await js('document.querySelector(\'[role="separator"][aria-label="Resize Selected log details"]\').focus()')
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Left' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Left' })
  await settle()
  const resizedWidth = Number(await js('document.querySelector("[data-resizable-detail]").getAttribute("data-detail-width")'))
  assert.ok(resizedWidth >= previousWidth, 'keyboard resize preserves or expands width within the responsive clamp')
  await js('document.querySelector(\'[aria-label="Selected log details"] [class*="inspectorBody"]\').scrollTop=75')
  await settle()
  assert.ok((await js('document.querySelector(\'[aria-label="Selected log details"]\').textContent')).includes(message))
  await save(screenshots[2], 'Target row and inspector, resized right panel, full multiline and nested fields')
  behavior.push({ scenario: 'inspector', selectedId: records[0].id, previousWidth, resizedWidth,
    nestedPresentation: 'readable JSON', nestedBounds, messageComplete: true })

  const beforeFilter = responses.length
  await click('[aria-label="Include service_name"]')
  await waitFor(win, 'document.querySelector(\'[aria-label="Generated LogQL query"] .cm-content\')?.innerText.includes(\'service_name="checkout-api"\')', 'label promoted to LogQL')
  let filteredQuery = await query()
  assert.ok(filteredQuery.includes('service_name="checkout-api"'))
  assert.equal(responses.length, beforeFilter)
  await click('[aria-label="Exclude region"]')
  await waitFor(win, 'document.querySelector(\'[aria-label="Generated LogQL query"] .cm-content\')?.innerText.includes(\'region!="us-east"\')', 'structured metadata exclusion in LogQL')
  filteredQuery = await query()
  assert.ok(filteredQuery.includes('region!="us-east"'))
  assert.equal(responses.length, beforeFilter, 'inspector include/exclude updates Builder but does not auto-run')
  const filterState = await state()
  assert.equal(filterState.queryMode, 'builder')
  assert.equal(filterState.lokiBuilder.labelMatchers.find(m => m.label === 'service_name').value, 'checkout-api')
  assert.equal(filterState.lokiBuilder.fieldFilters.find(f => f.field === 'region').operator, '!=')
  await save(screenshots[3], 'Inspector include label and exclude structured field, promoted to Builder')
  behavior.push({ scenario: 'field-filter', expression: filteredQuery, mode: filterState.queryMode,
    labelMatcher: filterState.lokiBuilder.labelMatchers.find(m => m.label === 'service_name'),
    fieldFilter: filterState.lokiBuilder.fieldFilters.find(f => f.field === 'region'),
    requestDelta: responses.length - beforeFilter })

  await js('(() => {window.__cap19Clipboard={writes:[],fail:false};window.__cap19Unhandled=[];window.addEventListener("unhandledrejection",e=>{window.__cap19Unhandled.push(String(e.reason));e.preventDefault()});Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText(value){window.__cap19Clipboard.writes.push(value);return window.__cap19Clipboard.fail?Promise.reject(Error("Synthetic CAP-19 clipboard denied")):Promise.resolve()}}})})()')
  await click('[aria-label="Copy message"]')
  assert.equal(await js('window.__cap19Clipboard.writes.at(-1)'), message)
  await click('[aria-label="Copy raw log"]')
  assert.equal(await js('window.__cap19Clipboard.writes.at(-1)'), raw)
  await click('[aria-label="Copy nested"]')
  assert.equal(await js('window.__cap19Clipboard.writes.at(-1)'), JSON.stringify(records[0].parsedFields.nested))
  await click('[aria-label="Copy attempt"]')
  assert.equal(await js('window.__cap19Clipboard.writes.at(-1)'), '3')
  await click('[aria-label="Copy Trace ID"]')
  assert.equal(await js('window.__cap19Clipboard.writes.at(-1)'), records[0].traceId)
  await click('[aria-label="Copy Span ID"]')
  assert.equal(await js('window.__cap19Clipboard.writes.at(-1)'), records[0].spanId)
  await click('[aria-label="Copy region"]')
  assert.equal(await js('window.__cap19Clipboard.writes.at(-1)'), 'us-east')
  await js('window.__cap19Clipboard.fail=true')
  await click('[aria-label="Copy raw log"]')
  await settle()
  assert.equal(await js('window.__cap19Clipboard.writes.at(-1)'), raw)
  const afterFeedback = await js('[...document.querySelectorAll("[role=alert],[role=status]")].map(e=>e.textContent.trim())')
  assert.equal(afterFeedback.length, 1, 'one actionable copy error')
  assert.match(afterFeedback[0], /Could not copy.*Try Copy again/)
  assert.deepEqual(await js('window.__cap19Unhandled'), [], 'clipboard rejection is handled')
  await js('window.__cap19Clipboard.fail=false')
  await click('[aria-label="Copy raw log"]')
  assert.equal(await js('window.__cap19Clipboard.writes.at(-1)'), raw)
  assert.equal(responses.length, beforeFilter)
  await waitFor(win, `document.querySelector('[role=status]')?.textContent.includes('Copied to clipboard')`, 'copy retry succeeds')
  assert.equal(await js(`document.querySelectorAll('[role=alert]').length`), 0)
  // Selection stays attached to the log when the virtual viewport moves past it.
  await js('(() => {const e=document.querySelector(\'[aria-label="Log results"] [class*="logScroller"]\');e.scrollTop=e.scrollHeight*.8;e.dispatchEvent(new Event("scroll",{bubbles:true}))})()')
  await waitFor(win, '[...document.querySelectorAll(\'[aria-label="Log results"] article\')].some(e=>Number(e.dataset.index)>15)', 'virtual scrolling')
  assert.ok(await count() < errorRows.length)
  assert.ok((await js('document.querySelector(\'[aria-label="Selected log details"]\').textContent')).includes(message))
  await save(screenshots[4], 'Scrolled virtualization with stable selected inspector after successful and denied synthetic copies')
  behavior.push({ scenario: 'copy-scroll', copies: await js('window.__cap19Clipboard.writes'),
    unhandledRejections: await js('window.__cap19Unhandled'), copyFailureFeedbackAdded: true,
    selectionPreserved: true, renderedAfterScroll: await count(), requestDelta: responses.length - beforeFilter,
    osClipboardAcceptance: 'not tested' })
  // Reconcile identity when the inspector is explicitly closed/reopened and local search removes its row.
  await click('[aria-label="Close log details"]')
  await waitFor(win, '!document.querySelector(\'[aria-label="Selected log details"]\')', 'inspector closed')
  await js('(() => {const e=document.querySelector(\'[aria-label="Log results"] [class*="logScroller"]\');e.scrollTop=0;e.dispatchEvent(new Event("scroll",{bubbles:true}))})()')
  await waitFor(win, 'document.querySelector(\'[aria-label="Log results"] article button\')?.getAttribute("aria-label")?.includes("CAP19 needle")', 'first row restored')
  await click('[aria-label="Log results"] article button')
  await waitFor(win, 'document.querySelector(\'[aria-label="Selected log details"]\')?.textContent.includes("CAP19 needle")', 'inspector reopened with original row')
  const retainedWidth = Number(await js('document.querySelector("[data-resizable-detail]").getAttribute("data-detail-width")'))
  assert.equal(retainedWidth, resizedWidth, 'reopening retains inspector width')
  await labeled('Search loaded logs', 'cap19-deliberate-nonmatch')
  await waitFor(win, 'document.querySelector(\'[aria-label="Log results"]\')?.textContent.includes("No matching log entries.")', 'search excludes selected row')
  await waitFor(win, '!document.querySelector(\'[aria-label="Selected log details"]\')', 'inspector cleared when selected row disappears')
  await labeled('Search loaded logs', '')
  await waitFor(win, 'document.querySelector(\'[aria-label="Log results"]\')?.textContent.includes("91 loaded")', 'search restored error cohort')
  assert.equal(await js('document.querySelector(\'[aria-label="Log results"] [aria-selected="true"]\')'), null, 'selection stays cleared after restoring results')
  assert.equal(responses.length, beforeFilter)
  behavior.push({ scenario: 'close-reopen-search-reconciliation', retainedWidth,
    closeThenReopenSameLog: true, nonmatchingSearchClearsSelection: true,
    clearSearchRestoresCount: 91, requestDelta: responses.length - beforeFilter })

  await writeFile(resolve(outputDir, 'measurements.json'), JSON.stringify({
    sourceHead: process.env.DATAKOALA_AUDIT_HEAD ?? 'UNSPECIFIED',
    timezone: await js('Intl.DateTimeFormat().resolvedOptions().timeZone'),
    execution: 'real Electron renderer, deterministic IPC, synthetic clipboard, no native OS acceptance',
    fixture: { count: records.length, target: records[0].id, expectedSeverityCount: errorRows.length },
    requests: responses, behavior, observations,
  }, null, 2) + '\n')
  console.log('CAP19_OK ' + JSON.stringify({ screenshots, queryCalls: responses.length }))
}
