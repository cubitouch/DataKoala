/** Audit-only scenarios. The canonical capture.mjs owns Electron/window lifetime. */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assertPreviewReady } from './assertions.mjs'
import { rendererValue } from './renderer-value.mjs'
import {
  auditCaptions, auditComparisonFiles, auditKinds, auditLogResult, auditProfiles,
  auditRange, auditSchemas, auditScreenshots, auditSpanResult, auditSqlResult,
  auditTraceResult, auditViewports, auditPromSchemas,
} from './audit-fixtures.mjs'

// Audit-only, sanitized observations. All CAP-02 mutations remain in the synthetic IPC boundary.
const cap02Ipc = { active: false, tests: [], saves: [], removes: [] }
const cap03Ipc = { active: false, tests: [], saves: [], chooseFiles: 0, chooseSqlite: 0 }
const cap04Ipc = { mode: '', tests: [], saves: [], discovery: [] }
const cap05Ipc = { active: false, listCalls: 0 }
let auditIpc = null
let queryOutcome = 'success'
let releaseQuery = null
let queryCalls = 0
let cap08Stage = null
const cap10Ipc = { active: false, calls: [] }
const cap12Ipc = { active: false, exports: [] }
const capPromIpc={active:false,formatFailure:false,calls:[],deferEnvironment:false,releaseEnvironment:null,serviceFailure:false}
const cap14Ipc = { outcome:'success', calls:[], release:null }
const cap14Tree = {id:'0',plan:'Hash Join',nodeType:'Hash Join',planRows:10,totalCost:12,actualRows:12,actualTotalTime:3.2,loops:1,children:[{id:'0.0',plan:'Seq Scan',nodeType:'Seq Scan',relation:'events',schema:'example',planRows:10,totalCost:4,actualRows:12,actualTotalTime:1,loops:1},{id:'0.1',plan:'Index Scan',nodeType:'Index Scan',relation:'lookup',schema:'example',index:'lookup_pkey',planRows:10,totalCost:5,actualRows:12,actualTotalTime:1.4,loops:1}]}
const delay = (ms) => new Promise((done) => setTimeout(done, ms))

export function installAuditIpc(ipc) {
  auditIpc=ipc
  const handle = (channel, fn) => { ipc.removeHandler(channel); ipc.handle(channel, fn) }
  const result = async (id, sql, event, request, parameters = []) => {
    queryCalls += 1
    if (cap10Ipc.active) cap10Ipc.calls.push({ id, sql, parameters, request: request ?? null })
    if (cap08Stage) console.log(`CAP08 query at ${cap08Stage}: ${id}`)
    const outcome = queryOutcome
    if (outcome === 'loading') {
      if (String(id).includes('tempo') && request?.progressRequestId && !request.sampleSize) event.sender.send('query:progress', { requestId:request.progressRequestId, progress:{provider:'tempo',coveredMs:1800000,totalMs:3600000,completedChunks:1,pendingChunks:1,queriesCompleted:1,tracesFound:2,rows:auditTraceResult.rows.slice(0,2)} })
      await new Promise((done) => { releaseQuery = done })
    }
    if (outcome === 'query-error') return {ok:false,message:'Synthetic SQL error: column missing_column does not exist',kind:'query'}
    if (outcome === 'error') return { ok: false, message: 'Synthetic provider unavailable. Try Run again.', kind: 'connection' }
    return { ok: true, result: String(id).includes('tempo') ? (/^[a-f0-9]{32}$/.test(String(sql).trim()) ? auditSpanResult : auditTraceResult) : auditSqlResult }
  }
  handle('connections:prometheus:metric-labels',(_event,id,metric)=>{
    if(!capPromIpc.active)return ['continent','environment','service','le','__name__']
    capPromIpc.calls.push({kind:'labels',id,metric})
    return ['environment','service','region','instance',...(metric.endsWith('_bucket')?['le']:[])]
  })
  handle('connections:prometheus:label-values',async (_event,id,metric,label)=>{
    if(!capPromIpc.active)return label==='environment'?['production','staging']:label==='continent'?['Europe','Asia']:['api','worker']
    capPromIpc.calls.push({kind:'values',id,metric,label})
    if(label==='environment'&&capPromIpc.deferEnvironment)return new Promise(done=>{capPromIpc.releaseEnvironment=()=>done(['production','staging'])})
    if(label==='service'&&capPromIpc.serviceFailure)throw Error('Synthetic upstream label values failure')
    return label==='environment'?['production','staging']:label==='region'?[]:label==='instance'?Array.from({length:200},(_,i)=>'instance-'+String(i).padStart(3,'0')):['api','worker']
  })
  handle('connections:prometheus:format-query',(_event,_id,query)=>{if(capPromIpc.active&&capPromIpc.formatFailure)throw Error('Synthetic PromQL formatting failure');return query})
  handle('query:explain',async (_event,id,sql,analyze)=>{
    cap14Ipc.calls.push({id,sql,analyze})
    const outcome=cap14Ipc.outcome
    if(outcome==='pending')await new Promise(done=>{cap14Ipc.release=()=>{cap14Ipc.release=null;done()}})
    if(outcome==='error')throw Error('Synthetic EXPLAIN provider failure')
    return {text:analyze?'Synthetic analyzed plan':'Synthetic estimated plan',tree:cap14Tree,analyze,planningTimeMs:0.6,...(analyze?{executionTimeMs:3.8}:{})}
  })
  handle('export:save-text', (_event, opts) => { if (!cap12Ipc.active) throw Error('Unexpected export outside CAP-12'); cap12Ipc.exports.push(opts); return null })
  handle('query:run', (event, id, sql, parameters, request) => result(id, sql, event, request, parameters))
  handle('query:run-loki', async (_event, id, request) => {
    const value = await result(id, request.expression)
    if (!value.ok) throw new Error(value.message)
    return auditLogResult
  })
  handle('connections:loki:labels', () => ['service_name', 'environment', 'severity'])
  handle('connections:loki:label-values', () => ['example', 'example-service'])
  handle('connections:loki:format-query', (_event, _id, query) => query)
  handle('connections:tempo:attributes', () => [])
  handle('connections:tempo:attribute-values', () => ['example'])
  for (const kind of ['prometheus', 'tempo', 'loki']) handle(`connections:${kind}:${kind === 'loki' ? 'discover' : 'discover-datasources'}`, (_event, transport) => {
    if (cap04Ipc.mode) cap04Ipc.discovery.push({kind,context:transport?.context??null})
    return cap04Ipc.mode === kind ? [] : [{ uid: `example-${kind}`, name: `Example ${kind}`, type: kind }]
  })
  handle('connections:bigquery:discover-projects', () => [{ projectId: 'example-project', name: 'Example project' }])
  handle('connections:bigquery:discover-defaults', () => ({ projectId: 'example-project', billingProject: 'example-project', location: 'EU' }))
  handle('connections:bigquery:list-datasets', () => [{ datasetId: 'example', projectId: 'example-project' }])
  handle('connection:describe-table', () => auditSqlResult.columns)
  handle('connection:list-objects', () => { if (cap05Ipc.active) { cap05Ipc.listCalls++; return auditSchemas.flatMap(schema => schema.relations.filter(relation => relation.kind === 'r').map(relation => ({ ...relation, schema: schema.name }))) } return [] })
  handle('connection:test', (_event, profile) => {
    if (cap02Ipc.active) cap02Ipc.tests.push({id:profile.id,host:profile.host,readonly:profile.readonly})
    if (cap04Ipc.mode) cap04Ipc.tests.push({kind:profile.kind,transport:profile.transport,grafana:profile.grafana??null})
    if (cap03Ipc.active) cap03Ipc.tests.push({kind:profile.kind,name:profile.name,readonly:profile.readonly,files:profile.files, path:profile.path, billingProject:profile.billingProject,maximumBytesBilled:profile.maximumBytesBilled})
    return { ok: true, serverVersion: '17' }
  })
  handle('connections:upsert', (_event, profile) => {
    if (cap04Ipc.mode) { cap04Ipc.saves.push({kind:profile.kind,transport:profile.transport,grafana:profile.grafana??null}); return profile }
    if (cap03Ipc.active) { cap03Ipc.saves.push({kind:profile.kind,name:profile.name,readonly:profile.readonly,files:profile.files,path:profile.path,billingProject:profile.billingProject,maximumBytesBilled:profile.maximumBytesBilled}); return profile }
    if (!cap02Ipc.active) throw Error('Unexpected profile save outside CAP-02')
    cap02Ipc.saves.push({id:profile.id,host:profile.host,readonly:profile.readonly})
    return { ...profile, password: '' }
  })
  handle('connection:choose-files', () => { cap03Ipc.chooseFiles++; return ['/samples/Region.csv','/samples/region.CSV','/samples/details.parquet'] })
  handle('connection:choose-sqlite-file', () => { cap03Ipc.chooseSqlite++; return '/samples/example.sqlite3' })
  handle('connections:remove', (_event, id) => {
    if (!cap02Ipc.active) throw Error('Unexpected profile removal outside CAP-02')
    cap02Ipc.removes.push(id)
    return true
  })
  handle('ai:models', () => ({ ok: true, value: [{ id: 'example-model', name: 'Example model' }] }))
  handle('ai:cancel', () => ({ ok: true, value: null }))
}

// A capture must have an asserted live target; never infer success from a PNG alone.
export function validateAuditObservation(name, observation) {
  if (!auditScreenshots.includes(name)) throw new Error(`Unknown audit screenshot: ${name}`)
  if (!observation.target || observation.target.width <= 0 || observation.target.height <= 0) throw new Error(`${name}: missing visible target`)
  if (observation.zoom !== 1 || observation.scale !== 1) throw new Error(`${name}: incomparable zoom/device scale`)
}

