/** CAP-18 standalone Electron audit module; all provider replies are synthetic. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles, auditRange, auditLogResult } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'

export const screenshots = [
  'cap18-composition-desktop.png', 'cap18-level-group-desktop.png',
  'cap18-parser-field-desktop.png', 'cap18-invalid-desktop.png',
  'cap18-time-limit-desktop.png',
]
const calls = [], formats = []
export function installAuditIpc(ipc) {
  calls.length = 0; formats.length = 0
  installBaseIpc(ipc)
  const handle = (name, fn) => { ipc.removeHandler(name); ipc.handle(name, fn) }
  handle('connections:loki:labels', (_event, id) => id.endsWith('no-fallback') ? ['environment'] : ['service_name', 'environment', 'severity'])
  handle('connections:loki:label-values', (_event, _id, label) => label === 'environment' ? ['production', 'staging'] : ['example-service', 'api.v2'])
  handle('connections:loki:format-query', (_event, id, query) => { formats.push({ id, query }); if(query.includes('cap18-format-error'))throw Error('Synthetic CAP-18 formatter failure'); return query.includes('cap18-raw') ? query.replace('} |=', '}\n|=') : query })
  handle('query:run-loki', (_event, id, request) => { calls.push({ id, ...request }); return auditLogResult })
}

export async function runVisualAudit({ win, outputDir, waitFor, capture, dragDivider }) {
  await mkdir(outputDir, { recursive: true })
  const observations = [], behavior = []
  const evaluate = expression => win.webContents.executeJavaScript(expression)
  const settle = () => evaluate('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
  const state = () => evaluate('window.__datakoalaStore.getState().tabs[0]')
  const click = async selector => { await waitFor(win, `document.querySelector(${data(selector)})`, selector); await evaluate(`document.querySelector(${data(selector)}).click()`); await settle() }
  const button = async (text, scope = 'document') => {
    const expr = `[...${scope}.querySelectorAll('button')].find(e=>e.textContent.trim()===${data(text)})`
    await waitFor(win, expr, text); await evaluate(`${expr}.click()`); await settle()
  }
  const key = async keyCode => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode }); await settle()
  }
  const input = async (label, value) => {
    await evaluate(`(() => {const label=[...document.querySelectorAll('label')].find(e=>e.textContent.trim()===${data(label)});const e=document.getElementById(label?.htmlFor);if(!e)throw Error('Missing input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${data(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`); await settle()
  }
  const choose = async (label, option) => {
    await evaluate(`(() => {const e=[...document.querySelectorAll('[role="combobox"]')].find(e=>e.getAttribute('aria-label')?.startsWith(${data(label + ':')}) || e.getAttribute('aria-label')===${data(label)});if(!e)throw Error('Missing combo');e.click()})()`)
    await waitFor(win, `document.querySelector('[role="listbox"]')`, 'options')
    await evaluate(`(() => {const e=[...document.querySelectorAll('[role="option"]')].find(e=>e.querySelector('[data-combobox-option-label]')?.textContent.trim()===${data(option)});if(!e)throw Error('Missing option '+${data(option)});e.click()})()`)
    await key('Escape'); await settle()
  }
  const query = () => evaluate(`document.querySelector('[aria-label="Generated LogQL query"] .cm-content')?.innerText.trim() ?? ''`)
  const exact = async expected => { await waitFor(win, `document.querySelector('[aria-label="Generated LogQL query"] .cm-content')?.innerText.trim()===${data(expected)}`, 'exact LogQL'); assert.equal(await query(), expected) }
  const save = async (filename, description) => {
    await settle()
    const measured = await evaluate(`(() => {const e=document.querySelector('[aria-label="Loki explorer"]'),r=e.getBoundingClientRect();return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,target:{x:r.x,y:r.y,width:r.width,height:r.height},body:document.body.innerText,runDisabled:[...document.querySelectorAll('[data-query-toolbar] button')].find(e=>e.textContent.trim()==='Run')?.disabled}})()`)
    assert.equal(measured.width, 1440); assert.equal(measured.height, 900); assert.equal(measured.dpr, 1)
    measured.zoom = win.webContents.getZoomFactor(); assert.equal(measured.zoom, 1)
    assert.ok(measured.target.width > 0 && measured.target.height > 0)
    observations.push({ filename, description, ...measured, state: await state(), query: await query(), queryCalls: calls.length })
    await capture(win, filename)
  }
  win.show(); win.focus(); win.setContentSize(1440, 900); win.webContents.setZoomFactor(1)
  await evaluate(`(() => {const s=window.__datakoalaStore,t=JSON.parse(JSON.stringify(s.getState().tabs[0])),p=${data(auditProfiles.loki)};t.id='cap18';t.title='CAP-18';t.connectionProfileId=p.id;t.queryMode='builder';t.sql='{service_name="raw-draft"}';t.result=null;t.queryError=null;t.running=false;t.lokiResultView='list';t.lokiGroupBy=[];t.lokiTimeRange=${data(auditRange)};t.lokiResultLimit=2000;t.lokiBuilder={labelMatchers:[{label:'service_name',operator:'=',value:'example-service',values:['example-service']}],lineFilters:[],parsers:[],fieldFilters:[]};s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:'connected',generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:'loaded',error:null,isStale:false}}})})()`)
  await waitFor(win, `document.querySelector('[data-loki-builder]') && !document.querySelector('[role="combobox"][disabled]')`, 'loaded Loki')
  const sidebarDelta = await evaluate(`240-document.querySelector('[aria-label="Resize sidebar"]').getBoundingClientRect().left`)
  if(Math.abs(sidebarDelta)>1)await dragDivider(win,'[aria-label="Resize sidebar"]',Math.round(sidebarDelta),0)
  const editorDelta = await evaluate(`document.querySelector('.main').getBoundingClientRect().top+640-document.querySelector('.editor-resizer').getBoundingClientRect().top`)
  await dragDivider(win, '.editor-resizer', 0, Math.round(editorDelta))
  await click('[data-generated-query-panel] summary')
  await exact('{service_name="example-service"}')
  await choose('Filter by', 'environment'); await choose('environment values', 'production'); await choose('environment values', 'staging')
  await input('Line contains', 'a"b\\c')
  const composed = '{service_name="example-service", environment=~"^(?:production|staging)$"} |= "a\\"b\\\\c"'
  await exact(composed)
  assert.equal(calls.length, 0)
  await save('cap18-composition-desktop.png', 'Actual multi-value matcher and escaped line text')
  await choose('Level', 'ERROR'); await choose('Group by', 'Level')
  const levelQuery = composed.replace('} |=', ', severity=~"(?i)^(?:ERROR)$"} |=')
  await exact(levelQuery)
  assert.deepEqual((await state()).lokiGroupBy, ['severity'])
  await choose('Level', 'WARN'); assert.deepEqual((await state()).lokiGroupBy, ['severity'])
  await choose('Group by', 'environment'); assert.equal((await state()).lokiBuilder.labelMatchers.find(e=>e.label==='severity').values.join(), 'ERROR,WARN')
  await save('cap18-level-group-desktop.png', 'Level and grouping independently changed through real controls')
  // Existing state is deliberately injected; creation via an inspector is a separate test boundary.
  await evaluate(`(() => {const s=window.__datakoalaStore,t=s.getState().tabs[0];s.getState().setLokiState({lokiBuilder:{...t.lokiBuilder,parsers:[{kind:'json'}],fieldFilters:[{field:'attempt',operator:'=',value:'3'}]}})})()`)
  await click('[data-collapsible-title="Advanced filters"] summary')
  await input('Field 1 value', '4'); await choose('Field 1 operator', '!=')
  assert.ok((await query()).endsWith('| json | attempt!="4"'))
  await save('cap18-parser-field-desktop.png', 'Injected existing JSON parser/field, then real field edits')
  // Every field operator is selected through the visible Combobox.
  for(const operator of ['=~', '!~', '=', '!=']) {
    await choose('Field 1 operator', operator)
    await waitFor(win, `document.querySelector('[aria-label="Generated LogQL query"] .cm-content')?.innerText.trim().endsWith(${data('| attempt'+operator+'"4"')})`, 'field operator '+operator)
  }
  await choose('Parser 1', 'pattern')
  await input('Parser 1 expression', '<_> <message>')
  await waitFor(win, `document.querySelector('[aria-label="Generated LogQL query"] .cm-content')?.innerText.includes('| pattern "<_> <message>" | attempt!="4"')`, 'pattern stage before field')
  await choose('Parser 1', 'regexp'); await input('Parser 1 expression', 'status=(?P<status>\\d+)')
  await waitFor(win, `document.querySelector('[aria-label="Generated LogQL query"] .cm-content')?.innerText.includes('| regexp')`, 'regexp expression')
  await input('Parser 1 expression', '')
  await waitFor(win, `document.body.innerText.includes('Generated LogQL is not parser-valid.')`, 'invalid regexp stage')
  const parserGuardCalls=calls.length
  await button('Run','document.querySelector("[data-query-toolbar]")')
  assert.equal(calls.length,parserGuardCalls)
  await choose('Parser 1','logfmt')
  await waitFor(win, `document.querySelector('[aria-label="Generated LogQL query"] .cm-content')?.innerText.includes('| logfmt | attempt!="4"')`, 'logfmt stage')
  await choose('Parser 1','json')
  behavior.push({scenario:'parser-and-field-controls',operators:['=~','!~','=','!='],parsers:['json','pattern','regexp','logfmt'],invalidRegexpRequestDelta:0,stageOrder:'parsers before fields',setup:'existing json/field arrays injected; subsequent changes actual React events'})
  await input('Field 1 name', 'bad-field')
  await waitFor(win, `document.body.innerText.includes('Invalid Loki field name: bad-field')`, 'invalid field reason')
  const beforeInvalid = calls.length
  await button('Run', 'document.querySelector("[data-query-toolbar]")')
  assert.equal(calls.length, beforeInvalid)
  await save('cap18-invalid-desktop.png', 'Invalid field name disables Run and exposes reason')
  await input('Field 1 name', 'attempt')
  await input('Limit', '9000'); assert.equal((await state()).lokiResultLimit, 5000)
  await input('Limit', '0'); assert.equal((await state()).lokiResultLimit, 1)
  await input('Limit', '1234')
  const beforeRun = calls.length, runQuery = await query()
  await button('Run', 'document.querySelector("[data-query-toolbar]")')
  await waitFor(win, `!window.__datakoalaStore.getState().tabs[0].running && window.__datakoalaStore.getState().tabs[0].result`, 'run completed')
  assert.equal(calls.length, beforeRun + 1)
  assert.deepEqual(calls.at(-1), { id: 'audit-loki', expression: runQuery, start: '2026-08-19T16:00:00.000Z', end: '2026-08-19T17:00:00.000Z', step: '30s', limit: 1234 })
  await click('[data-time-range-field] button')
  await save('cap18-time-limit-desktop.png', 'Committed custom UTC range, request limit and open shared picker')
  await input('Start time', '16:15')
  await button('Confirm', 'document.querySelector("[role=dialog]")')
  await waitFor(win, `!window.__datakoalaStore.getState().tabs[0].running && window.__datakoalaStore.getState().tabs[0].lokiTimeRange.startTime==='16:15'`, 'custom range confirmed')
  await waitFor(win, `window.__datakoalaStore.getState().tabs[0].result`, 'custom auto-fetch')
  assert.equal(calls.length,beforeRun+2)
  assert.equal(calls.at(-1).expression,runQuery); assert.equal(calls.at(-1).start,'2026-08-19T16:15:00.000Z')
  await click('[data-time-range-field] button'); await button('Clear','document.querySelector("[role=dialog]")')
  assert.equal(await evaluate(`[...document.querySelectorAll('[role="dialog"] button')].find(e=>e.textContent.trim()==='Confirm').disabled`),true)
  await button('Cancel','document.querySelector("[role=dialog]")')
  assert.equal((await state()).lokiTimeRange.startTime,'16:15')
  await click('[data-time-range-field] button'); await button('Last hour','document.querySelector("[role=dialog]")'); await button('Confirm','document.querySelector("[role=dialog]")')
  await waitFor(win, `!window.__datakoalaStore.getState().tabs[0].running && window.__datakoalaStore.getState().tabs[0].lokiTimeRange.kind==='rolling'`, 'rolling range commit')
  assert.equal(calls.length,beforeRun+3)
  assert.equal(Date.parse(calls.at(-1).end)-Date.parse(calls.at(-1).start),3600000)
  assert.equal(calls.at(-1).limit,1234); assert.equal(calls.at(-1).expression,runQuery)
  behavior.push({scenario:'time-limit',clamps:[1,5000],limit:1234,initialCustomRequest:calls[beforeRun],customChangedRequest:calls[beforeRun+1],rollingRequest:calls[beforeRun+2],invalidConfirmDisabled:true,cancelPreservesCommittedRange:true})
  const draft = (await state()).sql
  assert.equal(draft, '{service_name="raw-draft"}')
  await button('Open in LogQL mode')
  assert.equal((await state()).sql.trim(), runQuery)
  assert.equal(calls.length, beforeRun + 3)
  await evaluate(`(() => {window.__cap18Clipboard=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>window.__cap18Clipboard.push(value)}})})()`)
  const editRaw=async value=>{
    await evaluate(`document.querySelector('[aria-label="LogQL editor"] .cm-content').focus()`)
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'a',modifiers:['control']})
    win.webContents.sendInputEvent({type:'keyUp',keyCode:'a',modifiers:['control']})
    await win.webContents.insertText(value)
    await waitFor(win,`window.__datakoalaStore.getState().tabs[0].sql===${data(value)}`,'raw editor document change')
  }
  const raw='{service_name="cap18-raw"} |= "needle"'
  await editRaw(raw)
  await button('Format','document.querySelector("[data-query-toolbar]")')
  await waitFor(win,`window.__datakoalaStore.getState().tabs[0].sql===${data(raw.replace('} |=','}\n|='))}`,'raw format response applied')
  await click('[aria-label="Copy LogQL to clipboard"]')
  assert.equal(await evaluate('window.__cap18Clipboard.at(-1)'),raw.replace('} |=','}\n|='))
  await editRaw('{service_name="cap18-format-error"}')
  await button('Format','document.querySelector("[data-query-toolbar]")')
  await waitFor(win,`document.body.innerText.includes('Synthetic CAP-18 formatter failure')`,'format failure feedback')
  assert.equal((await state()).sql,'{service_name="cap18-format-error"}')
  assert.equal(calls.length,beforeRun+3)
  behavior.push({scenario:'raw-editor-format-copy',nativeCodeMirrorEdits:true,formatted:raw.replace('} |=','}\n|='),exactSyntheticClipboard:true,failedFormatPreservesDraft:true,executionDelta:0})
  // Restored source-specific operators are state setup, not newly offered UI controls.
  await evaluate(`(() => {const s=window.__datakoalaStore;s.getState().setLokiState({lokiBuilder:{labelMatchers:[{label:'service_name',operator:'=',value:'example-service'},{label:'environment',operator:'!=',value:'dev'},{label:'pod',operator:'=~',value:'api-.+'},{label:'region',operator:'!~',value:'test|local'}],lineFilters:[{operator:'!=',value:'noise'},{operator:'|~',value:'error.*'}],parsers:[],fieldFilters:[]}});s.getState().setQueryMode('builder')})()`)
  await waitFor(win,`document.querySelector('[data-loki-builder]') && document.body.innerText.includes('Unsupported saved matcher expressions are preserved')`,'saved operator warning')
  if(!(await evaluate(`document.querySelector('[data-generated-query-panel] details').open`)))await click('[data-generated-query-panel] summary')
  const restored='{service_name="example-service", environment!="dev", pod=~"api-.+", region!~"test|local"} != "noise" |~ "error.*"'
  await exact(restored)
  await input('Line contains','replacement')
  const replaced=restored.replace('!= "noise" |~ "error.*"','|= "replacement"')
  await exact(replaced)
  assert.equal((await state()).lokiBuilder.labelMatchers.length,4)
  behavior.push({scenario:'restored-operators',setup:'saved operators injected',exactBefore:restored,exactAfterVisibleLineEdit:replaced,unsupportedMatchersPreserved:true,lineEditReplacesAllRestoredLineFilters:true})
  const beforeFallback=calls.length
  await evaluate(`window.__datakoalaStore.getState().setLokiState({lokiBuilder:{labelMatchers:[{label:'environment',operator:'=',value:'',values:[]}],lineFilters:[],parsers:[],fieldFilters:[]}})`)
  await exact('{service_name=~".+"}')
  assert.equal(calls.length,beforeFallback)
  await button('Run','document.querySelector("[data-query-toolbar]")')
  await waitFor(win,`!window.__datakoalaStore.getState().tabs[0].running`,'bounded fallback run')
  assert.equal(calls.length,beforeFallback+1); assert.equal(calls.at(-1).expression,'{service_name=~".+"}')
  const fallbackRequest=calls.at(-1)
  await evaluate(`(() => {const s=window.__datakoalaStore,st=s.getState(),p={...st.profiles[0],id:'audit-loki-no-fallback'},t={...st.tabs[0],connectionProfileId:p.id,result:null};s.setState({profiles:[p],tabs:[t],connectionStateByProfileId:{[p.id]:{status:'connected',generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:'loaded',error:null,isStale:false}}})})()`)
  await waitFor(win,`document.body.innerText.includes('An unfiltered query isn’t available for this Loki datasource')`,'no fallback safety reason')
  const disabled=await evaluate(`[...document.querySelectorAll('[data-query-toolbar] button')].find(e=>e.textContent.trim()==='Run').disabled`)
  assert.equal(disabled,true)
  await button('Run','document.querySelector("[data-query-toolbar]")')
  assert.equal(calls.length,beforeFallback+1)
  behavior.push({scenario:'incomplete-selector',fallbackRequest,noFallbackRunDisabled:true,noFallbackRequestDelta:0,providerAcceptance:false})
  const report = { sourceHead: process.env.DATAKOALA_AUDIT_HEAD ?? 'UNSPECIFIED', timezone: await evaluate('Intl.DateTimeFormat().resolvedOptions().timeZone'), execution: 'standalone module through shared Electron CI harness; synthetic IPC', calls, formats, behavior, observations }
  await writeFile(resolve(outputDir, 'measurements.json'), JSON.stringify(report, null, 2) + '\n')
  console.log('CAP18_OK ' + JSON.stringify({ calls, screenshots: observations.map(e=>e.filename) }))
}
