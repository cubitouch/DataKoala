/** CAP-18 only. Not wired into the shared runner; see the batch report.
 * Temporary execution: copy capture.mjs beside itself and replace its two
 * './audit.mjs' imports with './audit-batches/cap-18.mjs'. Never commit that copy.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles, auditRange, auditLogResult } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'

const calls = [], formats = []
export function installAuditIpc(ipc) {
  installBaseIpc(ipc)
  const handle = (name, fn) => { ipc.removeHandler(name); ipc.handle(name, fn) }
  handle('connections:loki:label-values', (_event, _id, label) => label === 'environment' ? ['production', 'staging'] : ['example-service', 'api.v2'])
  handle('connections:loki:format-query', (_event, id, query) => { formats.push({ id, query }); return query })
  handle('query:run-loki', (_event, id, request) => { calls.push({ id, ...request }); return auditLogResult })
}

export async function runVisualAudit({ win, outputDir, waitFor, capture, dragDivider }) {
  await mkdir(outputDir, { recursive: true })
  const observations = []
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
    assert.ok(measured.target.width > 0 && measured.target.height > 0)
    observations.push({ filename, description, ...measured, state: await state(), query: await query(), queryCalls: calls.length })
    await capture(win, filename)
  }
  win.show(); win.focus(); win.setContentSize(1440, 900); win.webContents.setZoomFactor(1)
  await evaluate(`(() => {const s=window.__datakoalaStore,t=JSON.parse(JSON.stringify(s.getState().tabs[0])),p=${data(auditProfiles.loki)};t.id='cap18';t.title='CAP-18';t.connectionProfileId=p.id;t.queryMode='builder';t.sql='{service_name="raw-draft"}';t.result=null;t.queryError=null;t.running=false;t.lokiResultView='list';t.lokiGroupBy=[];t.lokiTimeRange=${data(auditRange)};t.lokiResultLimit=2000;t.lokiBuilder={labelMatchers:[{label:'service_name',operator:'=',value:'example-service',values:['example-service']}],lineFilters:[],parsers:[],fieldFilters:[]};s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:'connected',generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:'loaded',error:null,isStale:false}}})})()`)
  await waitFor(win, `document.querySelector('[data-loki-builder]') && !document.querySelector('[role="combobox"][disabled]')`, 'loaded Loki')
  await dragDivider(win, '.editor-resizer', 0, 320)
  await click('[data-generated-query-panel] summary')
  await exact('{service_name="example-service"}')
  await choose('Filter by', 'environment'); await choose('environment values', 'production'); await choose('environment values', 'staging')
  await input('Line contains', 'a"b\\c')
  const composed = '{service_name="example-service", environment=~"^(?:production|staging)$"} |= "a\\"b\\\\c"'
  await exact(composed)
  assert.equal(calls.length, 0)
  await save('cap18-composition-desktop.png', 'Actual multi-value matcher and escaped line text')
  await choose('Level', 'ERROR'); await choose('Group by', 'Level')
  const levelQuery = composed.replace('environment=~', 'environment=~').replace('} |=', ', severity=~"(?i)^(?:ERROR)$"} |=')
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
  await button('Cancel', 'document.querySelector("[role=dialog]")')
  const draft = (await state()).sql
  assert.equal(draft, '{service_name="raw-draft"}')
  await button('Open in LogQL mode')
  assert.equal((await state()).sql.trim(), runQuery)
  assert.equal(calls.length, beforeRun + 1)
  const report = { sourceHead: process.env.DATAKOALA_AUDIT_HEAD ?? 'UNSPECIFIED', timezone: await evaluate('Intl.DateTimeFormat().resolvedOptions().timeZone'), execution: 'temporary isolated launcher; not canonical CI', calls, formats, observations }
  await writeFile(resolve(outputDir, 'measurements.json'), JSON.stringify(report, null, 2) + '\n')
  console.log('CAP18_OK ' + JSON.stringify({ calls, screenshots: observations.map(e=>e.filename) }))
}