export async function runVisualAudit({ win, outputDir, waitFor, capture, dragDivider }) {
  await mkdir(outputDir, { recursive: true })
  // Clear only files owned by this mode, never regression/documentation output.
  for (const name of [...auditScreenshots, ...auditComparisonFiles, 'measurements.json', 'review.html']) await rm(resolve(outputDir, name), { force: true })
  win.show()
  win.focus()
  win.webContents.setZoomFactor(1)
  const observations = []
  const contacts = { lists: [], toolbar: [], dialogs: [], feedback: [], selectors: [], detail: [] }
  const evaluate = (expression) => win.webContents.executeJavaScript(expression).catch((error) => {
    console.error(`Audit renderer evaluation failed: ${expression.slice(0, 180)}`, error)
    throw error
  })
  const settle = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  const select = (selector) => `document.querySelector(${rendererValue(selector)})`
  const click = async (selector) => {
    await waitFor(win, select(selector), `click target ${selector}`)
    await evaluate(`${select(selector)}.click()`)
    await settle()
  }
  const clickText = async (label, scopeSelector = null) => {
    const scope = scopeSelector === null ? 'document' : select(scopeSelector)
    const expression = `[...${scope}.querySelectorAll('button')].find(button => button.textContent.trim() === ${rendererValue(label)})`
    await waitFor(win, expression, `button ${label}`)
    await evaluate(`${expression}.click()`)
    await settle()
  }
  const key = async (keyCode, modifiers = []) => {
    const electronKeyCode = keyCode.startsWith('Arrow') ? keyCode.slice(5) : keyCode
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: electronKeyCode, modifiers })
    if (keyCode === 'Enter') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: electronKeyCode, modifiers })
    await settle()
  }
  const type = async (selector, value) => {
    await evaluate(`(() => { const input = ${select(selector)}; if (!input) throw Error('Missing input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${rendererValue(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); })()`)
    await settle()
  }
  const typeLabel = async (label, value) => {
    await evaluate(`(() => {
      const fieldLabel=[...document.querySelectorAll('label')].find(node=>node.textContent.trim()===${rendererValue(label)})
      const input=fieldLabel?.htmlFor ? document.getElementById(fieldLabel.htmlFor) : fieldLabel?.querySelector('input')
      if (!(input instanceof HTMLInputElement)) throw Error('Missing labeled input: '+${rendererValue(label)})
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${rendererValue(value)})
      input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))
    })()`)
    await settle()
  }
  const observe = async (filename, selector, state, group) => {
    await waitFor(win, `${select(selector)}?.getBoundingClientRect().height > 0`, filename)
    await settle()
    const data = await evaluate(`(() => {
      const geometry = element => { if (!element) return null; const r=element.getBoundingClientRect(), s=getComputedStyle(element); return { tag: element.tagName, role: element.getAttribute('role'), label: element.getAttribute('aria-label'), text: element.textContent.trim().slice(0,100), x:r.x,y:r.y,width:r.width,height:r.height,padding:s.padding,gap:s.gap,font:s.fontFamily,fontSize:s.fontSize,lineHeight:s.lineHeight,background:s.backgroundColor,border:s.border,outline:s.outline,zIndex:s.zIndex,backdropFilter:s.backdropFilter,borderRadius:s.borderRadius,overflow:s.overflow,whiteSpace:s.whiteSpace,scrollWidth:element.scrollWidth,clientWidth:element.clientWidth,scrollHeight:element.scrollHeight,clientHeight:element.clientHeight,selected:element.getAttribute('aria-selected'),pressed:element.getAttribute('aria-pressed'),disabled:element.disabled===true,hover:element.matches(':hover'),focusVisible:element.matches(':focus-visible'),svg:element.querySelectorAll('svg').length } }
      const target = ${select(selector)}
      const first = target?.querySelector('button')
      return { target:geometry(target), overlay:geometry(target.parentElement), children:[...target.querySelectorAll('button,input,[role="combobox"],h2,h3,code,time,[data-severity],svg')].slice(0,65).map(geometry), active:geometry(document.activeElement), targetContainsFocus:target.contains(document.activeElement), renderedRows:target.querySelectorAll('article,button[class*=traceResult_]').length, scrollables:[...target.querySelectorAll('div')].filter(e=>e.scrollHeight>e.clientHeight+2 && ['auto','scroll'].includes(getComputedStyle(e).overflowY)).map(geometry).slice(0,3), documentOverflow:document.documentElement.scrollWidth-innerWidth, pane:geometry(document.querySelector('.main')), bodyText:document.body.innerText.slice(-900), firstRow:first ? {button:geometry(first), wrapper:geometry(first.parentElement),content:geometry(first.querySelector('code') ?? first.querySelector('span:not([data-log-row-chevron])')), trailing:geometry(first.lastElementChild)} : null }
    })()`)
    if (filename === 'cap09-resized-workspace-desktop.png') console.log(`CAP09_CAPTURE_DOM ${JSON.stringify({target:data.target,active:data.active,targetContainsFocus:data.targetContainsFocus,bodyText:data.bodyText})}`)
    const observation = { filename, state, viewport: win.getContentSize(), zoom: win.webContents.getZoomFactor(), scale: await evaluate('devicePixelRatio'), ...data }
    validateAuditObservation(filename, observation)
    observations.push(observation)
    await writeFile(resolve(outputDir, 'measurements.json'), JSON.stringify({schemaVersion:1,sourceHead:process.env.DATAKOALA_AUDIT_HEAD??'local-working-tree',observations}, null, 2))
    await capture(win, filename)
    if (filename === 'cap09-resized-workspace-desktop.png') {
      const png = await win.webContents.capturePage()
      console.log(`CAP09_PNG_BASE64 ${png.toPNG().toString('base64')}`)
    }
    if (filename.startsWith('cap10-')) {
      const png = await win.webContents.capturePage()
      console.log('CAP10_PNG_BASE64 ' + filename + ' ' + png.toPNG().toString('base64'))
    }
    if (group) {
      const r = observation.target
      const clip = { x: Math.max(0, Math.floor(r.x)), y: Math.max(0, Math.floor(r.y + (group === 'feedback' ? 260 : 0))), width: Math.min(Math.floor(r.width), win.getContentSize()[0]-Math.max(0,Math.floor(r.x))), height: Math.min(group === 'dialogs' ? 240 : group === 'feedback' ? 220 : 150, Math.ceil(r.height), win.getContentSize()[1]-Math.max(0,Math.floor(r.y))) }
      const image = await win.webContents.capturePage(clip)
      contacts[group].push({ filename, width:clip.width, height:clip.height, data:image.toDataURL() })
    }
    console.log(`AUDIT ${filename}: ${Math.round(data.target.width)}x${Math.round(data.target.height)}`)
  }
  const seed = async (kind, mode = 'raw', result = 'default', view = 'list', builderHasRun = true) => {
    queryOutcome = 'success'
    await evaluate(`(() => {
      const store=window.__datakoalaStore, state=store.getState();
      window.__auditBaseTab ??= JSON.parse(JSON.stringify(state.tabs[0]));
      const tab=JSON.parse(JSON.stringify(window.__auditBaseTab));
      const kind=${rendererValue(kind)}, profile=${rendererValue(auditProfiles[kind])};
      tab.id='audit-tab-'+kind; tab.title='Visual audit'; tab.connectionProfileId=profile.id; tab.queryMode=${rendererValue(mode === 'builder' ? 'builder' : 'sql')};
      tab.running=false;tab.pendingQuery=null;tab.pendingResult=null;tab.pendingLokiQuery=null;tab.activeExplainRequest=null;tab.queryError=null;tab.result=null;tab.sqlResultFilters=[];tab.builderResultFilters=[];
      tab.sql=kind==='tempo'?'{ true }':kind==='loki'?'{service_name="example-service"}':kind==='prometheus'?'up':'select category, value from example.events';
      tab.builder={...tab.builder,table:{schema:'example',name:'events'},seriesColumns:[]};tab.builderHasRun=${rendererValue(builderHasRun)};
      const config={...tab.sqlVisualization,view:'table',xColumn:'category',valueColumn:'value',seriesColumns:[],seriesColumn:null};tab.sqlVisualization=config;tab.builderVisualization=config;
      tab.promqlBuilder={...tab.promqlBuilder,metric:'up'};
      tab.lokiBuilder={labelMatchers:[{label:'service_name',operator:'=',value:'example-service'}],lineFilters:[],parsers:[],fieldFilters:[]};tab.lokiResultView=${rendererValue(view)};
      tab.tempoBuilder={...tab.tempoBuilder,serviceNamespace:'example',service:'example-service'};tab.tempoResultView='list';tab.tempoSampleSize='250';
      tab.tempoTimeRange=${rendererValue(auditRange)};tab.lokiTimeRange=${rendererValue(auditRange)};tab.prometheusTimeRange=${rendererValue(auditRange)};
      if (${rendererValue(result)} === 'default') tab.result=kind==='tempo'?${rendererValue(auditTraceResult)}:kind==='loki'?${rendererValue(auditLogResult)}:${rendererValue(auditSqlResult)};
      tab.resultRevision=(state.tabs[0]?.resultRevision??0)+1;
      let schemas=kind==='prometheus'?[{name:'Metrics',isSystem:false,relations:[{schema:'Metrics',name:'up',qualifiedName:'Metrics.up',kind:'metric',columnsStatus:'idle',details:{kind:'metric',type:'gauge',help:'Example metric'}}]}]:${rendererValue(auditSchemas)};
      if(kind!=='prometheus') schemas=schemas.map(schema=>({...schema,relations:schema.relations.filter(r=>kind==='tempo'?r.kind==='service':r.kind==='r')}));
      store.setState({profiles:[profile],tabs:[tab],activeTabId:tab.id,connectionStateByProfileId:{[profile.id]:{status:'connected',generation:1,error:null,serverVersion:kind==='postgres'?'17':null}},metadataByProfileId:{[profile.id]:{schemas,status:'loaded',error:null,isStale:false}}});
    })()`)
    await waitFor(win, `window.__datakoalaStore.getState().activeTabId === ${rendererValue('audit-tab-'+kind)} && document.body.innerText.includes(${rendererValue('Example '+kind)})`, `seed ${kind}`)
    await settle()
    win.webContents.sendInputEvent({ type:'mouseMove', x:1,y:1 })
    await delay(100)
    const bounds=await evaluate(`(() => { const handle=document.querySelector('.editor-resizer')?.getBoundingClientRect(), main=document.querySelector('.main')?.getBoundingClientRect(); return handle && main ? {delta:main.top+300-handle.top}:null })()`)
    if(!bounds) throw Error('Missing real editor resize handle')
    if(Math.abs(bounds.delta)>1) await dragDivider(win,'.editor-resizer',0,Math.round(bounds.delta))
  }
  const listSelectors = { logs:'[aria-label="Log results"]', patterns:'[aria-label="Log patterns"]', traces:'[aria-label="Trace search result view"]' }
  const rowSelectors = { logs:'[aria-label="Log results"] button[aria-selected]', patterns:'[data-pattern-row] button', traces:'button[class*="traceResult_"]' }
  const listTarget = { ...listSelectors, traces:'div[class*="traceList_"]' }

  for (const [viewport, dimensions] of Object.entries(auditViewports)) {
    win.setContentSize(...dimensions)
    await settle()
    const sidebarDelta=await evaluate(`240-document.querySelector('[aria-label="Resize sidebar"]').getBoundingClientRect().left`)
    if(Math.abs(sidebarDelta)>1) await dragDivider(win,'[aria-label="Resize sidebar"]',Math.round(sidebarDelta),0)
    await waitFor(win, `Math.abs(document.querySelector('[aria-label="Resize sidebar"]').getBoundingClientRect().left-240)<=1`, 'fixed sidebar width')
    for (const kind of auditKinds) for (const mode of ['raw','builder']) {
      await seed(kind, mode)
      await waitFor(win, `[...document.querySelectorAll('[aria-label="Query mode"] button')].some(b=>b.getAttribute('aria-pressed')==='true' && b.textContent.trim() === ${rendererValue(mode==='builder'?'Builder':kind==='tempo'?'TraceQL':kind==='loki'?'LogQL':kind==='prometheus'?'PromQL':'SQL')})`, `${kind} ${mode} mode`)
      const language=kind==='tempo'?'TraceQL':kind==='loki'?'LogQL':kind==='prometheus'?'PromQL':'SQL'
      await waitFor(win, mode==='raw'?select(`[aria-label="${language} editor"]`):kind==='loki'?`document.querySelector('[data-loki-builder]')`:kind==='tempo'?`document.querySelector('[data-tempo-builder]')`:kind==='prometheus'?`document.querySelector('.promql-builder-form')`:`document.querySelector('.builder-pane')`, `${kind} rendered ${mode} component`)
      await observe(`${kind}-${mode}-${viewport}.png`, '[data-query-toolbar]', `${mode} populated`, viewport==='desktop' && mode==='raw' && ['postgres','loki','tempo'].includes(kind) ? 'toolbar' : null)
    }
    for (const list of ['logs','patterns','traces']) {
      const kind=list==='traces'?'tempo':'loki'
      await seed(kind,'raw','default',list==='patterns'?'patterns':'list')
      const row=rowSelectors[list], target=listTarget[list]
      await waitFor(win, select(row), `${list} actual openable row`)
      await observe(`${list}-default-${viewport}.png`,target,'unselected + one-line and overflowing text','lists')
      const point=await evaluate(`(() => { const r=${select(row)}.getBoundingClientRect(); return { x:Math.round(r.x+20), y:Math.round(r.y+r.height/2) } })()`)
      win.webContents.sendInputEvent({ type:'mouseMove', ...point }); await delay(80)
      await waitFor(win, `${select(row)}.matches(':hover')`, `${list} hover state`)
      await observe(`${list}-hover-${viewport}.png`,target,'native pointer hover')
      win.webContents.sendInputEvent({ type:'mouseMove', x:1,y:1 })
      await key('Tab'); await evaluate(`${select(row)}.focus()`); await settle()
      await waitFor(win, `${select(row)}.matches(':focus-visible')`, `${list} keyboard focus visible`)
      await observe(`${list}-focus-${viewport}.png`,target,'keyboard modality + row focus',viewport==='desktop'?'lists':null)
      await key('Enter')
      await waitFor(win, list==='traces'?`document.body.innerText.includes('Search trace spans')`:list==='patterns'?`document.querySelector('[data-pattern-inspector]')`:`document.querySelector('[aria-label="Selected log details"]')`,`${list} Enter opens actual detail`)
      await observe(`${list}-open-${viewport}.png`,list==='traces'?'[class*="traceView_"]':target,'native Enter opens detail','detail')
      if(list==='traces') await clickText('← Search results')
      else await click(`[aria-label="Close ${list==='patterns'?'pattern':'log'} details"]`)
      await evaluate(`(() => { const row=${select(row)}; const scroller=${list==='patterns'?'document.querySelector("[data-pattern-scroller]")':list==='logs'?'row.closest("div[class*=logScroller]")':'row.parentElement'}; scroller.scrollTop=scroller.scrollHeight; })()`)
      await settle();await delay(80)
      await observe(`${list}-scroll-${viewport}.png`,target,'scrolled loaded list; virtualization where supported')
      await seed(kind,'raw', 'fresh',list==='patterns'?'patterns':'list')
      if(list==='traces') await observe(`${list}-empty-${viewport}.png`,'[class*="searchResults_"]','no fetched traces')
      else {
        await evaluate(`window.__datakoalaStore.getState().setResult(${rendererValue({...auditLogResult,rows:[],logRows:[],rowCount:0})},null)`)
        await settle()
        await observe(`${list}-empty-${viewport}.png`,target,'loaded zero logs')
      }
    }
    for (const kind of ['postgres','loki','tempo']) {
      await seed(kind,'raw','fresh')
      await observe(`${kind}-fresh-${viewport}.png`,'.main','not queried')
      queryOutcome='loading';await clickText('Run','[data-query-toolbar]')
      await waitFor(win, `window.__datakoalaStore.getState().tabs[0].running`, `${kind} pending query`)
      await observe(`${kind}-loading-${viewport}.png`,'.main','actual unresolved IPC request')
      if(!releaseQuery) await delay(200)
      if(!releaseQuery) throw Error(`${kind} request never reached mocked IPC`)
      releaseQuery();releaseQuery=null;await waitFor(win, `!window.__datakoalaStore.getState().tabs[0].running`,`${kind} completion`)
      if(kind==='postgres') {
        await clickText('Bar', '[role="toolbar"][aria-label="Result view"]')
        await assertPreviewReady(win, `postgres-error-chart-${viewport}.png`,{selector:'[data-result-chart-canvas]',description:'settled chart before failure',minSeries:1,minItems:3})
      }
      queryOutcome='error';await clickText('Run','[data-query-toolbar]')
      await waitFor(win, `document.body.innerText.includes('Synthetic provider unavailable')`,`${kind} failure`)
      if(kind==='postgres') {
        const beforeCalls=queryCalls
        const chartVisibleDuringError=await evaluate('Boolean(document.querySelector("[data-result-chart-canvas] canvas"))')
        await observe(`postgres-error-chart-${viewport}.png`,'.main','previously settled chart retained after failure',viewport==='desktop'?'feedback':null)
        await clickText('Table', '[role="toolbar"][aria-label="Result view"]')
        await settle()
        const tableVisibleDuringError=await evaluate('Boolean(document.querySelector("[data-result-table-pane] table"))')
        if(queryCalls!==beforeCalls) throw Error('Error-view switch unexpectedly ran query')
        observations.push({family:'error-retention',viewport,retainedRows:await evaluate('window.__datakoalaStore.getState().tabs[0].result.rows.length'),tableVisibleDuringError,chartVisibleDuringError})
      }
      await observe(`${kind}-error-${viewport}.png`,'.main','actual failure; retained result display is view-specific',viewport==='desktop'?'feedback':null)
      queryOutcome='success';await clickText('Run','[data-query-toolbar]')
      await waitFor(win, `!window.__datakoalaStore.getState().tabs[0].running && !document.body.innerText.includes('Synthetic provider unavailable')`,`${kind} explicit retry`)
      await observe(`${kind}-retry-${viewport}.png`,'.main','explicit Run recovers')
    }
    await seed('tempo','raw','fresh')
    await evaluate(`window.__datakoalaStore.getState().setTempoState({tempoSampleSize:'all'})`)
    queryOutcome='loading';await clickText('Run','[data-query-toolbar]')
    await waitFor(win, `document.querySelector('progress') && document.body.innerText.includes('2 traces so far')`, 'real progressive batch')
    await observe(`tempo-partial-${viewport}.png`,'.main','actual IPC progress batch + pending continuation')
    observations.push({family:'progress',viewport,mapDisabled:await evaluate(`[...document.querySelector('[aria-label="Trace search result view"]').querySelectorAll('button')].find(b=>b.textContent.trim()==='Service map').disabled`),rowsDisabled:await evaluate(`[...document.querySelectorAll('button[class*="traceResult_"]')].every(b=>b.disabled)`)} )
    releaseQuery();releaseQuery=null
    await waitFor(win, `!window.__datakoalaStore.getState().tabs[0].running && document.body.innerText.includes('5 traces')`, 'progress completion')
    await observe(`tempo-partial-complete-${viewport}.png`,'.main','progress finalized to five summaries')
    for (const kind of ['postgres','loki','tempo']) {
      await seed(kind,'raw')
      const target=kind==='tempo'?'[aria-label="Trace search result view"]':'[role="toolbar"][aria-label="Result view"]'
      await observe(`views-${kind}-default-${viewport}.png`,target,'current selected view')
      const beforeCalls=queryCalls
      const next=kind==='tempo'?'Scatter':kind==='loki'?'Patterns':'Table'
      if(kind==='postgres') await clickText('Bar',target)
      else await clickText(next,target)
      await waitFor(win, `${select(target)}.querySelector('[aria-pressed="true"]').textContent.trim() === ${rendererValue(kind==='postgres'?'Bar':next)}`,`${kind} view transition`)
      if(kind==='postgres' || kind==='tempo') await assertPreviewReady(win, `views-${kind}-changed-${viewport}.png`, {selector:kind==='postgres'?'[data-result-chart-canvas]':'[data-visual-type=\"scatter\"]',description:'audit selected chart',minSeries:1,minItems:3})
      if(queryCalls!==beforeCalls) throw Error(`${kind} view change unexpectedly executed a query`)
      observations.push({family:'view',kind,viewport,queryCallsBefore:beforeCalls,queryCallsAfter:queryCalls})
      await observe(`views-${kind}-changed-${viewport}.png`,target,'view switched through actual control')
    }
    for (const kind of ['postgres','tempo']) {
      await seed(kind,'builder')
      const target=kind==='postgres'?'.builder-pane':'[data-tempo-builder]'
      for(const status of ['loading','error','settled']) {
        await evaluate(`(() => { const store=window.__datakoalaStore; const state=store.getState(),id=state.tabs[0].connectionProfileId; store.setState({metadataByProfileId:{...state.metadataByProfileId,[id]:{...state.metadataByProfileId[id],status:${rendererValue(status==='settled'?'loaded':status)},error:${rendererValue(status==='error'?'Synthetic metadata unavailable':null)}}}}) })()`)
        await settle()
        if(status==='error') await waitFor(win, `document.body.innerText.includes('Synthetic metadata unavailable')`,`${kind} metadata error`)
        await observe(`metadata-${kind}-${status}-${viewport}.png`,target,'injected metadata presentation; retry is not executed')
      }
    }
    for(const surface of ['query','log']) {
      await waitFor(win, `!document.body.innerText.includes('Copied to clipboard')`, 'previous copy feedback cleared')
      await seed(surface==='query'?'postgres':'loki','raw')
      if(surface==='log') await click(rowSelectors.logs)
      await evaluate(`(() => { window.__auditClipboardRejections=[]; if(!window.__auditClipboardObserver) { window.__auditClipboardObserver=true; window.addEventListener('unhandledrejection',e=>{ if(e.reason?.message==='Synthetic clipboard denied') { window.__auditClipboardRejections.push(e.reason.message); e.preventDefault() } }); } Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(Error('Synthetic clipboard denied'))}}) })()`)
      const selector=surface==='query'?'[aria-label="Copy SQL to clipboard"]':'[aria-label="Copy message"]'
      await click(selector)
      await waitFor(win, surface==='query'?`document.body.innerText.includes('Could not copy')`:`window.__auditClipboardRejections.length>0`, `${surface} denied clipboard`)
      const failure=await evaluate(`(() => { const node=[...document.querySelectorAll('[role="alert"],[role="status"]')].find(e=>e.textContent.includes('Could not copy')); return node?{text:node.textContent.trim(),role:node.getAttribute('role'),live:node.getAttribute('aria-live')}:null })()`)
      if(surface==='query' && JSON.stringify(failure)!==JSON.stringify({text:'Could not copy: Synthetic clipboard denied',role:'alert',live:'assertive'})) throw Error(`CAP-09 query copy denial feedback mismatch: ${JSON.stringify(failure)}`)
      await observe(`clipboard-${surface}-error-${viewport}.png`,surface==='query'?'[role="alert"]':'[aria-label="Selected log details"]','synthetic clipboard denial through actual caller')
      observations.push({family:'clipboard',surface,viewport,state:'error',unhandled:await evaluate('window.__auditClipboardRejections.length'),notification:failure,osClipboard:'Synthetic navigator.clipboard rejection only; native OS permission/pasteboard not tested'})
      await evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.resolve()}})`)
      await click(selector)
      if(surface==='query') await waitFor(win, `document.body.innerText.includes('Copied to clipboard')`, 'copy success feedback')
      const success=await evaluate(`(() => { const node=[...document.querySelectorAll('[role="alert"],[role="status"]')].find(e=>e.textContent.includes('Copied to clipboard')); return node?{text:node.textContent.trim(),role:node.getAttribute('role'),live:node.getAttribute('aria-live')}:null })()`)
      if(surface==='query' && JSON.stringify(success)!==JSON.stringify({text:'Copied to clipboard',role:'status',live:'polite'})) throw Error(`CAP-09 query copy recovery feedback mismatch: ${JSON.stringify(success)}`)
      if(surface==='query' && !await evaluate(`!document.querySelector('[role="alert"]')`)) throw Error('CAP-09 successful retry did not replace the copy error')
      await observe(`clipboard-${surface}-success-${viewport}.png`,surface==='query'?'[role="status"][aria-live="polite"]:not([data-state])':'[aria-label="Selected log details"]','synthetic successful clipboard retry through actual caller')
      if(surface==='query') observations.push({family:'notification-feedback',surface,viewport,failure,success,recoveryReplacedAlert:!await evaluate(`Boolean(document.querySelector('[role="alert"]'))`),nativeClipboard:'not tested'})
    }
    if(viewport==='desktop') {
      await seed('postgres','raw')
      const layout=()=>evaluate(`(() => { const rect=s=>document.querySelector(s)?.getBoundingClientRect(); const sidebar=rect('.workspace > :first-child'),workspace=rect('.workspace'),main=rect('.main'),handle=document.querySelector('[aria-label="Resize sidebar"]'),editorHandle=document.querySelector('.editor-resizer'),editor=rect('[data-query-editor]'),toolbar=rect('[data-query-toolbar]'),sqlControl=rect('[aria-label="SQL editor"]'),results=rect('[data-result-explorer]'); return {sidebarWidth:Math.round(sidebar?.width??0),sidebarRight:Math.round(sidebar?.right??0),sidebarValue:Number(handle?.getAttribute('aria-valuenow')),sidebarMin:Number(handle?.getAttribute('aria-valuemin')),sidebarMax:Number(handle?.getAttribute('aria-valuemax')),editorValue:Number(editorHandle?.getAttribute('aria-valuenow')),editorMin:Number(editorHandle?.getAttribute('aria-valuemin')),editorMax:Number(editorHandle?.getAttribute('aria-valuemax')),editorTop:Math.round(editor?.top??0),editorBottom:Math.round(editor?.bottom??0),resultsTop:Math.round(results?.top??0),resultsBottom:Math.round(results?.bottom??0),mainLeft:Math.round(main?.left??0),mainRight:Math.round(main?.right??0),workspaceRight:Math.round(workspace?.right??0),toolbarVisible:Boolean(toolbar&&toolbar.width>0&&toolbar.height>0),sqlControlVisible:Boolean(sqlControl&&sqlControl.width>0&&sqlControl.height>0),rowsVisible:Boolean(editor&&results&&editor.width>0&&results.width>0&&editor.height>0&&results.height>0)} })()`)
      await waitFor(win, `Boolean(document.querySelector('[data-query-toolbar]')) && Boolean(document.querySelector('[aria-label="SQL editor"]'))`, 'CAP-09 usable SQL editor after seed')
      const before=await layout()
      await dragDivider(win,'[aria-label="Resize sidebar"]',80,0)
      await dragDivider(win,'.editor-resizer',0,64)
      const pointer=await layout()
      if(pointer.sidebarValue!==before.sidebarValue+80||pointer.editorValue!==before.editorValue+64||pointer.sidebarWidth!==pointer.sidebarValue) throw Error(`CAP-09 pointer splitter delta mismatch: ${JSON.stringify({before,pointer})}`)
      if(pointer.editorBottom>pointer.resultsTop+2||pointer.sidebarRight>pointer.mainLeft+2||pointer.mainRight>pointer.workspaceRight||!pointer.rowsVisible) throw Error(`CAP-09 split workspace overlaps or became unusable: ${JSON.stringify(pointer)}`)
      await evaluate(`document.querySelector('[aria-label="Resize sidebar"]').focus()`)
      await key('ArrowLeft')
      await evaluate(`document.querySelector('.editor-resizer').focus()`)
      await key('ArrowUp')
      const keyboard=await layout()
      if(keyboard.sidebarValue!==pointer.sidebarValue-16||keyboard.editorValue!==pointer.editorValue-16) throw Error(`CAP-09 keyboard splitter delta mismatch: ${JSON.stringify({pointer,keyboard})}`)
      await dragDivider(win,'[aria-label="Resize sidebar"]',2000,0)
      await dragDivider(win,'.editor-resizer',0,2000)
      const maximum=await layout()
      if(maximum.sidebarValue!==maximum.sidebarMax||maximum.editorValue!==maximum.editorMax||maximum.editorBottom>maximum.resultsTop+2||!maximum.rowsVisible) throw Error(`CAP-09 splitter maximum clamp failed: ${JSON.stringify(maximum)}`)
      await dragDivider(win,'[aria-label="Resize sidebar"]',-2000,0)
      await dragDivider(win,'.editor-resizer',0,-2000)
      const minimum=await layout()
      if(minimum.sidebarValue!==minimum.sidebarMin||minimum.editorValue!==minimum.editorMin||minimum.editorBottom>minimum.resultsTop+2||!minimum.rowsVisible) throw Error(`CAP-09 splitter minimum clamp failed: ${JSON.stringify(minimum)}`)
      await dragDivider(win,'[aria-label="Resize sidebar"]',60,0)
      await dragDivider(win,'.editor-resizer',0,90)
      const final=await layout()
      if(final.editorBottom>final.resultsTop+2||!final.rowsVisible) throw Error(`CAP-09 final resized workspace unusable: ${JSON.stringify(final)}`)
      await observe('cap09-resized-workspace-desktop.png','.main','workspace after real pointer resizing plus keyboard interaction; bounded controls')
      observations.push({family:'workspace-splitter',viewport,before,pointer,keyboard,maximum,minimum,final,interaction:'actual Electron pointer drag and focused ArrowLeft/ArrowUp; localStorage write path exercised but no restart persistence claimed',owner:'App.tsx + shared layoutDimensions.ts; app sidebar/editor splitters are distinct from ResizableDetailPanel and chart legend resize'})
    }
    for (const dialog of ['picker',...auditKinds,'settings','reset','presets']) {
      await seed('postgres','raw')
      if(['settings','reset','presets'].includes(dialog)) await clickText(dialog==='settings'?'Settings':dialog==='reset'?'Reset':'Presets')
      else {
        await clickText('+ new connection')
        if(dialog!=='picker') await click(`[role="radio"]:nth-child(${({postgres:1,'local-files':2,'sqlite-file':3,bigquery:4,prometheus:5,tempo:6,loki:7})[dialog]})`)
      }
      await waitFor(win, `document.querySelector('[role="dialog"]')`,`${dialog} dialog`)
      await delay(120)
      await observe(`dialog-${dialog}-${viewport}.png`,'[role="dialog"]','initial dialog',['postgres','settings','reset'].includes(dialog)?'dialogs':null)
      if(['settings','loki'].includes(dialog)) {
        await click('[role="dialog"] button[role="combobox"]')
        await waitFor(win, `document.querySelector('[role="listbox"]')`, `${dialog} nested selector`)
        await observe(`nested-${dialog}-options-${viewport}.png`,'[role="listbox"]','nested selector opened in dialog')
        await key('Escape')
        const parentRemains=await evaluate(`Boolean(document.querySelector('[role="dialog"]'))`)
        observations.push({family:'nested-overlay',dialog,viewport,childClosed:await evaluate(`!document.querySelector('[role="listbox"]')`),parentRemains})
        await observe(`nested-${dialog}-escape-${viewport}.png`,parentRemains?'[role="dialog"]':'.main','native Escape from nested selector')
        if(!parentRemains) { await clickText('Settings'); await waitFor(win, `document.querySelector('[role="dialog"]')`, 'reopened settings for standalone modal checks') }
      }
      const report={ family:'dialog',dialog,viewport }
      await evaluate(`(() => { const buttons=[...document.querySelector('[role="dialog"]').querySelectorAll('button:not(:disabled),input:not(:disabled)')]; buttons.at(-1).focus() })()`)
      await key('Tab')
      report.tabRemainsInside=await evaluate(`document.querySelector('[role="dialog"]').contains(document.activeElement)`)
      await key('Escape')
      report.escapeDismissed=await evaluate(`!document.querySelector('[role="dialog"]')`)
      if(!report.escapeDismissed) await clickText('Cancel','[role=dialog]')
      report.returnFocus=await evaluate('document.activeElement?.textContent?.trim()')
      observations.push(report)
    }
    for(const kind of ['postgres','prometheus','loki','tempo']) {
      await seed(kind,'builder')
      const root=kind==='postgres'?'.builder-pane':kind==='prometheus'?'.promql-builder-form':kind==='loki'?'[data-loki-builder]':'[data-tempo-builder]'
      const combo=`${root} button[role="combobox"]`
      await click(combo)
      await waitFor(win, `document.querySelector('[role="listbox"]')`,`${kind} options`)
      await observe(`selector-${kind}-options-${viewport}.png`,'[role="listbox"]','opened selector',viewport==='desktop'?'selectors':null)
      const input='[data-popover-overlay] input'
      await waitFor(win, select(input),`${kind} option search`)
      await type(input,'no-matching-audit-option')
      await waitFor(win, `document.querySelector('[role="listbox"]').innerText.includes('No') || document.querySelector('[role="listbox"]').querySelectorAll('[role="option"]').length===0`,`${kind} empty option search`)
      await observe(`selector-${kind}-no-options-${viewport}.png`,'[role="listbox"]','search has no matching options')
      await key('Escape')
      observations.push({family:'selector',kind,viewport,escapeDismissed:await evaluate(`!document.querySelector('[role="listbox"]')`),returnFocus:await evaluate('document.activeElement?.getAttribute("role")')})
    }
    if (viewport === 'desktop') {
      // CAP-01: actual React events through the existing picker and PostgreSQL form.
      // Use a passwordless public synthetic URI; never capture a credential or PEM.
      await seed('postgres','raw')
      await clickText('+ new connection')
      await waitFor(win, `document.querySelector('[role="dialog"] h2')?.textContent === 'Choose a connection type'`, 'CAP-01 picker')
      await click('[role="radio"]:nth-child(1)')
      await waitFor(win, `document.querySelector('#postgres-connection-title')?.textContent === 'PostgreSQL'`, 'CAP-01 PG form')
      await waitFor(win, `document.querySelector('#connection-password')?.type === 'password'`, 'CAP-01 masked password')

      await clickText('Save','[role="dialog"]')
      await waitFor(win, `document.querySelector('#profile-name')?.getAttribute('aria-invalid') === 'true' && document.body.innerText.includes('Database is required')`, 'CAP-01 required fields')
      await waitFor(win, `document.activeElement?.id === 'profile-name'`, 'CAP-01 invalid Save focuses first error')
      await observe('cap01-pg-validation-desktop.png','[role="dialog"]','actual invalid Save with required field feedback and focus')

      // HTMLTextAreaElement's native setter fires a real React onChange without a store shortcut.
      const pastedUri = 'postgres://audit_user@db.example:5440/reports?sslmode=require'
      await evaluate(`(() => {
        const input = ${select('#connection-string')}
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${rendererValue(pastedUri)})
        input.dispatchEvent(new Event('input',{bubbles:true}))
        input.dispatchEvent(new Event('change',{bubbles:true}))
      })()`)
      await waitFor(win, `document.querySelector('#connection-host')?.value === 'db.example' && document.querySelector('#connection-port')?.value === '5440' && document.querySelector('#connection-database')?.value === 'reports' && document.querySelector('#connection-user')?.value === 'audit_user'`, 'CAP-01 parsed URI populates fields')
      await waitFor(win, `document.body.innerText.includes('Parsed') && document.body.innerText.includes('server certificate is not verified') && document.body.innerText.includes('sslmode=require')`, 'CAP-01 parse success, TLS warning, masked preview')
      await observe('cap01-pg-string-desktop.png','[role="dialog"]','passwordless paste populated form and Require TLS warning')
      observations.push({family:'cap01',viewport,scenario:'paste-require',format:'postgres',passwordless:true,host:'db.example',port:5440,tlsMode:'require'})

      await click('[role="dialog"] button[role="combobox"]')
      const verifyIdentityOption = `[...document.querySelectorAll('[role="option"]')].find(element => element.textContent.includes('Verify server identity'))`
      await waitFor(win, verifyIdentityOption, 'CAP-01 Verify server identity option')
      await evaluate(`${verifyIdentityOption}.click()`)
      await waitFor(win, `document.querySelector('#connection-tls-ca') && document.body.innerText.includes('sslmode=verify-full') && !document.body.innerText.includes('server certificate is not verified')`, 'CAP-01 verifying TLS reveals optional CA without compatibility warning')
      await evaluate(`${select('#connection-tls-ca')}.scrollIntoView({block:'center'})`)
      await settle()
      await observe('cap01-pg-tls-desktop.png','[role="dialog"]','Verify server identity selected; optional CA field and preview')
      observations.push({family:'cap01',viewport,scenario:'verify-full',tlsMode:'verify-full',caFieldVisible:true,rawCertificateStored:false})
    }
    if (viewport === 'desktop') {
      // CAP-02 uses a saved synthetic profile but performs actual sidebar/form events.
      // Never use a real password, persistent connection or database.
      const profile = {
        ...auditProfiles.postgres,
        id: 'audit-postgres',
        name: 'Example PG audit profile',
        host: 'pg-audit.example',
        port: 5432,
        database: 'audit_db',
        user: 'audit_reader',
        password: '',
        hasPassword: true,
        credentialState: 'secure',
        tlsMode: 'disable',
        readonly: true,
      }
      const resetSavedProfile = async () => {
        await seed('postgres', 'raw')
        await evaluate(`window.__datakoalaStore.setState({profiles:[${rendererValue(profile)}]})`)
        await waitFor(win, `document.querySelector('button[aria-label="Edit connection Example PG audit profile"]')`, 'CAP-02 saved profile sidebar')
      }
      cap02Ipc.active = true
      cap02Ipc.tests.length = 0
      cap02Ipc.saves.length = 0
      cap02Ipc.removes.length = 0
      await clickText('Cancel','[role="dialog"]')
      await resetSavedProfile()

      // A02: existing-profile edit, not a new-profile wizard. Password is never exposed.
      await click('button[aria-label="Edit connection Example PG audit profile"]')
      await waitFor(win, `document.querySelector('#postgres-connection-title')?.textContent === 'Edit PostgreSQL connection'`, 'CAP-02 edit heading')
      await waitFor(win, `document.querySelector('#profile-name')?.value === 'Example PG audit profile' && document.querySelector('#connection-host')?.value === 'pg-audit.example' && document.querySelector('#connection-database')?.value === 'audit_db' && document.querySelector('#connection-user')?.value === 'audit_reader' && document.querySelector('#connection-port')?.value === '5432' && document.querySelector('#connection-password')?.type === 'password' && document.querySelector('#connection-password')?.value === '' && document.querySelector('#connection-password')?.placeholder.includes('Saved securely') && document.querySelector('[role="dialog"] input[type="checkbox"]')?.checked === true`, 'CAP-02 populated edit with masked saved credential')
      await observe('cap02-pg-edit-desktop.png','[role="dialog"]','selected saved PG form with masked password and initial readonly')
      // Cancel an actual unsaved edit, rather than merely closing the untouched form.
      await evaluate(`(() => {
        const input=${select('#connection-host')}
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${rendererValue('pg-cancelled.example')})
        input.dispatchEvent(new Event('input',{bubbles:true}))
        input.dispatchEvent(new Event('change',{bubbles:true}))
      })()`)
      await waitFor(win, `document.querySelector('#connection-host')?.value === 'pg-cancelled.example'`, 'CAP-02 unsaved edit before Cancel')
      const beforeCancelSaves = cap02Ipc.saves.length
      await clickText('Cancel','[role="dialog"]')
      await waitFor(win, `!document.querySelector('[role="dialog"]')`, 'CAP-02 edit cancel closes')
      if (cap02Ipc.saves.length !== beforeCancelSaves) throw Error('CAP-02 Cancel unexpectedly saved')
      await waitFor(win, `window.__datakoalaStore.getState().profiles.some(p => p.id === 'audit-postgres' && p.host === 'pg-audit.example')`, 'CAP-02 Cancel preserves saved profile')
      observations.push({family:'cap02',viewport,scenario:'edit-cancel',saved:false,profileId:'audit-postgres'})

      // C05: actual checkbox toggle and edited Host passed to mocked Test + Save.
      await click('button[aria-label="Edit connection Example PG audit profile"]')
      await waitFor(win, `document.querySelector('#postgres-connection-title')?.textContent === 'Edit PostgreSQL connection'`, 'CAP-02 edit reopened')
      await evaluate(`${select('[role="dialog"] input[type="checkbox"]')}.scrollIntoView({block:'center'})`)
      await click('[role="dialog"] input[type="checkbox"]')
      await waitFor(win, `document.querySelector('[role="dialog"] input[type="checkbox"]')?.checked === false`, 'CAP-02 actual unchecked read-only')
      // Actual React change event, as for CAP-01's successful paste path.
      await evaluate(`(() => {
        const input=${select('#connection-host')}
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${rendererValue('pg-edited.example')})
        input.dispatchEvent(new Event('input',{bubbles:true}))
        input.dispatchEvent(new Event('change',{bubbles:true}))
      })()`)
      await waitFor(win, `document.querySelector('#connection-host')?.value === 'pg-edited.example' && document.querySelector('[role="dialog"] input[type="checkbox"]')?.checked === false`, 'CAP-02 edited host and read-only false')
      await observe('cap02-pg-readonly-desktop.png','[role="dialog"]','actual unchecked read-only checkbox and edited host')
      await clickText('Test','[role="dialog"]')
      await waitFor(win, `document.body.innerText.includes('Connected — server 17')`, 'CAP-02 mocked Test success')
      if (!cap02Ipc.tests.some(p => p.id === 'audit-postgres' && p.host === 'pg-edited.example' && p.readonly === false)) throw Error('CAP-02 Test did not preserve id/edited draft/read-only')
      await clickText('Save','[role="dialog"]')
      await waitFor(win, `!document.querySelector('[role="dialog"]')`, 'CAP-02 Save closes')
      if (!cap02Ipc.saves.some(p => p.id === 'audit-postgres' && p.host === 'pg-edited.example' && p.readonly === false)) throw Error('CAP-02 Save did not preserve id/edited draft/read-only')
      observations.push({family:'cap02',viewport,scenario:'edit-test-save',profileId:'audit-postgres',host:'pg-edited.example',initialReadonly:true,testReadonly:false,saveReadonly:false,maskedPassword:true})

      // A03: named delete confirmation, Escape focus return, Cancel preservation,
      // and explicit controlled Delete (no real connection/persistence mutation).
      await resetSavedProfile()
      const deleteButton = 'button[aria-label="Delete connection Example PG audit profile"]'
      await click(deleteButton)
      await waitFor(win, `document.querySelector('[role="dialog"] h2')?.textContent === 'Delete connection?' && document.querySelector('[role="dialog"]')?.innerText.includes('Example PG audit profile')`, 'CAP-02 named delete target')
      await waitFor(win, `document.activeElement?.textContent?.trim() === 'Cancel'`, 'CAP-02 initial Cancel focus')
      await observe('cap02-pg-delete-desktop.png','[role="dialog"]','named delete confirmation with focused Cancel')
      await key('Escape')
      await waitFor(win, `!document.querySelector('[role="dialog"]')`, 'CAP-02 Escape dismisses delete')
      await settle()
      const escapeFocus = await evaluate(`({ tag:document.activeElement?.tagName, label:document.activeElement?.getAttribute('aria-label'), text:document.activeElement?.textContent?.trim()?.slice(0,60) })`)
      const escapeRestoredFocus = escapeFocus.label === 'Delete connection Example PG audit profile'
      if (cap02Ipc.removes.length !== 0) throw Error('CAP-02 Escape unexpectedly removed profile')
      observations.push({family:'cap02',viewport,scenario:'delete-escape',restoredFocus:escapeRestoredFocus,actualFocus:escapeFocus,removed:false})
      await click(deleteButton)
      await waitFor(win, `document.querySelector('[role="dialog"] h2')?.textContent === 'Delete connection?'`, 'CAP-02 delete reopened')
      await clickText('Cancel','[role="dialog"]')
      await waitFor(win, `!document.querySelector('[role="dialog"]')`, 'CAP-02 Cancel dismisses delete')
      await settle()
      const cancelFocus = await evaluate(`({ tag:document.activeElement?.tagName, label:document.activeElement?.getAttribute('aria-label'), text:document.activeElement?.textContent?.trim()?.slice(0,60) })`)
      const cancelRestoredFocus = cancelFocus.label === 'Delete connection Example PG audit profile'
      if (cap02Ipc.removes.length !== 0) throw Error('CAP-02 Cancel unexpectedly removed profile')
      observations.push({family:'cap02',viewport,scenario:'delete-cancel',restoredFocus:cancelRestoredFocus,actualFocus:cancelFocus,removed:false})
      await waitFor(win, `window.__datakoalaStore.getState().profiles.some(p => p.id === 'audit-postgres')`, 'CAP-02 Cancel retains profile')
      await click(deleteButton)
      await waitFor(win, `document.querySelector('[role="dialog"] h2')?.textContent === 'Delete connection?'`, 'CAP-02 confirm dialog reopened')
      await clickText('Delete connection','[role="dialog"]')
      await waitFor(win, `!window.__datakoalaStore.getState().profiles.some(p => p.id === 'audit-postgres')`, 'CAP-02 confirmed removal from renderer')
      if (cap02Ipc.removes.length !== 1 || cap02Ipc.removes[0] !== 'audit-postgres') throw Error('CAP-02 wrong or repeated delete target')
      observations.push({family:'cap02',viewport,scenario:'delete',profileId:'audit-postgres',cancelRemoved:false,escapeRestoredFocus,cancelRestoredFocus,confirmedRemoveCalls:1,rendererProfileRemoved:true})
      cap02Ipc.active = false
    }
    if (viewport === 'desktop') {
      // CAP-03: synthetic IPC, genuine picker and form controls; no native provider/OS access.
      cap03Ipc.active = true
      cap03Ipc.tests.length = 0; cap03Ipc.saves.length = 0
      const startForm = async index => {
        await seed('postgres','raw')
        await clickText('+ new connection')
        await waitFor(win, `document.querySelector('[role="dialog"] h2')?.textContent === 'Choose a connection type'`, 'CAP-03 picker')
        await click(`[role="radio"]:nth-child(${index})`)
      }
      const setInput = async (selector, value) => {
        await evaluate(`(() => { const input=${select(selector)}; if(!input)throw Error('CAP-03 missing input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${rendererValue(value)}); input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true})) })()`)
      }
      await startForm(4)
      await waitFor(win, `document.querySelector('#bigquery-connection-title')?.textContent === 'BigQuery'`, 'CAP-03 BigQuery form')
      await setInput('#bq-name', 'Example BQ audit')
      await click('[role="dialog"] details summary')
      await click('[role="dialog"] input[type="checkbox"]')
      await setInput('#bq-max','1024')
      await waitFor(win, `document.querySelector('#bq-max')?.value === '1024' && document.querySelector('#bq-max')?.disabled === false && document.querySelector('[role="dialog"] input[type="checkbox"]')?.checked === true`, 'CAP-03 BQ billing cap active')
      await evaluate(`${select('#bq-max')}.scrollIntoView({block:'center'})`)
      await observe('cap03-bq-advanced-desktop.png','[role="dialog"]','BigQuery Advanced billing cap opt-in with positive value')
      observations.push({family:'cap03',viewport,scenario:'bq-advanced',billingCap:'1024',enabled:true,synthetic:true})
      await clickText('Test','[role="dialog"]')
      await waitFor(win, `document.body.innerText.includes('Credentials and metadata access verified')`, 'CAP-03 synthetic BQ Test')
      if (!cap03Ipc.tests.some(p=>p.kind==='bigquery' && p.name==='Example BQ audit' && p.billingProject==='example-project' && p.maximumBytesBilled==='1024' && p.readonly===true)) throw Error('CAP-03 BQ Test payload did not contain billing/cap')
      await clickText('Save','[role="dialog"]')
      await waitFor(win, `!document.querySelector('[role="dialog"]')`, 'CAP-03 BQ Save closes form')
      if (!cap03Ipc.saves.some(p=>p.kind==='bigquery' && p.billingProject==='example-project' && p.maximumBytesBilled==='1024')) throw Error('CAP-03 BQ Save did not preserve billing cap')
      observations.push({family:'cap03',viewport,scenario:'bq-test-save',billingProject:'example-project',billingCap:'1024',providerCall:'mocked'})

      await startForm(2)
      await waitFor(win, `document.querySelector('#local-profile-name')?.value === 'Local files'`, 'CAP-03 local file form')
      await clickText('Test','[role="dialog"]')
      await waitFor(win, `document.body.innerText.includes('choose at least one file')`, 'CAP-03 empty files validation')
      await clickText('Choose files…','[role="dialog"]')
      await waitFor(win, `document.querySelectorAll('[role="dialog"] input').length >= 4`, 'CAP-03 multiple files listed')
      await waitFor(win, `[...document.querySelectorAll('[role="dialog"] input')].some(e=>e.value === 'region_2')`, 'CAP-03 case-insensitive generated alias collision')
      if (cap03Ipc.chooseFiles !== 1) throw Error('CAP-03 synthetic chooser mismatch')
      await observe('cap03-local-files-alias-desktop.png','[role="dialog"]','Local files chooser selected distinct files with collision aliases')
      observations.push({family:'cap03',viewport,scenario:'local-files',count:3,collisionAlias:'region_2',chooserCalls:cap03Ipc.chooseFiles})
      // Re-selecting the same three paths adds no rows; then edit and remove through UI.
      await clickText('Choose files…','[role="dialog"]')
      await waitFor(win, `document.querySelectorAll('[role="dialog"] input').length === 4`, 'CAP-03 repeated chooser path dedup')
      if (cap03Ipc.chooseFiles !== 2) throw Error('CAP-03 repeat chooser was not invoked')
      await setInput('[role="dialog"] input[value="Region"]', 'region_custom')
      await waitFor(win, `[...document.querySelectorAll('[role="dialog"] input')].some(e=>e.value === 'region_custom')`, 'CAP-03 alias edited by React event')
      await click('button[aria-label="Remove /samples/details.parquet"]')
      await waitFor(win, `document.querySelectorAll('[role="dialog"] input').length === 3`, 'CAP-03 removed one file')
      await clickText('Test','[role="dialog"]')
      await waitFor(win, `document.body.innerText.includes('Files loaded successfully with DuckDB')`, 'CAP-03 synthetic local files Test')
      const localExpected = p => p.kind==='local-files' && p.readonly===true && p.files?.length===2 && p.files.some(f=>f.path==='/samples/Region.csv'&&f.alias==='region_custom') && p.files.some(f=>f.path==='/samples/region.CSV'&&f.alias==='region_2')
      if (!cap03Ipc.tests.some(localExpected)) throw Error('CAP-03 local files Test payload alias/remove/readonly mismatch')
      await clickText('Save','[role="dialog"]')
      await waitFor(win, `!document.querySelector('[role="dialog"]')`, 'CAP-03 local file Save')
      if (!cap03Ipc.saves.some(localExpected)) throw Error('CAP-03 local files Save payload mismatch')
      observations.push({family:'cap03',viewport,scenario:'local-files-test-save',chooserCalls:2,keptFiles:2,aliasEdited:true,oneRemoved:true,readonly:true,providerCall:'mocked'})

      await startForm(3)
      await waitFor(win, `document.querySelector('#sqlite-profile-name')?.value === 'SQLite database'`, 'CAP-03 sqlite form')
      await clickText('Save','[role="dialog"]')
      await waitFor(win, `document.body.innerText.includes('choose one SQLite database file')`, 'CAP-03 SQLite required file error')
      await clickText('Choose database…','[role="dialog"]')
      await waitFor(win, `document.querySelector('[role="dialog"]')?.innerText.includes('/samples/example.sqlite3')`, 'CAP-03 selected SQLite path')
      await observe('cap03-sqlite-selection-desktop.png','[role="dialog"]','single SQLite selection after real chooser click')
      await clickText('Test','[role="dialog"]')
      await waitFor(win, `document.body.innerText.includes('SQLite database opened directly in read-only mode')`, 'CAP-03 synthetic SQLite Test')
      if (!cap03Ipc.tests.some(p=>p.kind==='sqlite-file' && p.path==='/samples/example.sqlite3' && p.readonly===true)) throw Error('CAP-03 SQLite Test payload wrong')
      observations.push({family:'cap03',viewport,scenario:'sqlite-selected',path:'/samples/example.sqlite3',readonly:true,chooserCalls:cap03Ipc.chooseSqlite})
      await clickText('Save','[role="dialog"]')
      await waitFor(win, `!document.querySelector('[role="dialog"]')`, 'CAP-03 SQLite Save')
      if (!cap03Ipc.saves.some(p=>p.kind==='sqlite-file' && p.path==='/samples/example.sqlite3' && p.readonly===true)) throw Error('CAP-03 SQLite Save payload mismatch')
      observations.push({family:'cap03',viewport,scenario:'sqlite-test-save',path:'/samples/example.sqlite3',readonly:true,providerCall:'mocked'})

      cap03Ipc.active = false
    }
    if (viewport === 'desktop') {
      const openObservability = async (index, title) => {
        await seed('postgres','raw')
        await clickText('+ new connection')
        await waitFor(win, `document.querySelector('[role="dialog"] h2')?.textContent === 'Choose a connection type'`, 'CAP-04 picker')
        await waitFor(win, `[...document.querySelectorAll('[role="radio"]')].some(b=>b.textContent.includes(${rendererValue(title)}))`, 'CAP-04 provider card')
        await evaluate(`[...document.querySelectorAll('[role="radio"]')].find(b=>b.textContent.includes(${rendererValue(title)})).click()`)
        await waitFor(win, `document.querySelector('[role="dialog"] h2')?.textContent === ${rendererValue(title)}`, 'CAP-04 correct datasource form')
      }
      const setInput = async (selector,value) => {
        await evaluate(`(() => {
          const e=${select(selector)}
          if(!e) throw Error('CAP-04 input missing')
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${rendererValue(value)})
          e.dispatchEvent(new Event('input',{bubbles:true}))
          e.dispatchEvent(new Event('change',{bubbles:true}))
        })()`)
      }
      // P01: the historical dialog covers one selected Prometheus UID. Test the actual
      // selected UID and saved gcx profile without another redundant screenshot.
      cap04Ipc.mode = 'record'
      cap04Ipc.tests.length=0;cap04Ipc.saves.length=0;cap04Ipc.discovery.length=0
      await openObservability(5,'Prometheus')
      await waitFor(win, `document.querySelector('[role="dialog"]')?.innerText.includes('Example prometheus')`, 'CAP-04 selected Prometheus datasource')
      await clickText('Save','[role="dialog"]')
      await waitFor(win, `!document.querySelector('[role="dialog"]')`, 'CAP-04 Prometheus Save')
      if (!cap04Ipc.saves.some(p=>p.kind==='prometheus'&&p.transport?.datasourceUid==='example-prometheus'&&p.transport?.kind==='gcx')) throw Error('CAP-04 PM selected UID missing in Save')
      observations.push({family:'cap04',viewport,scenario:'prometheus-selected',datasourceUid:'example-prometheus',savedMock:true})
      // L01: empty discovery does NOT forbid deliberately entering a manual UID.
      cap04Ipc.mode = 'loki'
      await openObservability(6,'Loki')
      await waitFor(win, `document.querySelector('[role="dialog"]')?.innerText.includes('No Loki datasource found')`, 'CAP-04 empty Loki discovery')
      const manualPanel = '[role="dialog"] details[data-collapsible-title="Advanced — enter a datasource UID manually"]'
      await waitFor(win, `${select(manualPanel)}`, 'CAP-04 manual UID panel')
      if (!(await evaluate(`${select(manualPanel)}.open`))) await click(`${manualPanel} summary`)
      await waitFor(win, `${select(manualPanel)}.open === true && document.querySelector('#loki-uid')?.getBoundingClientRect().height > 0`, 'CAP-04 manual UID visibly expanded')
      await setInput('#loki-uid','manual-loki-audit')
      await waitFor(win, `document.querySelector('#loki-uid')?.value === 'manual-loki-audit' && ![...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.trim()==='Save')?.disabled`, 'CAP-04 manual UID enabled')
      await observe('cap04-loki-fallback-desktop.png','[role="dialog"]','empty Loki discovery with deliberate manual UID')
      await clickText('Test datasource','[role="dialog"]')
      await waitFor(win, `document.body.innerText.includes('the manually configured Loki datasource')`, 'CAP-04 manual Loki Test')
      await clickText('Save','[role="dialog"]')
      await waitFor(win, `!document.querySelector('[role="dialog"]')`, 'CAP-04 manual Loki Save')
      if (!cap04Ipc.tests.some(p=>p.kind==='loki'&&p.transport?.datasourceUid==='manual-loki-audit') || !cap04Ipc.saves.some(p=>p.kind==='loki'&&p.transport?.datasourceUid==='manual-loki-audit')) throw Error('CAP-04 Loki fallback Test/Save')
      observations.push({family:'cap04',viewport,scenario:'loki-manual-uid',discovery:'empty',manualUid:'manual-loki-audit',testAndSave:true})
      // T01: empty discovery still permits normal trace access, not Grafana handoff.
      cap04Ipc.mode = 'tempo'
      await openObservability(7,'Tempo')
      await waitFor(win, `document.querySelector('[role="dialog"]')?.innerText.includes('remain available without Grafana handoff')`, 'CAP-04 Tempo no UID optional')
      await observe('cap04-tempo-optional-desktop.png','[role="dialog"]','Tempo without discovered UID still query-capable')
      await clickText('Test trace access','[role="dialog"]')
      await waitFor(win, `document.body.innerText.includes('Tempo trace access verified')`, 'CAP-04 Tempo synthetic Test without UID')
      await clickText('Save','[role="dialog"]')
      await waitFor(win, `!document.querySelector('[role="dialog"]')`, 'CAP-04 Tempo Save without UID')
      if (!cap04Ipc.tests.some(p=>p.kind==='tempo'&&!p.transport?.datasourceUid) || !cap04Ipc.saves.some(p=>p.kind==='tempo'&&!p.transport?.datasourceUid)) throw Error('CAP-04 Tempo optional UID contract')
      observations.push({family:'cap04',viewport,scenario:'tempo-no-uid',discovery:'empty',testAndSave:true,uidRequired:false})
      cap04Ipc.mode = ''
    }
    if (viewport === 'desktop') {
      await seed('postgres','builder')
      const filterInput='input[placeholder="Filter objects…"]'
      await waitFor(win, `document.querySelector(${rendererValue(filterInput)})`, 'CAP-05 PG filter exists')
      await evaluate(`(() => {
        const input=${select(filterInput)}
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'events')
        input.dispatchEvent(new Event('input',{bubbles:true}))
        input.dispatchEvent(new Event('change',{bubbles:true}))
      })()`)
      await waitFor(win, `document.querySelector(${rendererValue(filterInput)})?.value === 'events' && document.querySelector('[role="tree"]')?.innerText.includes('events')`, 'CAP-05 visible SQL filter result')
      await observe('cap05-pg-filter-desktop.png','aside[aria-label="Connections and objects"]','actual token search filters PG tree')
      await evaluate(`(() => {
        const input=${select(filterInput)}
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'')
        input.dispatchEvent(new Event('input',{bubbles:true}))
        input.dispatchEvent(new Event('change',{bubbles:true}))
      })()`)
      await waitFor(win, `document.querySelector(${rendererValue(filterInput)})?.value === ''`, 'CAP-05 cleared search')
      observations.push({family:'cap05',viewport,scenario:'pg-search-clear',query:'events',cleared:true,profile:'audit-postgres'})

      // State injection establishes the *initial* error only. The Retry action
      // below is a genuine React click and invokes the synthetic list-objects IPC.
      cap05Ipc.active=true;cap05Ipc.listCalls=0
      await evaluate(`(() => {
        const store=window.__datakoalaStore,state=store.getState(),id='audit-postgres'
        store.setState({metadataByProfileId:{...state.metadataByProfileId,[id]:{schemas:[],status:'error',error:'Synthetic initial discovery failed',refreshing:false,refreshError:null}}})
      })()`)
      await waitFor(win, `document.body.innerText.includes('Synthetic initial discovery failed') && [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Retry')`, 'CAP-05 injected initial error')
      const initialCalls=cap05Ipc.listCalls
      await clickText('Retry')
      await waitFor(win, `window.__datakoalaStore.getState().metadataByProfileId['audit-postgres']?.status === 'loaded' && document.body.innerText.includes('events')`, 'CAP-05 real retry loaded')
      if (cap05Ipc.listCalls !== initialCalls+1) throw Error('CAP-05 retry did not invoke exactly one metadata request')
      await observe('cap05-pg-retry-desktop.png','aside[aria-label="Connections and objects"]','actual Retry click recovered SQL schema/relations')
      observations.push({family:'cap05',viewport,scenario:'pg-error-retry',initialError:'injected',retryAction:'clicked',listObjectCalls:cap05Ipc.listCalls,recovered:true,profile:'audit-postgres'})
      cap05Ipc.active=false
    }
    if (viewport === 'desktop') {
      await seed('postgres','raw')
      const original=await evaluate('window.__datakoalaStore.getState().activeTabId')
      await click('[aria-label="New query tab"]')
      await waitFor(win, `window.__datakoalaStore.getState().tabs.length===2 && window.__datakoalaStore.getState().activeTabId !== ${rendererValue(original)}`, 'CAP-07 actual New tab')
      const created=await evaluate('window.__datakoalaStore.getState().activeTabId')
      const newState=await evaluate('(() => { const s=window.__datakoalaStore.getState(),t=s.tabs.find(x=>x.id===s.activeTabId);return {profileId:t.connectionProfileId,running:t.running,queryMode:t.queryMode,title:t.title} })()')
      if(newState.profileId!=='audit-postgres'||newState.running)throw Error('CAP-07 New tab did not inherit PG/fresh running state')
      // Actual double-click handler through a genuine composed MouseEvent.
      await evaluate(`(() => { const el=[...document.querySelectorAll('[role="tab"]')].find(t=>t.querySelector('[aria-selected]')||t.getAttribute('aria-selected')==='true');if(!el)throw Error('CAP-07 selected tab missing');el.querySelector('button').dispatchEvent(new MouseEvent('dblclick',{bubbles:true})) })()`)
      await waitFor(win, `document.querySelector('input[aria-label="Tab name"]')||document.querySelector('input[id*="tab"]')||document.querySelector('[role="tab"] input')`, 'CAP-07 rename input')
      await evaluate(`(() => { const e=document.querySelector('[role="tab"] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Audit B');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})) })()`)
      await waitFor(win, `window.__datakoalaStore.getState().tabs.some(t=>t.id===${rendererValue(created)} && t.title==='Audit B')`, 'CAP-07 rename committed')
      // Only the running state is injected; tab creation, renaming and switching are real UI actions.
      await evaluate(`(() => { const st=window.__datakoalaStore.getState();st.setRunning(true,${rendererValue(original)}) })()`)
      await waitFor(win, `document.querySelectorAll('[aria-label="Query running"]').length===1 && [...document.querySelectorAll('[role="tab"]')].some(t=>t.getAttribute('aria-selected')==='false'&&t.querySelector('[aria-label="Query running"]'))`, 'CAP-07 background tab running indicator')
      await observe('cap07-tabs-running-desktop.png','[role="tablist"][aria-label="Query tabs"]','real new tab + rename; synthetic background-tab running indicator')
      observations.push({family:'cap07',viewport,scenario:'new-rename-background-running',originalTab:original,newTab:created,newTitle:'Audit B',profileId:newState.profileId,runningInjected:true,indicatorOnInactive:true})
      console.log('CAP08 boundary: CAP-07 observation complete')
      await evaluate(`window.__datakoalaStore.getState().setRunning(false,${rendererValue(original)})`)
      await waitFor(win, `document.querySelectorAll('[aria-label="Query running"]').length===0`, 'CAP-07 running cleared')
      await click(`[aria-label="Close Audit B"]`)
      await waitFor(win, `window.__datakoalaStore.getState().tabs.length===1 && window.__datakoalaStore.getState().activeTabId===${rendererValue(original)}`, 'CAP-07 close active restores surviving tab')
      observations.push({family:'cap07',viewport,scenario:'close-active',survivor:original,runningCleared:true})
    }
    if (viewport === 'desktop') {
      // CAP-10: actual CodeMirror completion, formatting, Run, copy, and Builder handoff.
      // All metadata and query replies stay in the isolated audit Electron process.
      console.log('CAP10 start: SQL editor, completion, formatting, run, copy, and generated preview')
      for (const filename of ['postgres-raw-desktop.png', 'bigquery-raw-desktop.png']) console.log('CAP10_REUSED_PNG_BASE64 ' + filename + ' ' + (await readFile(resolve(outputDir, filename))).toString('base64'))
      const completionColumns = auditSqlResult.columns
      const pgSchemas = [
        { name: 'public', isSystem: false, relations: [{ schema: 'public', name: 'events', qualifiedName: 'public.events', kind: 'r', columnsStatus: 'loaded', columns: completionColumns }] },
        { name: 'analytics', isSystem: false, relations: [{ schema: 'analytics', name: 'events', qualifiedName: 'analytics.events', kind: 'r', columnsStatus: 'loaded', columns: completionColumns }] },
      ]
      const bqSchemas = [
        { name: 'example-project.analytics', isSystem: false, relations: [{ schema: 'example-project.analytics', name: 'events', qualifiedName: 'example-project.analytics.events', kind: 'r', columnsStatus: 'loaded', columns: completionColumns }] },
        { name: 'example-project.reporting', isSystem: false, relations: [{ schema: 'example-project.reporting', name: 'events', qualifiedName: 'example-project.reporting.events', kind: 'r', columnsStatus: 'loaded', columns: completionColumns }] },
      ]
      const editorSelector = '[aria-label="SQL editor"]'
      const editorExpression = 'document.querySelector(' + rendererValue(editorSelector) + ')'
      const configureEditor = async (kind, query, schemas) => {
        await seed(kind, 'raw', 'fresh')
        await evaluate('(() => { const store=window.__datakoalaStore, state=store.getState(), tab={...state.tabs[0]}, profileId=' + rendererValue(auditProfiles[kind].id) + '; tab.sql=' + rendererValue(query) + '; store.setState({tabs:[tab],activeTabId:tab.id,metadataByProfileId:{...state.metadataByProfileId,[profileId]:{...state.metadataByProfileId[profileId],schemas:' + rendererValue(schemas) + ',status:"loaded",error:null,isStale:false}}}) })()')
        await settle()
        await waitFor(win, editorExpression + '?.textContent.includes(' + rendererValue(query.slice(-Math.min(18, query.length))) + ')', kind + ' seeded editor document')
      }

      await configureEditor('postgres', 'SELECT category, value FROM public.events WHERE value > 2', pgSchemas)
      await observe('cap10-editor-postgres-desktop.png', editorSelector, 'Populated PostgreSQL CodeMirror editor with SQL4 relation and columns')
      const bqSql = 'SELECT category, value FROM ' + String.fromCharCode(96) + 'example-project.analytics.events' + String.fromCharCode(96) + ' WHERE value > 2'
      await configureEditor('bigquery', bqSql, bqSchemas)
      await observe('cap10-editor-bigquery-desktop.png', editorSelector, 'Populated BigQuery CodeMirror editor using GoogleSQL identifier quoting')
      observations.push({ family: 'cap10', viewport, scenario: 'completion-source', fixtureSchemas: ['public', 'analytics', 'example-project.analytics', 'example-project.reporting'], focusedTests: ['sqlAutocomplete.test.tsx: completion schema retains relations but delegates all columns to contextual completion', 'sqlAutocomplete.test.tsx: BigQuery project.dataset namespaces are nested without merging duplicate tables', 'sqlAutocomplete.test.tsx: GoogleSQL built-in schema completion never applies ANSI double quotes', 'sqlAutocomplete.test.tsx: contextual completion is the single typed column provider'], rendererPopup: 'unverified: prior attempt at sourceHead 66fb59bd did not open the CodeMirror popup with native Electron Ctrl+Space; no visual claim' })

      const originalPostgres = 'SELECT category, value FROM public.events WHERE value > 2'
      await configureEditor('postgres', originalPostgres, pgSchemas)
      const beforeFormat = queryCalls
      await clickText('Format', '[data-query-toolbar]')
      await waitFor(win, 'window.__datakoalaStore.getState().tabs[0].sql !== ' + rendererValue(originalPostgres), 'CAP-10 PostgreSQL local formatting')
      const formattedPostgres = await evaluate('window.__datakoalaStore.getState().tabs[0].sql')
      if (formattedPostgres.split(String.fromCharCode(10)).length < 2 || !formattedPostgres.includes('FROM public.events') || !formattedPostgres.includes('WHERE value > 2')) throw Error('CAP-10 Format output did not preserve expected SQL structure: ' + JSON.stringify(formattedPostgres))
      if (queryCalls !== beforeFormat) throw Error('CAP-10 Format unexpectedly executed SQL')
      await observe('cap10-formatted-postgres-desktop.png', editorSelector, 'PostgreSQL query after in-place Format without execution')
      observations.push({ family: 'cap10', viewport, scenario: 'format-postgres', sql: formattedPostgres, noQueryExecution: true, source: 'formatSql with PostgreSQL formatter dialect' })

      await configureEditor('postgres', '   ', pgSchemas)
      const beforeEmptyRun = queryCalls
      const emptyRunState = await evaluate('(() => { const button=[...document.querySelectorAll("[data-query-toolbar] button")].find(node=>node.textContent.trim()==="Run"); return button?{exists:true,disabled:button.disabled}:null })()')
      if (!emptyRunState?.exists) throw Error('CAP-10 empty-query Run control is missing')
      if (!emptyRunState.disabled) {
        await clickText('Run', '[data-query-toolbar]')
        await waitFor(win, 'document.body.innerText.includes("Nothing to run — the editor is empty.")', 'CAP-10 empty query feedback')
      }
      if (queryCalls !== beforeEmptyRun) throw Error('CAP-10 empty query dispatched to provider IPC')
      observations.push({ family: 'cap10', viewport, scenario: 'empty-run', run: emptyRunState, feedback: emptyRunState.disabled ? 'unavailable' : 'Nothing to run — the editor is empty.', providerCalls: 0 })

      const runSql = 'select 9 as audit_cap10_run'
      await configureEditor('postgres', runSql, pgSchemas)
      cap10Ipc.calls.length = 0
      cap10Ipc.active = true
      const beforeRun = queryCalls
      await clickText('Run', '[data-query-toolbar]')
      await waitFor(win, '!window.__datakoalaStore.getState().tabs[0].running && window.__datakoalaStore.getState().tabs[0].result?.rows?.length === 3', 'CAP-10 single mocked Run dispatch')
      if (queryCalls !== beforeRun + 1 || cap10Ipc.calls.length !== 1 || cap10Ipc.calls[0].id !== auditProfiles.postgres.id || cap10Ipc.calls[0].sql !== runSql) throw Error('CAP-10 Run did not send exactly one current PG query: ' + JSON.stringify(cap10Ipc.calls))
      cap10Ipc.active = false
      const afterRun = queryCalls
      observations.push({ family: 'cap10', viewport, scenario: 'run-postgres', selectedProfile: cap10Ipc.calls[0].id, sql: cap10Ipc.calls[0].sql, exactDispatchCount: 1, syntheticResultRows: 3, liveProvider: false })

      await evaluate("(() => { window.__cap10Clipboard=[]; Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText(value){window.__cap10Clipboard.push(value);return Promise.resolve()}}}) })()")
      const rawCopySql = 'SELECT copied_value FROM public.events'
      await configureEditor('postgres', rawCopySql, pgSchemas)
      await click('[data-query-toolbar] [aria-label="Copy SQL to clipboard"]')
      await waitFor(win, 'window.__cap10Clipboard.at(-1) === ' + rendererValue(rawCopySql), 'CAP-10 raw SQL clipboard payload')
      if (queryCalls !== afterRun) throw Error('CAP-10 Copy unexpectedly executed SQL')
      const rawCopyFeedback = await evaluate('document.body.innerText.includes("Copied to clipboard")')
      if (!rawCopyFeedback) throw Error('CAP-10 raw Copy SQL did not report success')
      observations.push({ family: 'cap10', viewport, scenario: 'copy-raw-postgres', payload: rawCopySql, feedback: 'Copied to clipboard', clipboard: 'synthetic navigator.clipboard; native OS not tested', noQueryExecution: true })

      await seed('postgres', 'builder', 'fresh')
      await evaluate('(() => { const store=window.__datakoalaStore,state=store.getState(),tab=state.tabs[0]; tab.builder={...tab.builder,table:{schema:"example",name:"events"}}; tab.builderVisualization={...tab.builderVisualization,xColumn:"category",valueColumn:"value",aggregation:"sum"}; tab.builderHasRun=false; store.setState({tabs:[tab],activeTabId:tab.id}) })()')
      await click('[data-generated-query-panel] summary')
      const disclosureExpression = 'document.querySelector("[data-generated-query-panel] details")'
      await waitFor(win, disclosureExpression + '?.open === true', 'CAP-10 generated SQL disclosure expanded')
      const generatedSelector = '[data-generated-query-panel] [aria-label="Generated SQL query"]'
      const generatedExpression = 'document.querySelector(' + rendererValue(generatedSelector) + ')'
      await waitFor(win, generatedExpression + '?.querySelector(".cm-content")?.getBoundingClientRect().height > 0 && ' + generatedExpression + '?.querySelector(".cm-content")?.innerText.trim().length > 0', 'CAP-10 visible generated SQL preview')
      await evaluate('document.querySelector("[data-generated-query-panel]")?.scrollIntoView({block:"end"})')
      await settle()
      await waitFor(win, generatedExpression + '?.querySelector(".cm-content")?.getBoundingClientRect().top < window.innerHeight && ' + generatedExpression + '?.querySelector(".cm-content")?.getBoundingClientRect().bottom > 0', 'CAP-10 generated SQL body in viewport')
      const generatedSql = await evaluate(generatedExpression + '?.querySelector(".cm-content")?.innerText.trim()')
      if (!generatedSql?.includes('SELECT') || !generatedSql.includes('events')) throw Error('CAP-10 generated SQL preview is incomplete: ' + String(generatedSql))
      await observe('cap10-generated-sql-desktop.png', '[data-generated-query-panel]', 'SQL Builder generated query disclosure, preview and actions')
      const beforeGeneratedActions = queryCalls
      const clipboardLengthBeforeGeneratedCopy = await evaluate('window.__cap10Clipboard.length')
      await click('[data-generated-query-panel] [aria-label="Copy SQL to clipboard"]')
      await waitFor(win, 'window.__cap10Clipboard.length > ' + clipboardLengthBeforeGeneratedCopy, 'CAP-10 generated SQL clipboard write')
      const generatedCopiedSql = await evaluate('window.__cap10Clipboard.at(-1)')
      await clickText('Open in SQL mode', '[data-generated-query-panel]')
      await waitFor(win, 'window.__datakoalaStore.getState().tabs[0].queryMode === "sql"', 'CAP-10 generated query opened in SQL mode')
      const generatedDraftSql = await evaluate('window.__datakoalaStore.getState().tabs[0].sql')
      if (generatedDraftSql.trim() !== generatedSql) throw Error('CAP-10 Open in SQL mode draft differed from preview: ' + JSON.stringify({ preview: generatedSql, draft: generatedDraftSql }))
      if (generatedCopiedSql !== generatedDraftSql) throw Error('CAP-10 generated Copy payload did not exactly match opened SQL draft: ' + JSON.stringify({ copied: generatedCopiedSql, draft: generatedDraftSql }))
      if (queryCalls !== beforeGeneratedActions) throw Error('CAP-10 generated preview/copy/open unexpectedly executed SQL')
      observations.push({ family: 'cap10', viewport, scenario: 'builder-generated-query', sql: generatedDraftSql, copiedExactPayload: true, openInEditorUpdatesDraft: true, noQueryExecution: true, nativeClipboard: 'not tested' })
      console.log('CAP10 observations: ' + JSON.stringify(observations.filter(item => item.family === 'cap10')))
    }
    if (viewport === 'desktop') {
      // CAP-11: deterministic metadata, actual controls, no provider execution.
      await seed('postgres', 'builder', 'fresh', 'list', false)
      const callsBefore11 = queryCalls
      const columns11 = [...auditSqlResult.columns, {name:'created_at',dataTypeName:'timestamp with time zone'}, {name:'region',dataTypeName:'text'}]
      const schemas11 = [{name:'example',isSystem:false,relations:['events','sales'].map(name=>({schema:'example',name,qualifiedName:'example.'+name,kind:'r',columnsStatus:'loaded',columns:columns11}))}]
      await evaluate(`(() => {const s=window.__datakoalaStore,t=s.getState().tabs[0];s.setState({tabs:[{...t,builder:{...t.builder,timeColumn:'created_at',timeBucket:'hour',timeRange:{kind:'rolling',amount:7,unit:'day'},seriesColumns:[]},builderVisualization:{...t.builderVisualization,xColumn:'created_at',valueColumn:'value',aggregation:'sum'}}],metadataByProfileId:{'audit-postgres':{schemas:${rendererValue(schemas11)},status:'loaded',error:null,isStale:false}}})})()`)
      await settle()
      const combo11 = async label => {
        const selector = await evaluate(`(() => {const e=[...document.querySelectorAll('.builder-pane [role="combobox"]')].find(e=>e.getAttribute('aria-label')?.startsWith(${rendererValue(label+':')}) || e.getAttribute('aria-label')===${rendererValue(label)});if(!e)throw Error('Missing combo '+${rendererValue(label)});return '#'+CSS.escape(e.id)})()`)
        await click(selector)
      }
      const option11 = async label => {
        const selector = await evaluate(`(() => {const e=[...document.querySelectorAll('[role="option"]')].find(e=>e.querySelector('[data-combobox-option-label]')?.textContent.trim()===${rendererValue(label)});if(!e)throw Error('Missing option '+${rendererValue(label)});return '#'+CSS.escape(e.id)})()`)
        await click(selector)
      }
      const choose11 = async (label, option) => {await combo11(label);await option11(option)}
      // Use the rendered query's text rather than reconstructing generation in the harness.
      const readSql11 = () => evaluate(`document.querySelector('[aria-label="Generated SQL query"] .cm-content')?.innerText.trim()`)
      await click('[data-generated-query-panel] summary')
      await waitFor(win, `document.querySelector('[aria-label="Generated SQL query"] .cm-content')?.innerText.includes('SELECT')`, 'CAP11 generated SQL')
      const initial11 = await readSql11()
      await choose11('Table or view', 'sales')
      await waitFor(win, `window.__datakoalaStore.getState().tabs[0].builder.table.name==='sales'`, 'CAP11 relation mutation')
      // Relation selection intentionally invalidates dimensions; reselect through real controls.
      await choose11('Time column','created_at')
      await choose11('X axis','created_at')
      await choose11('Y axis','value')
      await choose11('Aggregation','Sum')
      await combo11('Time bucket')
      const unavailable11 = await evaluate(`(() => {const e=[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.includes('Minute'));return {text:e?.textContent,disabled:e?.getAttribute('aria-disabled')}})()`)
      if(unavailable11.disabled!=='true'||!unavailable11.text.includes('24 hours'))throw Error('CAP11 missing Minute rationale')
      await observe('cap11-bucket-disabled-desktop.png','.builder-pane','CAP-11 seven-day temporal X: Minute disabled with rationale')
      await key('Escape')
      await choose11('Time bucket','Hour')
      await click('[data-time-range-field] button')
      await clickText('Last hour','[role="dialog"]')
      await clickText('Confirm','[role="dialog"]')
      await combo11('Time bucket')
      const enabled11 = await evaluate(`(() => {const e=[...document.querySelectorAll('[role="option"]')].find(e=>e.querySelector('[data-combobox-option-label]')?.textContent==='Minute');return e && e.getAttribute('aria-disabled')!=='true'})()`)
      if(!enabled11)throw Error('CAP11 Minute not enabled for Last hour')
      await option11('Minute')
      await choose11('X axis','category')
      const independent11 = await readSql11()
      const state11 = await evaluate('window.__datakoalaStore.getState().tabs[0]')
      if(state11.builder.timeColumn!=='created_at'||state11.builderVisualization.xColumn!=='category'||!independent11.includes('created_at')||!independent11.includes('sales')||initial11===independent11)throw Error('CAP11 independent temporal filter or SQL mutation failed: '+independent11)
      await observe('cap11-independent-time-desktop.png','.builder-pane','CAP-11 category X and independent created_at time predicate after relation mutation')
      await choose11('Aggregation','Count')
      const count11 = await readSql11()
      if(!/count\(\*\)/i.test(count11)||await evaluate('window.__datakoalaStore.getState().tabs[0].builderVisualization.valueColumn')!==null)throw Error('CAP11 Count without Y failed')
      await observe('cap11-count-desktop.png','.builder-pane','CAP-11 Count clears Y and generates COUNT(*)')
      await choose11('Y axis','value')
      await choose11('Aggregation','Average')
      const average11 = await readSql11()
      if(!/avg\(/i.test(average11))throw Error('CAP11 Average SQL missing')
      // Series/dependent clearing uses named component/store tests; avoid a mocked cardinality claim.
      if(queryCalls!==callsBefore11)throw Error('CAP11 unexpectedly executed query')
      observations.push({family:'cap11',viewport,scenario:'relation-time-x-aggregation',initialSql:initial11,independentSql:independent11,countSql:count11,averageSql:average11,timeColumn:state11.builder.timeColumn,x:state11.builderVisualization.xColumn,minuteUnavailable:unavailable11,noQueryExecution:true,series:'source/named tests only',customRange:'source/named tests only'})
    }
    if (viewport === 'desktop') {
      // CAP-12 owns synthetic export/clipboard only. Never invoke a native save dialog.
      await seed('postgres','raw','fresh')
      cap12Ipc.active = true
      cap12Ipc.exports = []
      const before12 = queryCalls
      const nested12 = {user:{id:42,name:'Ada'},items:Array.from({length:70},(_,i)=>({id:i,ok:true,label:'雪'}))}
      const typed12 = {columns:[{name:'name',dataTypeName:'text'},{name:'value',dataTypeName:'int4'},{name:'at',dataTypeName:'timestamptz'},{name:'payload',dataTypeName:'jsonb'},{name:'notes',dataTypeName:'text'}],rows:[{name:'keep,z',value:2,at:'2026-08-19T16:00:00.000Z',payload:nested12,notes:'{"looks":"json"}'},{name:'keep "a"\n雪',value:1,at:null,payload:{ok:true},notes:'ordinary text'},{name:'excluded '+ 'long text '.repeat(30),value:null,at:null,payload:null,notes:'ordinary'}],rowCount:3,durationMs:7}
      const setResult12 = async (result, dates=false) => {
        await evaluate(`(() => {const store=window.__datakoalaStore,t=store.getState().tabs[0],r=${rendererValue(result)};if(${rendererValue(dates)})r.rows[0].at=new Date(r.rows[0].at);store.setState({tabs:[{...t,result:r,resultRevision:t.resultRevision+1,sqlResultFilters:[],queryError:null,running:false,sqlVisualization:{...t.sqlVisualization,view:'table'}}]})})()`)
        await settle()
        await waitFor(win, `document.querySelector('[data-result-table-pane] table')`, 'CAP12 table')
      }
      await evaluate(`(() => {window.__cap12Clipboard=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__cap12Clipboard.push(text)}}})})()`)
      await setResult12(typed12,true)
      await observe('cap12-typed-table-desktop.png','[data-result-table-pane]','CAP-12 typed SQL results: date, numeric/null, long text, native and text JSON')
      const jsonTrigger12 = '[aria-label="Explore JSON in payload, row 1"]'
      await evaluate(`document.querySelector(${rendererValue(jsonTrigger12)}).focus()`)
      await click(jsonTrigger12)
      await waitFor(win, `document.querySelector('[role="dialog"] pre')?.innerText.includes('"id": 42')`, 'CAP12 nested JSON')
      const jsonText12 = await evaluate(`document.querySelector('[role="dialog"] pre').innerText`)
      if(jsonText12!==JSON.stringify(nested12,null,2))throw Error('CAP12 JSON formatted text mismatch')
      await observe('cap12-json-desktop.png','[role="dialog"]','CAP-12 native JSON inspector with nested object/list and scrollable formatted value')
      const jsonFocus12 = await evaluate(`document.querySelector('[role="dialog"]').contains(document.activeElement)`)
      await evaluate(`document.querySelector('[role="dialog"] pre').scrollTop=400`)
      const jsonScroll12 = await evaluate(`document.querySelector('[role="dialog"] pre').scrollTop`)
      await clickText('Copy JSON','[role="dialog"]')
      await waitFor(win, `window.__cap12Clipboard.at(-1)===${rendererValue(JSON.stringify(nested12,null,2))}`, 'CAP12 exact JSON copy')
      await evaluate(`document.querySelector('[role="dialog"] pre').focus()`)
      await key('Tab')
      const tabInside12 = await evaluate(`document.querySelector('[role="dialog"]').contains(document.activeElement) && document.activeElement.textContent==='Copied'`)
      await key('Tab',['shift'])
      const shiftInside12 = await evaluate(`document.activeElement===document.querySelector('[role="dialog"] pre')`)
      await key('Escape')
      await waitFor(win, `!document.querySelector('[role="dialog"]') && document.activeElement===document.querySelector(${rendererValue(jsonTrigger12)})`, 'CAP12 Escape and focus restore')
      if(!jsonFocus12||!tabInside12||!shiftInside12||jsonScroll12<=0)throw Error('CAP12 JSON focus/scroll failed')
      await click('[aria-label="Explore JSON in notes, row 1"]')
      await waitFor(win, `document.querySelector('[role="dialog"] pre')?.innerText===${rendererValue(JSON.stringify({looks:'json'},null,2))}`, 'CAP12 second JSON text target')
      await click('[aria-label="Close JSON explorer"]')
      const malformed12={...typed12,rows:[{name:'malformed',value:0,at:null,payload:'{bad',notes:'ordinary text'}],rowCount:1}
      await setResult12(malformed12)
      await click(jsonTrigger12)
      await waitFor(win, `document.querySelector('[role="dialog"] [role="alert"]')?.textContent.includes('could not be formatted')`, 'CAP12 malformed JSON safety')
      await observe('cap12-json-invalid-desktop.png','[role="dialog"]','CAP-12 malformed native JSON remains raw with explicit formatting alert')
      await key('Escape')
      const csv12 = {columns:auditSqlResult.columns.map(c=>({...c,name:c.name==='category'?'name':c.name})),rows:[{name:'keep,z',value:2},{name:'excluded',value:null},{name:'keep "a"\n雪',value:1}],rowCount:3,durationMs:7}
      await setResult12(csv12)
      await typeLabel('Filter rows','')
      const valueHeader12 = '[data-result-table-pane] th:nth-child(2)'
      const values12 = () => evaluate(`[...document.querySelectorAll('[data-result-row-index]')].map(r=>r.querySelectorAll('[data-result-cell]')[1]?.firstElementChild?.textContent.trim())`)
      await click(valueHeader12)
      const asc12=await values12()
      await click(valueHeader12)
      const desc12=await values12()
      await click(valueHeader12)
      const none12=await values12()
      if(asc12.join('|')!=='1|2|␀'||desc12.join('|')!=='␀|2|1'||none12.join('|')!=='2|␀|1')throw Error('CAP12 sort cycle/null mismatch '+JSON.stringify({asc12,desc12,none12}))
      await typeLabel('Filter rows','keep')
      await click(valueHeader12)
      await observe('cap12-filtered-table-desktop.png','[data-result-table-pane]','CAP-12 local text filter and numeric ascending sort before exact CSV Copy/Export')
      const csvExpected12='name,value\n"keep ""a""\n雪",1\n"keep,z",2'
      await click('[aria-label="Copy CSV"]')
      await waitFor(win, `window.__cap12Clipboard.at(-1)===${rendererValue(csvExpected12)}`, 'CAP12 exact filtered CSV copy')
      await clickText('Export CSV','[data-result-toolbar]')
      await delay(100)
      if(cap12Ipc.exports.at(-1)?.content!==csvExpected12||cap12Ipc.exports.at(-1)?.defaultName!=='datakoala_results.csv')throw Error('CAP12 matching export payload failed')
      const sortBeforeResize12=await evaluate(`document.querySelector('[data-result-table-pane] thead').innerText`)
      const widthBefore12=await evaluate(`document.querySelector('[data-result-table-pane] th').getBoundingClientRect().width`)
      await dragDivider(win,'[aria-label="Resize name column"]',-120,0)
      const sortAfterResize12=await evaluate(`document.querySelector('[data-result-table-pane] thead').innerText`)
      const widthAfter12=await evaluate(`document.querySelector('[data-result-table-pane] th').getBoundingClientRect().width`)
      if(Math.abs(widthBefore12-widthAfter12)<10||widthAfter12<80||widthAfter12>720)throw Error('CAP12 real column resize failed '+JSON.stringify({widthBefore12,widthAfter12}))
      await observe('cap12-resized-table-desktop.png','[data-result-table-pane]','CAP-12 native pointer column resize and resulting header sort state with Copy feedback')
      await typeLabel('Filter rows','no-match-12')
      await click('[aria-label="Copy CSV"]')
      await waitFor(win, `window.__cap12Clipboard.at(-1)==='name,value'`, 'CAP12 empty filtered CSV headers')
      await clickText('Export CSV','[data-result-toolbar]')
      await delay(100)
      if(cap12Ipc.exports.at(-1)?.content!=='name,value')throw Error('CAP12 empty export failed')
      await typeLabel('Filter rows','')
      const large12={...csv12,rows:Array.from({length:200},(_,value)=>({name:'row '+value,value})),rowCount:200}
      await setResult12(large12)
      const mounted12=await evaluate(`document.querySelectorAll('[data-result-row-index]').length`)
      if(mounted12>=200)throw Error('CAP12 virtual cohort not bounded')
      // New result retains local sort state: ascending from the earlier cycle.
      const expectedLarge12='name,value\n'+large12.rows.map(r=>r.name+','+r.value).join('\n')
      await click('[aria-label="Copy CSV"]')
      await waitFor(win, `window.__cap12Clipboard.at(-1)===${rendererValue(expectedLarge12)}`, 'CAP12 all virtual rows copied')
      await clickText('Export CSV','[data-result-toolbar]')
      await delay(100)
      if(cap12Ipc.exports.at(-1)?.content!==expectedLarge12)throw Error('CAP12 all virtual rows export failed')
      if(queryCalls!==before12)throw Error('CAP12 presentation unexpectedly ran a query')
      observations.push({family:'cap12',viewport,scenario:'table-csv-json',sort:{ascending:asc12,descending:desc12,none:none12},csvExpected:csvExpected12,copyMatchesExport:true,emptyFilteredCsv:'name,value',virtualRows:200,mountedRows:mounted12,fullVirtualPayloadExact:true,resize:{before:widthBefore12,after:widthAfter12,sortBefore:sortBeforeResize12,sortAfter:sortAfterResize12,sortChanged:sortBeforeResize12!==sortAfterResize12},json:{exactFormattedCopy:true,nested:true,scrolled:jsonScroll12,initialFocusInside:jsonFocus12,tabInside:tabInside12,shiftTabInside:shiftInside12,escapeRestoredFocus:true,secondTextTarget:true,malformedAlert:true},nativeClipboard:'unverified',nativeFilesystem:'unverified',noQueryExecution:true})
      cap12Ipc.active=false
    }
    if (viewport === 'desktop') {
      await seed('postgres','raw','default')
      const before13=queryCalls
      const summary13='[data-result-row-index="0"] [aria-label="Filter actions for category"]'
      const menu13='[data-result-row-index="0"] td:first-child details'
      const focus13=()=>evaluate(`(() => {const m=document.querySelector(${rendererValue(menu13)}),a=document.activeElement;return {open:m?.open,tag:a?.tagName,label:a?.getAttribute('aria-label'),text:a?.textContent?.trim().slice(0,80),summary:a===m?.querySelector('summary')}})()`)
      await evaluate(`${select(summary13)}.focus()`)
      await key('Enter')
      await waitFor(win,`${select(menu13)}.open`,'CAP13 non-null menu open')
      if(!(await evaluate(`${select(menu13)}.innerText.includes('Filter to this value') && ${select(menu13)}.innerText.includes('Exclude this value')`)))throw Error('CAP13 non-null actions')
      await observe('cap13-cell-menu-desktop.png',menu13,'CAP-13 actual non-null menu opened by native Enter')
      const onSummary13=await focus13()
      await key('Tab')
      const onAction13=await focus13()
      await key('Escape')
      const escaped13=await focus13()
      // Native pointer outside click; <details> does not automatically imply light-dismiss.
      await click(summary13)
      const outsidePoint13=await evaluate(`(() => {const r=document.querySelector('[data-query-toolbar]').getBoundingClientRect();return{x:Math.round(r.x+180),y:Math.round(r.y+r.height/2)}})()`)
      win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...outsidePoint13})
      win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...outsidePoint13})
      await settle()
      const outside13=await focus13()
      await evaluate(`${select(menu13)}.removeAttribute('open')`)
      // Controlled null row, independent of production data/provider.
      await evaluate(`(() => {const s=window.__datakoalaStore,t=s.getState().tabs[0];s.setState({tabs:[{...t,result:{...t.result,rows:[{category:null,value:1},{category:'A',value:2},{category:'B',value:3}],rowCount:3},resultRevision:t.resultRevision+1}]})})()`)
      await click(summary13)
      await waitFor(win,`${select(menu13)}.open && ${select(menu13)}.innerText.includes('Show only NULL') && ${select(menu13)}.innerText.includes('Exclude NULL')`,'CAP13 null actions')
      await observe('cap13-null-menu-desktop.png',menu13,'CAP-13 null-specific include/exclude actions')
      await clickText('Show only NULL',menu13)
      await waitFor(win,`document.querySelectorAll('[data-result-row-index]').length===1 && document.querySelector('[data-result-filter-chip]')?.innerText.includes('category is NULL')`,'CAP13 actual local null filter')
      if(await evaluate(`document.querySelector('[data-result-filter-chip]').innerText.includes('Apply to SQL')`))throw Error('CAP13 raw mode promotion leaked')
      await observe('cap13-local-filter-desktop.png','[data-result-table-pane]','CAP-13 client-only null chip, one of three rows, raw SQL has no promotion')
      await click('[aria-label="Remove filter category is NULL"]')
      await waitFor(win,`document.querySelectorAll('[data-result-row-index]').length===3 && !document.querySelector('[data-result-filter-chip]')`,'CAP13 remove local filter')
      if(queryCalls!==before13)throw Error('CAP13 client filtering executed query')
      await seed('postgres','builder','default','list',false)
      await evaluate(`(() => {const s=window.__datakoalaStore,t=s.getState().tabs[0],m=s.getState().metadataByProfileId[t.connectionProfileId];const schemas=m.schemas.map(sc=>({...sc,relations:sc.relations.map(r=>({...r,columns:[...r.columns,{name:'created_at',dataTypeName:'timestamptz'}]}))}));s.setState({metadataByProfileId:{[t.connectionProfileId]:{...m,schemas}},tabs:[{...t,builder:{...t.builder,timeColumn:'created_at',seriesColumns:['category']},builderVisualization:{...t.builderVisualization,xColumn:'category',valueColumn:'value',aggregation:'sum',view:'table'}}]})})()`)
      await settle()
      await evaluate(`window.__datakoalaStore.getState().setBuilderHasRun(true)`)
      await settle()
      await click(summary13)
      await clickText('Filter to this value',menu13)
      await waitFor(win,`[...document.querySelectorAll('[data-result-filter-chip] button')].some(b=>b.textContent==='Apply to SQL')`,'CAP13 compatible category promotion')
      const localBuilder13=queryCalls
      cap10Ipc.active=true;cap10Ipc.calls=[]
      await evaluate(`window.__datakoalaStore.getState().setBuilderHasRun(true)`)
      await settle()
      await clickText('Apply to SQL','[aria-label="Active result filters"]')
      await waitFor(win,`window.__datakoalaStore.getState().tabs[0].builderResultFilters[0]?.execution==='query' && !window.__datakoalaStore.getState().tabs[0].running`,'CAP13 promoted query settled')
      const promoted13=await evaluate(`window.__datakoalaStore.getState().tabs[0].builderResultFilters`)
      const promotionCalls13=queryCalls-localBuilder13
      await observe('cap13-query-filter-desktop.png','[data-result-table-pane]','CAP-13 Builder query-owned chip after Apply to SQL; execution delta recorded separately')
      await clickText('Move to client','[aria-label="Active result filters"]')
      await waitFor(win,`window.__datakoalaStore.getState().tabs[0].builderResultFilters[0]?.execution==='client' && !window.__datakoalaStore.getState().tabs[0].running`,'CAP13 demotion')
      await click('[data-result-filter-chip] button[aria-label^="Remove filter"]')
      // Nonpromotable value column: UI must omit Apply to SQL.
      await click('[data-result-row-index="0"] [aria-label="Filter actions for value"]')
      await clickText('Filter to this value','[data-result-row-index="0"] td:nth-child(2) details')
      const nonpromotable13=await evaluate(`![...document.querySelectorAll('[data-result-filter-chip] button')].some(b=>b.textContent==='Apply to SQL')`)
      if(!nonpromotable13)throw Error('CAP13 value aggregate wrongly promotable')
      // The disabled demotion reason is covered by the named controlled UI test.
      // Do not inject an invalid Builder predicate: generator validation must remain authoritative.
      const blocked13={evidence:'ResultsTable.controlled.ui.test.tsx uses Builder execution and promotion/demotion callbacks; resultFilterDemotion source',native:'unverified'}
      await evaluate(`(() => {const s=window.__datakoalaStore,t=s.getState().tabs[0];s.setState({tabs:[{...t,builderResultFilters:[{id:'cap13-first',column:'value',operator:'equals',value:42,execution:'client'},{id:'cap13-second',column:'category',operator:'isNotNull',execution:'client'}]}]})})()`)
      await settle()
      await clickText('Clear all','[aria-label="Active result filters"]')
      await waitFor(win,`!document.querySelector('[data-result-filter-chip]')`,'CAP13 clear chips')
      observations.push({family:'cap13',viewport,scenario:'cell-local-query-filter',rawLocalQueryDelta:0,rawRows:{before:3,filtered:1,removed:3},focus:{onSummary:onSummary13,onAction:onAction13,escape:escaped13,outsideClick:outside13},promoted:promoted13,promotionQueryDelta:promotionCalls13,promotionRequests:cap10Ipc.calls,demotion:'actual allowed action',nonpromotableValueHidesAction:nonpromotable13,blockedDemotion:blocked13,blockedDemotionSetup:'named component test only; no invalid predicate injection',clearAll:true,provider:'synthetic IPC only'})
      cap10Ipc.active=false
    }
    if (viewport === 'desktop') {
      await seed('postgres','raw','default')
      await evaluate(`(() => {const s=window.__datakoalaStore,t=s.getState().tabs[0];s.setState({tabs:[{...t,sql:'SELECT 1;',showExplain:false,explainTree:null,explainText:null,explainSnapshot:null,activeExplainRequest:null}]})})()`)
      const before14=queryCalls
      cap14Ipc.calls=[]
      const busy14=[]
      for(const mode of ['explain','analyze']) {
        cap14Ipc.outcome='pending'
        await clickText(mode==='explain'?'Explain':'Explain Analyze','[data-query-toolbar]')
        await waitFor(win,`document.querySelector('[data-testid="explain-loading-overlay"]') && window.__datakoalaStore.getState().tabs[0].activeExplainRequest===${rendererValue(mode)}`,'CAP14 busy '+mode)
        const state14=await evaluate(`(() => {const t=document.querySelector('[data-query-toolbar]'),p=document.querySelector('[aria-label="Explain results"]');return {mode:${rendererValue(mode)},heading:p.querySelector('h1').innerText,message:p.querySelector('[role="status"]').innerText,buttons:[...t.querySelectorAll('button.explain-action')].map(b=>({text:b.textContent.trim(),disabled:b.disabled})),editorEditable:document.querySelector('[aria-label="SQL editor"] .cm-content')?.getAttribute('contenteditable')}})()`)
        if(state14.buttons.length!==2||state14.buttons.some(b=>!b.disabled))throw Error('CAP14 busy guards missing')
        const count14=cap14Ipc.calls.length
        await evaluate(`document.querySelector('[data-query-toolbar] button.explain-action').click()`)
        await settle()
        if(cap14Ipc.calls.length!==count14)throw Error('CAP14 repeated Explain bypassed guard')
        await clickText('Builder','[aria-label="Query mode"]')
        if(await evaluate(`window.__datakoalaStore.getState().tabs[0].queryMode!=='sql'`))throw Error('CAP14 mode switch bypassed busy guard')
        state14.modeSwitchGuard=true
        busy14.push(state14)
        for(let i=0;!cap14Ipc.release&&i<50;i++)await delay(20)
        if(!cap14Ipc.release)throw Error('CAP14 deferred IPC not reached')
        cap14Ipc.release()
        await waitFor(win,`!window.__datakoalaStore.getState().tabs[0].activeExplainRequest && document.querySelector('[aria-label="Execution plan diagram"]')?.getAttribute('data-node-count')==='3'`,'CAP14 settled tree')
        await waitFor(win,`document.querySelector('[data-node-id="0.1"]')`,'CAP14 graph child')
        const point14=await evaluate(`(() => {const r=document.querySelector('[data-node-id="0.1"]').getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
        win.webContents.sendInputEvent({type:'mouseMove',...point14})
        win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point14})
        win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point14})
        await waitFor(win,`document.querySelector('[aria-label="Execution plan diagram"]').getAttribute('data-selected-node-id')==='0.1' && document.querySelector('[aria-label="Plan node details"] h2').innerText==='Index Scan'`,'CAP14 native graph selection')
        const snapshot14=await evaluate(`window.__datakoalaStore.getState().tabs[0].explainSnapshot`)
        if(snapshot14.mode!==mode||snapshot14.query!=='SELECT 1;')throw Error('CAP14 snapshot mismatch')
        if(mode==='analyze'&&snapshot14.executionTimeMs!==3.8)throw Error('CAP14 timing missing')
        await observe(`cap14-${mode}-desktop.png`,'[aria-label="Explain results"]','CAP-14 '+mode+' response, native selected Index Scan child and inspector')
        await clickText('Close','[aria-label="Explain results"]')
        await waitFor(win,`!document.querySelector('[aria-label="Explain results"]')`,'CAP14 return to toolbar')
      }
      cap14Ipc.outcome='error'
      await clickText('Explain Analyze','[data-query-toolbar]')
      await waitFor(win,`window.__datakoalaStore.getState().tabs[0].explainText==='Synthetic EXPLAIN provider failure' && !window.__datakoalaStore.getState().tabs[0].activeExplainRequest`,'CAP14 injected failure')
      const failure14=await evaluate(`(() => {const t=window.__datakoalaStore.getState().tabs[0];return{tree:t.explainTree,snapshot:t.explainSnapshot,text:t.explainText}})()`)
      if(failure14.tree!==null)throw Error('CAP14 failure unexpectedly kept old tree')
      await click('[aria-label="Explain results"] details summary')
      await observe('cap14-error-desktop.png','[aria-label="Explain results"]','CAP-14 failure replaces prior plan with disclosed error text; provider is mocked')
      await clickText('Close','[aria-label="Explain results"]')
      await waitFor(win,`!document.querySelector('[aria-label="Explain results"]')`,'CAP14 close')
      if(queryCalls!==before14)throw Error('CAP14 ordinary Run unexpectedly invoked')
      observations.push({family:'cap14',viewport,scenario:'explain-analyze-graph',requests:cap14Ipc.calls,busy:busy14,selectedNodeId:'0.1',failure:failure14,closed:true,ordinaryRunDelta:0,staleGeneration:'named QueryEditor/lifecycle tests only',provider:'synthetic deferred IPC; benign SELECT 1 only'})
      cap14Ipc.outcome='success'
    }
    if (viewport === 'desktop') {
      await seed('postgres','raw','default')
      const before15=queryCalls, requests15=[]
      let configured15=true,outcome15='success',release15=null,cancels15=0
      const handle15=(channel,handler)=>{auditIpc.removeHandler(channel);auditIpc.handle(channel,handler)}
      handle15('ai:settings:get',()=>({ok:true,value:{provider:'openrouter',model:'audit/model',hasApiKey:configured15}}))
      handle15('ai:cancel',()=>{cancels15++;return{ok:true,value:null}})
      const original15='SELECT category, value FROM example.events;'
      const proposed15='SELECT category, value FROM example.events LIMIT 2;'
      handle15('ai:propose',async (_event,request)=>{
        requests15.push({intent:request.intent,currentQuery:request.currentQuery,language:request.context?.language,error:request.error??null})
        const outcome=outcome15
        if(outcome==='pending')await new Promise(done=>{release15=()=>{release15=null;done()}})
        if(outcome==='error')return{ok:false,code:'invalid-response',message:'Synthetic invalid AI response'}
        return{ok:true,value:{kind:'proposal',proposal:{query:proposed15,explanation:'Limit the public synthetic event result to two rows.',assumptions:['The events relation is synthetic.']}}}
      })
      await evaluate(`window.dispatchEvent(new Event('datakoala:ai-settings-changed'))`)
      await waitFor(win,`document.querySelector('[aria-label="SQL AI copilot"]')`,'CAP15 configured copilot')
      const sql15=()=>evaluate(`window.__datakoalaStore.getState().tabs[0].sql`)
      const setSql15=async sql=>{await evaluate(`window.__datakoalaStore.getState().setSql(${rendererValue(sql)})`);await settle()}
      const scope15='[aria-label="SQL AI copilot"]'
      const prompt15='[data-field-name="AI prompt"] input'
      const waitReview15=()=>waitFor(win,`document.querySelector('[aria-label="SQL proposal diff"]') && [...document.querySelectorAll(${rendererValue(scope15+' button')})].some(b=>b.textContent==='Apply')`,'CAP15 proposal diff')
      const waitPending15=async()=>{for(let i=0;!release15&&i<100;i++)await delay(20);if(!release15)throw Error('CAP15 request did not reach deferred IPC')}
      await setSql15(original15)
      await type(prompt15,'Show two events')
      outcome15='pending';await click('[aria-label="Ask"]');await waitPending15()
      const pending15=await evaluate(`document.querySelector(${rendererValue(scope15)}).innerText.includes('Generating query') && document.querySelector(${rendererValue(prompt15)}).disabled`)
      if(!pending15)throw Error('CAP15 pending feedback missing')
      await clickText('Cancel',scope15);release15();await delay(100)
      if(await sql15()!==original15||await evaluate(`!!document.querySelector('[aria-label="SQL proposal diff"]')`))throw Error('CAP15 cancelled proposal mutated SQL/review')
      outcome15='success';await click('[aria-label="Ask"]');await waitReview15()
      if(await sql15()!==original15)throw Error('CAP15 SQL changed before Apply')
      await click('[aria-label="View AI details"]')
      await waitFor(win,`[...document.querySelectorAll('[data-popover-overlay]')].some(n=>n.textContent.includes('Submitted context') && n.textContent.includes('Limit the public synthetic'))`,'CAP15 submitted context and reasoning')
      await key('Escape')
      await clickText('Reject',scope15)
      if(await sql15()!==original15)throw Error('CAP15 Reject changed original SQL')
      await click('[aria-label="Ask"]');await waitReview15();await clickText('Apply',scope15)
      await waitFor(win,`window.__datakoalaStore.getState().tabs[0].sql===${rendererValue(proposed15)} && document.querySelector(${rendererValue(prompt15)}).value===''`,'CAP15 explicit Apply')
      if(queryCalls!==before15)throw Error('CAP15 copilot implicitly ran SQL')
      await setSql15(original15);await type(prompt15,'Show two events');await click('[aria-label="Ask"]');await waitReview15()
      const manual15='SELECT category FROM example.events;'
      await setSql15(manual15)
      await waitFor(win,`[...document.querySelectorAll(${rendererValue(scope15+' button')})].some(b=>b.textContent==='Apply' && b.disabled) && document.querySelector(${rendererValue(scope15)}).innerText.includes('connection changed')`,'CAP15 stale query review')
      await observe('cap15-stale-query-desktop.png',scope15,'CAP-15 stale proposal after manual SQL edit; Apply disabled, no query execution')
      await clickText('Reject',scope15)
      outcome15='error';await click('[aria-label="Ask"]')
      await waitFor(win,`document.querySelector(${rendererValue(scope15)}).innerText.includes("couldn't produce a usable query")`,'CAP15 model error')
      if(await sql15()!==manual15||queryCalls!==before15)throw Error('CAP15 model error replaced SQL/executed')
      // A classified synthetic SQL failure creates the real repair entry point.
      await setSql15('SELECT missing_column FROM example.events;')
      queryOutcome='query-error';await clickText('Run','[data-query-toolbar]')
      await waitFor(win,`[...document.querySelectorAll('button')].some(b=>b.textContent==='Fix with AI') && !window.__datakoalaStore.getState().tabs[0].running`,'CAP15 SQL failure repair entry')
      queryOutcome='success'
      const repairBase15=queryCalls,failed15=await sql15()
      const repairScope15='[aria-label="AI query repair review"]'
      outcome15='success';await clickText('Fix with AI')
      await waitFor(win,`document.querySelector(${rendererValue(repairScope15)}) && document.querySelector('[aria-label="SQL proposal diff"]')`,'CAP15 repair diff')
      const diff15=await evaluate(`document.querySelector('[aria-label="SQL proposal diff"]').textContent`)
      outcome15='error';await clickText('Try again',repairScope15)
      await waitFor(win,`document.querySelector(${rendererValue(repairScope15+' [role="alert"]')})?.innerText.includes("couldn't produce a usable repair")`,'CAP15 retry error retains prior diff')
      if(await sql15()!==failed15||await evaluate(`document.querySelector('[aria-label="SQL proposal diff"]').textContent`)!==diff15)throw Error('CAP15 failed retry destroyed valid diff/SQL')
      await observe('cap15-repair-retry-error-desktop.png',repairScope15,'CAP-15 repair retry failure preserves previous diff and failed SQL')
      outcome15='pending';await clickText('Try again',repairScope15);await waitPending15();await clickText('Cancel',repairScope15);release15();await delay(100)
      if(await sql15()!==failed15)throw Error('CAP15 repair Cancel changed SQL')
      await clickText('Reject',repairScope15)
      if(await sql15()!==failed15)throw Error('CAP15 repair Reject changed SQL')
      outcome15='success';await clickText('Fix with AI')
      await waitFor(win,`document.querySelector(${rendererValue(repairScope15)})`,'CAP15 second repair')
      await clickText('Apply',repairScope15)
      await waitFor(win,`window.__datakoalaStore.getState().tabs[0].sql===${rendererValue(proposed15)}`,'CAP15 explicit repair Apply')
      if(queryCalls!==repairBase15||repairBase15!==before15+1)throw Error('CAP15 repair implicitly ran SQL')
      observations.push({family:'cap15',viewport,scenario:'copilot-repair',originalSql:original15,proposedSql:proposed15,pendingDisabled:pending15,rejectPreservedExactOriginal:true,applyExplicit:true,staleManualSql:manual15,staleApplyDisabled:true,modelErrorPreservesSql:true,repairFailedSql:failed15,failedRetryPreservesDiff:true,repairCancelAndRejectPreserveSql:true,cancelRequests:cancels15,requests:requests15,explicitFailureRunDelta:1,implicitRunDelta:0,provider:'synthetic sanitized IPC; no real model',otherDialects:'ordinary preview and named tests only'})
      configured15=false;await evaluate(`window.dispatchEvent(new Event('datakoala:ai-settings-changed'))`)
      await waitFor(win,`!document.querySelector('[aria-label="SQL AI copilot"]')`,'CAP15 reset temporary AI settings')
      handle15('ai:settings:get',()=>({ok:true,value:{provider:'openrouter',model:'',hasApiKey:false}}));auditIpc.removeHandler('ai:propose')
      handle15('ai:cancel',()=>({ok:true,value:null}))
    }
    if (viewport === 'desktop') {
      capPromIpc.active=true;capPromIpc.calls=[]
      const before16=queryCalls
      await seed('prometheus','raw','default')
      capPromIpc.formatFailure=true
      await clickText('Format','[data-query-toolbar]')
      await waitFor(win,`document.body.innerText.includes('Synthetic PromQL formatting failure')`,'CAP16 local format error feedback')
      capPromIpc.formatFailure=false
      await seed('prometheus','builder','default')
      await evaluate(`(() => {const s=window.__datakoalaStore,t=s.getState().tabs[0];s.setState({metadataByProfileId:{'audit-prometheus':{schemas:${rendererValue(auditPromSchemas)},status:'loaded',error:null,isStale:false}},tabs:[{...t,sql:'sum(up)',promqlBuilder:{metric:'audit_requests_total',filterBy:[],groupBy:[],labelValues:{},calculation:'raw',aggregation:'none',window:'5m',percentile:0.95,histogramKindOverride:'auto'}}]})})()`)
      await settle()
      await dragDivider(win,'.editor-resizer',0,200)
      const combo16=async label=>{
        const selector=await evaluate(`(() => {const e=[...document.querySelectorAll('[data-query-toolbar] [role="combobox"],.promql-builder-form [role="combobox"]')].find(e=>e.getAttribute('aria-label')?.startsWith(${rendererValue(label+':')})||e.getAttribute('aria-label')===${rendererValue(label)});if(!e)throw Error('Missing combo '+${rendererValue(label)});return '#'+CSS.escape(e.id)})()`)
        await click(selector)
      }
      const option16=async label=>{
        await waitFor(win,`[...document.querySelectorAll('[role="option"]')].some(e=>e.querySelector('[data-combobox-option-label]')?.textContent.trim()===${rendererValue(label)})`,'CAP16 option '+label)
        const selector=await evaluate(`(() => {const e=[...document.querySelectorAll('[role="option"]')].find(e=>e.querySelector('[data-combobox-option-label]')?.textContent.trim()===${rendererValue(label)});return '#'+CSS.escape(e.id)})()`)
        await click(selector)
      }
      const choose16=async(label,option)=>{await combo16(label);await option16(option)}
      await click('[data-generated-query-panel] summary')
      const generated16=()=>evaluate(`document.querySelector('[aria-label="Generated PromQL query"] .cm-content')?.innerText.trim()??''`)
      const cases16=[]
      await choose16('Calculation','Rate')
      await choose16('Aggregation','Sum')
      await waitFor(win,`document.querySelector('[aria-label="Generated PromQL query"]')?.innerText.includes('rate(')`,'CAP16 counter Rate')
      cases16.push({case:'known-counter-rate',query:await generated16()})
      await waitFor(win,`!document.body.innerText.includes('Synthetic PromQL formatting failure')`,'CAP16 formatter feedback dismissed normally')
      await observe('cap16-counter-desktop.png','.promql-builder-form','CAP-16 known counter Rate/Sum with generated PromQL')
      await choose16('Calculation','Increase')
      if(!(await generated16()).includes('increase('))throw Error('CAP16 Increase query mismatch')
      cases16.push({case:'known-counter-increase',query:await generated16()})
      await choose16('Metric','audit_duration_seconds_bucket')
      await choose16('Calculation','Percentile')
      await choose16('Percentile','P99')
      await waitFor(win,`document.querySelector('[aria-label="Generated PromQL query"]')?.innerText.includes('0.99')`,'CAP16 classic P99')
      const classic16=await generated16()
      if(!classic16.replace(/\s/g,'').includes('sumby(le)')||!classic16.includes('rate('))throw Error('CAP16 Classic shape mismatch '+classic16)
      cases16.push({case:'known-classic-P99',query:classic16})
      await observe('cap16-classic-desktop.png','.promql-builder-form','CAP-16 metadata/label-known Classic histogram P99; le aggregation retained')
      await choose16('Metric','audit_mystery')
      await choose16('Calculation','Percentile')
      await waitFor(win,`document.querySelector('.promql-builder-form').innerText.includes('Choose Classic histogram or Native histogram')`,'CAP16 ambiguous fail closed')
      if(await generated16()!=='')throw Error('CAP16 unknown histogram generated a query')
      const unknownRunDisabled16=await evaluate(`[...document.querySelectorAll('[data-query-toolbar] button')].find(b=>b.textContent.trim()==='Run')?.disabled`)
      if(!unknownRunDisabled16)throw Error('CAP16 unknown histogram Run not guarded')
      await observe('cap16-unknown-desktop.png','.promql-builder-form','CAP-16 unknown histogram Auto guards generation until an explicit representation')
      await choose16('Histogram representation','Classic histogram')
      await choose16('Percentile','P99')
      const manualClassic16=await generated16()
      if(!manualClassic16.replace(/\s/g,'').includes('histogram_quantile(0.99')||!manualClassic16.replace(/\s/g,'').includes('sumby(le)'))throw Error('CAP16 manual Classic mismatch')
      cases16.push({case:'manual-classic',query:manualClassic16})
      await choose16('Histogram representation','Native histogram')
      const native16=await generated16()
      if(!native16.replace(/\s/g,'').includes('histogram_quantile(0.99')||native16.replace(/\s/g,'').includes('by(le)'))throw Error('CAP16 native query mismatch '+native16)
      cases16.push({case:'manual-native',query:native16})
      if(await evaluate(`!!document.querySelector('.promql-builder-form [data-field-name="Aggregation"]')`))throw Error('CAP16 native histogram exposed ordinary aggregation')
      await observe('cap16-native-desktop.png','.promql-builder-form','CAP-16 explicit Native histogram P99; ordinary aggregation omitted')
      await choose16('Metric','audit_native_latency')
      await choose16('Calculation','Observation rate')
      const knownNative16=await generated16()
      if(!knownNative16.includes('histogram_count'))throw Error('CAP16 known native calculation mismatch '+knownNative16)
      cases16.push({case:'known-native-observation-rate',query:knownNative16})
      if(await evaluate(`window.__datakoalaStore.getState().tabs[0].sql`)!=='sum(up)')throw Error('CAP16 Builder overwrote raw draft')
      await clickText('Open in PromQL mode','[data-generated-query-panel]')
      await waitFor(win,`window.__datakoalaStore.getState().tabs[0].queryMode==='sql' && document.querySelector('[aria-label="PromQL editor"]')`,'CAP16 explicit generated handoff')
      const raw16=await evaluate(`window.__datakoalaStore.getState().tabs[0].sql`)
      if(raw16.trim()!==knownNative16||queryCalls!==before16)throw Error('CAP16 handoff changed query or ran provider')
      observations.push({family:'cap16',viewport,scenario:'calculation-histogram',cases:cases16,unknownAutoGenerated:false,unknownRunDisabled:unknownRunDisabled16,percentile:0.99,rawDraftPreservedUntilExplicitOpen:true,openedRaw:raw16,queryDelta:0,metadataCalls:capPromIpc.calls,formatFailure:'synthetic API failure observed; formatter correctness named tests only',provider:'synthetic metric metadata and formatter; no Prometheus query'})
      capPromIpc.active=false
    }
    if (viewport === 'desktop') {
      // CAP-17: bounded metadata, actual React controls, counted synthetic query IPC.
      capPromIpc.active=true;capPromIpc.calls=[]
      await seed('prometheus','builder','fresh','list',false)
      await evaluate(`(() => {const s=window.__datakoalaStore,t=s.getState().tabs[0];s.setState({metadataByProfileId:{'audit-prometheus':{schemas:${rendererValue(auditPromSchemas)},status:'loaded',error:null,isStale:false}},tabs:[{...t,sql:'sum(up)',prometheusStep:'auto',promqlBuilder:{metric:'audit_requests_total',filterBy:[],groupBy:[],labelValues:{},calculation:'rate',aggregation:'sum',window:'5m',percentile:0.95,histogramKindOverride:'auto'}}]})})()`)
      await settle();await dragDivider(win,'.editor-resizer',0,250)
      const before17=queryCalls
      const combo17=async label=>{
        await waitFor(win,`[...document.querySelectorAll('[role="combobox"]')].some(e=>e.getAttribute('aria-label')?.startsWith(${rendererValue(label+':')}) && !e.disabled)`,'CAP17 enabled '+label)
        const selector=await evaluate(`(() => {const e=[...document.querySelectorAll('[data-query-toolbar] [role="combobox"],.promql-builder-form [role="combobox"]')].find(e=>e.getAttribute('aria-label')?.startsWith(${rendererValue(label+':')}));if(!e)throw Error('CAP17 missing combo '+${rendererValue(label)});return '#'+CSS.escape(e.id)})()`)
        await click(selector)
      }
      const option17=async label=>{
        await waitFor(win,`[...document.querySelectorAll('[role="option"]')].some(e=>e.querySelector('[data-combobox-option-label]')?.textContent.trim()===${rendererValue(label)})`,'CAP17 option '+label)
        await evaluate(`(() => {const e=[...document.querySelectorAll('[role="option"]')].find(e=>e.querySelector('[data-combobox-option-label]')?.textContent.trim()===${rendererValue(label)});e.click()})()`)
        await settle()
      }
      const choose17=async(label,option,multi=false)=>{await combo17(label);await option17(option);if(multi)await key('Escape')}
      const state17=()=>evaluate(`window.__datakoalaStore.getState().tabs[0].promqlBuilder`)
      const generated17=()=>evaluate(`document.querySelector('[aria-label="Generated PromQL query"] .cm-content')?.innerText.trim()??''`)
      const exact17=async expected=>{await waitFor(win,`document.querySelector('[aria-label="Generated PromQL query"] .cm-content')?.innerText.trim()===${rendererValue(expected)}`,'CAP17 exact generated query')}
      await click('[data-generated-query-panel] summary')
      await choose17('Rate window','10m')
      await exact17('sum(rate(audit_requests_total[10m]))')
      await choose17('Group by','service',true)
      await choose17('Filter by','environment',true)
      await choose17('environment values','production',true)
      await choose17('environment values','staging',true)
      await choose17('service values','api',true)
      const independent17='sum by (service) (\n  rate(audit_requests_total{service="api",environment=~"production|staging"}[10m])\n)'
      await exact17(independent17)
      const selected17=await state17()
      if(selected17.groupBy.join()!=='service'||selected17.filterBy.join()!=='environment'||selected17.labelValues.environment.join()!=='production,staging')throw Error('CAP17 independent multi selection failed')
      await observe('cap17-labels-desktop.png','.promql-builder-form','CAP-17 independent grouping/filter dimensions, shared value matchers and 10m window')
      // Shared label in both dimensions: removing only one must retain values.
      await choose17('Filter by','service',true)
      await choose17('Group by','service',true)
      const retained17=await state17()
      if(retained17.groupBy.length||!retained17.filterBy.includes('service')||retained17.labelValues.service?.[0]!=='api')throw Error('CAP17 shared label values lost on one-dimension removal')
      await choose17('Filter by','service',true)
      if((await state17()).labelValues.service!==undefined)throw Error('CAP17 removed label values not pruned')
      await combo17('environment values');await clickText('Clear all','[role="listbox"]');await key('Escape')
      await exact17('sum(rate(audit_requests_total[10m]))')
      // No custom values: unknown search leaves no option and no matcher mutation.
      await combo17('environment values');await type('[aria-label="Search environment values"]','not-a-real-value')
      await waitFor(win,`document.querySelectorAll('[role="option"]').length===0 && document.querySelector('[role="listbox"]').innerText.includes('No matching options')`,'CAP17 unmatched value guard')
      await key('Enter');await key('Escape')
      if((await state17()).labelValues.environment?.length)throw Error('CAP17 unknown search committed an unsupported value')
      await choose17('Filter by','instance',true)
      await waitFor(win,`[...document.querySelectorAll('[role="combobox"]')].some(e=>e.getAttribute('aria-label')==='instance values: Select values…' && !e.disabled)`,'CAP17 bounded instance values loaded')
      await combo17('instance values')
      await waitFor(win,`document.querySelectorAll('[role="option"]').length===200`,'CAP17 200 bounded options')
      await type('[aria-label="Search instance values"]','instance-199')
      await waitFor(win,`document.querySelectorAll('[role="option"]').length===1 && document.querySelector('[role="option"]').textContent.includes('instance-199')`,'CAP17 high cardinality search')
      await option17('instance-199')
      await waitFor(win,`document.querySelector('[role="option"]').getAttribute('aria-selected')==='true'`,'CAP17 selected searched option')
      await observe('cap17-search-desktop.png','[role="listbox"]','CAP-17 search over 200 bounded instance values; exact selected option')
      await key('Escape')
      await exact17('sum(rate(audit_requests_total{instance="instance-199"}[10m]))')
      await combo17('Filter by');await clickText('Clear all','[role="listbox"]');await key('Escape')
      await exact17('sum(rate(audit_requests_total[10m]))')
      const cleared17=await state17()
      if(cleared17.filterBy.length||cleared17.groupBy.length||Object.keys(cleared17.labelValues).length)throw Error('CAP17 clear dimensions retained values')
      if(queryCalls!==before17||await evaluate(`window.__datakoalaStore.getState().tabs[0].sql`)!=='sum(up)')throw Error('CAP17 controls ran query or changed raw draft')
      cap10Ipc.active=true;cap10Ipc.calls=[]
      // Existing fixed UTC custom range, then explicit resolution and Run.
      await choose17('Resolution','1m')
      if(queryCalls!==before17)throw Error('CAP17 Resolution unexpectedly fetched')
      await clickText('Run','[data-query-toolbar]')
      await waitFor(win,`!window.__datakoalaStore.getState().tabs[0].running && window.__datakoalaStore.getState().tabs[0].lastSuccessfulResultRevision>0`,'CAP17 fixed UTC request')
      if(cap10Ipc.calls.length!==1||JSON.stringify(cap10Ipc.calls[0].request)!==JSON.stringify({start:'2026-08-19T16:00:00.000Z',end:'2026-08-19T17:00:00.000Z',step:'1m'}))throw Error('CAP17 fixed range/step payload '+JSON.stringify(cap10Ipc.calls))
      const afterRun17=queryCalls
      await click('[data-time-range-field] button');await clickText('Clear','[role="dialog"]')
      await waitFor(win,`[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent==='Confirm')?.disabled && document.querySelector('[role="dialog"] [role="alert"]')`,'CAP17 invalid range disabled Confirm')
      await observe('cap17-range-invalid-desktop.png','[role="dialog"]','CAP-17 incomplete range visibly guarded before confirmation')
      await clickText('Cancel','[role="dialog"]')
      if(JSON.stringify(await evaluate(`window.__datakoalaStore.getState().tabs[0].prometheusTimeRange`))!==JSON.stringify(auditRange))throw Error('CAP17 Cancel changed committed range')
      await click('[data-time-range-field] button');await clickText('Last 30 days','[role="dialog"]');await clickText('Confirm','[role="dialog"]')
      await choose17('Resolution','15s')
      if(queryCalls!==afterRun17)throw Error('CAP17 range/step changes implicitly fetched')
      await clickText('Run','[data-query-toolbar]')
      await waitFor(win,`window.__datakoalaStore.getState().tabs[0].queryError?.includes('Too many data points for this Resolution') && !window.__datakoalaStore.getState().tabs[0].running`,'CAP17 unsafe request blocked before IPC')
      if(cap10Ipc.calls.length!==1)throw Error('CAP17 unsafe resolution reached provider')
      await observe('cap17-resolution-guard-desktop.png','.main','CAP-17 30-day/15s resolution blocked locally; no provider fetch')
      await choose17('Resolution','Auto (1h)')
      await clickText('Run','[data-query-toolbar]')
      await waitFor(win,`!window.__datakoalaStore.getState().tabs[0].running && !window.__datakoalaStore.getState().tabs[0].queryError && window.__datakoalaStore.getState().tabs[0].result`,'CAP17 Auto recovery')
      const requests17=cap10Ipc.calls
      if(requests17.length!==2||requests17[1].request.step!=='1h'||Date.parse(requests17[1].request.end)-Date.parse(requests17[1].request.start)!==30*86400000||requests17.some(r=>r.sql!=='sum(rate(audit_requests_total[10m]))'))throw Error('CAP17 Auto range/request mismatch '+JSON.stringify(requests17))
      observations.push({family:'cap17',viewport,scenario:'labels-range-resolution',independentQuery:independent17,selected:selected17,sharedLabelRetainedOnSingleDimensionRemoval:true,removedLabelPruned:true,unknownSearchCannotCommit:true,boundedOptions:200,searchedSelected:'instance-199',cleared:cleared17,controlChangesQueryDelta:0,rawDraftPreserved:true,invalidRangeConfirmDisabled:true,cancelRestoresRange:true,unsafeManualRequestDelta:0,explicitRunAttempts:3,queryDelta:queryCalls-before17,requests:requests17,metadataCalls:capPromIpc.calls,provider:'synthetic metadata/query IPC; no live Prometheus; local result view is not query evidence'})
      if(queryCalls-before17!==2)throw Error('CAP17 exact query count mismatch')
      cap10Ipc.active=false;capPromIpc.active=false
    }
    if (viewport === 'desktop') {
      // CAP-08 A21: use the real renderer controls inside the Electron audit's
      // in-memory session. Never connect a provider or persist a user's presets.
      console.log('CAP08 step: seed PostgreSQL Builder session')
      await seed('postgres','builder','default','list',false)
      console.log('CAP08 step: prepare populated preset session')
      const pgBefore=await evaluate(`(() => {
        const state=window.__datakoalaStore.getState(),tab=state.tabs[0]
        tab.builder={...tab.builder,table:{schema:'example',name:'events'},timeColumn:'event_time'}
        tab.builderVisualization={...tab.builderVisualization,xColumn:'category',valueColumn:'value',aggregation:'sum'}
        window.__datakoalaStore.setState({tabs:[tab],activeTabId:tab.id})
        return JSON.stringify({tab:state.tabs[0],activeTabId:state.activeTabId})
      })()`)
      const beforePresetCalls=queryCalls
      await click('[aria-label="Manage saved presets"]')
      await waitFor(win, `document.querySelector('[role="dialog"] h2')?.textContent==='Presets' && document.body.innerText.includes('No saved presets for this connection yet.')`, 'CAP-08 isolated empty preset list')
      await typeLabel('Preset name','  CAP08 PG first  ')
      await clickText('Save','[role="dialog"]')
      await waitFor(win, `document.body.innerText.includes('Saved preset “CAP08 PG first”.') && document.body.innerText.includes('CAP08 PG first')`, 'CAP-08 trimmed first save')
      await delay(25)
      await typeLabel('Preset name','CAP08 PG second')
      await clickText('Save','[role="dialog"]')
      await waitFor(win, `document.querySelectorAll('[role="dialog"] li').length===2`, 'CAP-08 scoped preset list')
      await evaluate(`(() => {
        const names=[...document.querySelectorAll('[role="dialog"] li > span')].map(node=>node.textContent.trim())
        if(names[0]!=='CAP08 PG second'||names[1]!=='CAP08 PG first')throw Error('CAP-08 presets are not newest-first for the active profile: '+JSON.stringify(names))
        window.__cap08PresetOrder=names
      })()`)
      await click('[aria-label="Rename preset CAP08 PG second"]')
      await typeLabel('Rename CAP08 PG second','CAP08 PG renamed')
      await key('Enter')
      await waitFor(win, `document.body.innerText.includes('Renamed preset to “CAP08 PG renamed”.') && document.querySelector('[aria-label="Load preset CAP08 PG renamed"]')`, 'CAP-08 rename via Enter')
      await observe('cap08-preset-list-desktop.png','[role="dialog"]','active-profile presets after save and rename; both targeted delete choices visible','dialogs')
      await evaluate(`(() => {
        window.__cap08Confirms=[]
        window.confirm=message=>{window.__cap08Confirms.push(message);return false}
      })()`)
      await click('[aria-label="Delete preset CAP08 PG first"]')
      await waitFor(win, `window.__cap08Confirms.length===1 && document.body.innerText.includes('CAP08 PG first')`, 'CAP-08 native confirm cancellation keeps target')
      const afterCancelledDelete=await evaluate('JSON.stringify({tab:window.__datakoalaStore.getState().tabs[0],activeTabId:window.__datakoalaStore.getState().activeTabId})')
      if(afterCancelledDelete!==pgBefore)throw Error('CAP-08 canceled delete changed exploration state: before='+pgBefore+' after='+afterCancelledDelete)
      await evaluate('(() => { window.confirm=message=>{window.__cap08Confirms.push(message);return true} })()')
      await click('[aria-label="Delete preset CAP08 PG first"]')
      await waitFor(win, `document.querySelectorAll('[role="dialog"] li').length===1 && !document.body.innerText.includes('CAP08 PG first') && document.body.innerText.includes('CAP08 PG renamed')`, 'CAP-08 targeted delete confirmation')
      if(await evaluate(`window.__cap08Confirms.join('|')`)!=='Delete preset “CAP08 PG first”?|Delete preset “CAP08 PG first”?')throw Error('CAP-08 delete confirmation did not target the selected preset')
      const callsBeforeLoad=queryCalls
      await click('[aria-label="Load preset CAP08 PG renamed"]')
      await waitFor(win, `!document.querySelector('[role="dialog"]') && document.body.innerText.includes('Loaded preset “CAP08 PG renamed”.')`, 'CAP-08 compatible preset load')
      const loaded=await evaluate(`(() => {const s=window.__datakoalaStore.getState(),t=s.tabs.find(x=>x.id===s.activeTabId);return {tabId:t.id,title:t.title,profileId:t.connectionProfileId,queryMode:t.queryMode,sql:t.sql,table:t.builder.table,x:t.builderVisualization.xColumn,y:t.builderVisualization.valueColumn}})()`)
      if(loaded.profileId!=='audit-postgres'||loaded.queryMode!=='builder'||loaded.table?.name!=='events'||loaded.x!=='category'||loaded.y!=='value')throw Error('CAP-08 Load did not restore compatible Builder exploration into the selected tab: '+JSON.stringify(loaded))
      if(queryCalls!==callsBeforeLoad||queryCalls!==beforePresetCalls)throw Error('CAP-08 preset CRUD or Load unexpectedly executed a query')
      observations.push({family:'cap08',viewport,scenario:'pg-preset-crud',profile:'audit-postgres',ordered:await evaluate('window.__cap08PresetOrder'),renamed:'CAP08 PG renamed',cancelledDeleteKeptTarget:true,confirmedDeleteRemovedOnlyTarget:true,loadedSelectedTab:loaded.tabId,noQueryExecution:true,storage:'isolated Electron audit profile'})

      // Repeat save/load in a representative observability source. Query state is
      // synthetic and session-scoped; only the actual menu transitions are driven.
      await seed('loki','builder')
      const beforeLokiCalls=queryCalls
      await click('[aria-label="Manage saved presets"]')
      await waitFor(win, `document.querySelector('[role="dialog"] h2')?.textContent==='Presets' && document.body.innerText.includes('No saved presets for this connection yet.')`, 'CAP-08 isolated Loki preset list')
      await typeLabel('Preset name','CAP08 Loki labels')
      await clickText('Save','[role="dialog"]')
      await waitFor(win, `document.querySelector('[aria-label="Load preset CAP08 Loki labels"]')`, 'CAP-08 Loki preset saved')
      await click('[aria-label="Load preset CAP08 Loki labels"]')
      await waitFor(win, `!document.querySelector('[role="dialog"]') && document.body.innerText.includes('Loaded preset “CAP08 Loki labels”.')`, 'CAP-08 Loki preset loaded')
      const lokiLoaded=await evaluate(`(() => {const s=window.__datakoalaStore.getState(),t=s.tabs.find(x=>x.id===s.activeTabId);return {profileId:t.connectionProfileId,queryMode:t.queryMode,filterCount:t.lokiBuilder.labelMatchers.length}})()`)
      if(lokiLoaded.profileId!=='audit-loki'||lokiLoaded.queryMode!=='builder'||lokiLoaded.filterCount!==1)throw Error('CAP-08 Loki preset failed to restore selected source state: '+JSON.stringify(lokiLoaded))
      if(queryCalls!==beforeLokiCalls)throw Error('CAP-08 Loki preset unexpectedly executed a query')
      observations.push({family:'cap08',viewport,scenario:'loki-preset-save-load',profile:'audit-loki',loaded:lokiLoaded,noQueryExecution:true,storage:'isolated Electron audit profile'})

      // A23: actual Reset confirmation, Cancel/Escape preservation, tab ownership,
      // and Reset behavior with no implicit Run on both SQL and Loki sessions.
      await seed('postgres','builder','fresh','list',false)
      cap08Stage='PG Reset fixture setup'
      await evaluate(`(() => {
        const state=window.__datakoalaStore.getState(),active=state.tabs[0]
        active.sql=${rendererValue("select category, value from example.events where category = 'error'")}
        active.builder={...active.builder,table:{schema:'example',name:'events'},timeColumn:'event_time',timeRange:${rendererValue(auditRange)}}
        active.builderVisualization={...active.builderVisualization,xColumn:'category',valueColumn:'value',aggregation:'sum'}
        active.result=null;active.pendingResult=null
        active.builderResultFilters=[{column:'category',operator:'contains',value:'error',execution:'presentation'}]
        const other=JSON.parse(JSON.stringify(active));other.id='audit-cap08-other-tab';other.title='Unaffected tab';other.sql='select 99';other.result=${rendererValue(auditSqlResult)}
        window.__datakoalaStore.setState({tabs:[active,other],activeTabId:active.id})
        window.__cap08OtherBefore=JSON.stringify(other)
      })()`)
      await clickText('Run','[data-query-toolbar]')
      await waitFor(win, `!window.__datakoalaStore.getState().tabs.find(t=>t.id==='audit-tab-postgres')?.running && window.__datakoalaStore.getState().tabs.find(t=>t.id==='audit-tab-postgres')?.result?.rows?.length===3`, 'CAP-08 explicit synthetic setup query with visible result')
      await settle()
      await delay(100)
      const resetCalls=queryCalls
      console.log(`CAP08 PG Reset baseline query count: ${resetCalls}`)
      cap08Stage='PG Reset open/cancel/Escape'
      const beforeCancel=await evaluate(`JSON.stringify(window.__datakoalaStore.getState().tabs)`)
      await click('[aria-label="Reset query"]')
      await waitFor(win, `document.querySelector('[role="dialog"] h2')?.textContent==='Reset exploration?' && document.body.innerText.includes('current results')`, 'CAP-08 populated Reset confirmation')
      await observe('cap08-reset-confirm-desktop.png','[role="dialog"]','non-empty PostgreSQL Builder and retained result; query, Builder, and result reset confirmation','dialogs')
      await clickText('Cancel','[role="dialog"]')
      if(await evaluate('JSON.stringify(window.__datakoalaStore.getState().tabs)')!==beforeCancel)throw Error('CAP-08 Reset Cancel changed either tab')
      await click('[aria-label="Reset query"]')
      await key('Escape')
      if(await evaluate('JSON.stringify(window.__datakoalaStore.getState().tabs)')!==beforeCancel)throw Error('CAP-08 Reset Escape changed either tab')
      cap08Stage='PG Reset confirm'
      await click('[aria-label="Reset query"]')
      await clickText('Reset exploration','[role="dialog"]')
      await waitFor(win, `window.__datakoalaStore.getState().tabs.find(t=>t.id==='audit-tab-postgres')?.sql==='' && !document.querySelector('[role="dialog"]')`, 'CAP-08 confirmed PG reset')
      const pgAfter=await evaluate(`(() => {const s=window.__datakoalaStore.getState(),t=s.tabs.find(x=>x.id===s.activeTabId);return {id:t.id,title:t.title,profileId:t.connectionProfileId,mode:t.queryMode,sql:t.sql,table:t.builder.table,result:t.result,pendingResult:t.pendingResult,filters:t.builderResultFilters,range:t.builder.timeRange,other:JSON.stringify(s.tabs.find(x=>x.id==='audit-cap08-other-tab'))}})()`)
      if(pgAfter.id!=='audit-tab-postgres'||pgAfter.title!=='Visual audit'||pgAfter.profileId!=='audit-postgres'||pgAfter.mode!=='builder'||pgAfter.sql!==''||pgAfter.table!==null||pgAfter.result!==null||pgAfter.pendingResult!==null||pgAfter.filters.length!==0||JSON.stringify(pgAfter.range)!==JSON.stringify(auditRange)||pgAfter.other!==await evaluate('window.__cap08OtherBefore'))throw Error('CAP-08 Reset did not clear only active query state while preserving owned context: '+JSON.stringify(pgAfter))
      if(queryCalls!==resetCalls)throw Error(`CAP-08 confirmed Reset unexpectedly executed a query: ${resetCalls} -> ${queryCalls}`)
      cap08Stage=null
      await observe('cap08-reset-cleared-desktop.png','.main','confirmed Reset cleared only active PG query, Builder, and results; connection/time range retained')
      observations.push({family:'cap08',viewport,scenario:'pg-reset',cancelUnchanged:true,escapeUnchanged:true,confirmed:pgAfter,noQueryExecution:true})

      await seed('loki','builder')
      await evaluate(`(() => {const s=window.__datakoalaStore.getState(),t=s.tabs[0];t.sql='{service_name="example-service"}';t.lokiBuilder={...t.lokiBuilder,labelMatchers:[{label:'service_name',operator:'=',value:'example-service'}],lineFilters:[{operator:'|=',value:'timeout'}]};t.result=${rendererValue(auditLogResult)};window.__datakoalaStore.setState({tabs:[t],activeTabId:t.id})})()`)
      await click('[aria-label="Reset query"]')
      await clickText('Reset exploration','[role="dialog"]')
      await waitFor(win, `window.__datakoalaStore.getState().tabs[0].sql==='' && !document.querySelector('[role="dialog"]')`, 'CAP-08 confirmed Loki reset')
      const lokiAfter=await evaluate(`(() => {const s=window.__datakoalaStore.getState(),t=s.tabs[0];return {profileId:t.connectionProfileId,mode:t.queryMode,sql:t.sql,result:t.result,matchers:t.lokiBuilder.labelMatchers,lineFilters:t.lokiBuilder.lineFilters,timeRange:t.lokiTimeRange}})()`)
      if(lokiAfter.profileId!=='audit-loki'||lokiAfter.mode!=='builder'||lokiAfter.sql!==''||lokiAfter.result!==null||lokiAfter.matchers.length||lokiAfter.lineFilters.length||JSON.stringify(lokiAfter.timeRange)!==JSON.stringify(auditRange))throw Error('CAP-08 Loki reset failed to clear its active source query and results while retaining its time range: '+JSON.stringify(lokiAfter))
      observations.push({family:'cap08',viewport,scenario:'loki-reset',confirmed:lokiAfter,noQueryExecution:queryCalls===resetCalls})
      if(queryCalls!==resetCalls)throw Error('CAP-08 Loki Reset unexpectedly executed a query')
    }
  }
  const htmlEscape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')
  for(const [group,items] of Object.entries(contacts)) {
    const html=`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fff;color:#111;font:14px system-ui}figure{margin:0 12px 12px}figcaption{height:24px}img{display:block;max-width:none}</style><h2>${group} — actual pixels at scale 1; cropped, never resized</h2>${items.map(item=>`<figure><figcaption>${htmlEscape(item.filename)} (${item.width} × ${item.height} crop)</figcaption><img src="${item.data}" width="${item.width}" height="${item.height}"></figure>`).join('')}`
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html))
    win.setContentSize(1440,Math.min(1800,70+items.reduce((sum,item)=>sum+item.height+36,0)))
    await settle();const image=await win.webContents.capturePage();await writeFile(resolve(outputDir,`compare-${group}.png`),image.toPNG())
  }
  const report={ schemaVersion:1,sourceHead:process.env.DATAKOALA_AUDIT_HEAD??'local-working-tree',timezone:await evaluate('Intl.DateTimeFormat().resolvedOptions().timeZone'),viewports:auditViewports,captions:auditCaptions,observations }
  await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify(report,null,2)+'\n')
  // Self-contained review index: crops and full screenshots stay private to the PR artifact.
  const sections=[]
  for(const name of [...auditComparisonFiles,...auditScreenshots]) {
    const png=await readFile(resolve(outputDir,name))
    sections.push(`<details ${name.startsWith('compare')?'open':''}><summary>${htmlEscape(auditCaptions[name])}</summary><img alt="${htmlEscape(auditCaptions[name])}" src="data:image/png;base64,${png.toString('base64')}"></details>`)
  }
  await writeFile(resolve(outputDir,'review.html'),`<!doctype html><meta charset="utf-8"><title>DataKoala visual convergence audit</title><style>body{font:14px system-ui}img{max-width:100%;height:auto}details{margin:16px 0}</style><h1>Current-renderer audit</h1><p>Source ${htmlEscape(report.sourceHead)}. Images generated, review status must be recorded separately. Measurements in measurements.json.</p>${sections.join('')}`)
  const actual=(await readdir(outputDir)).filter(name=>name.endsWith('.png')).sort()
  const expected=[...auditScreenshots,...auditComparisonFiles].sort()
  if(JSON.stringify(actual)!==JSON.stringify(expected)) throw Error('Audit screenshot manifest mismatch')
  console.log(`CAP09_MEASUREMENTS ${JSON.stringify(observations.filter(o=>o.family==='notification-feedback'||o.family==='workspace-splitter'))}`)
  console.log(`AUDIT_OK ${actual.length} images; ${observations.length} measured states/interactions`)
}
