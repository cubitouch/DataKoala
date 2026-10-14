/** Audit-only scenarios. The canonical capture.mjs owns Electron/window lifetime. */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assertPreviewReady } from './assertions.mjs'
import { rendererValue } from './renderer-value.mjs'
import {
  auditCaptions, auditComparisonFiles, auditKinds, auditLogResult, auditProfiles,
  auditRange, auditSchemas, auditScreenshots, auditSpanResult, auditSqlResult,
  auditTraceResult, auditViewports,
} from './audit-fixtures.mjs'

// Audit-only, sanitized observations. All CAP-02 mutations remain in the synthetic IPC boundary.
const cap02Ipc = { active: false, tests: [], saves: [], removes: [] }
const cap03Ipc = { active: false, tests: [], saves: [], chooseFiles: 0, chooseSqlite: 0 }
const cap04Ipc = { mode: '', tests: [], saves: [], discovery: [] }
const cap05Ipc = { active: false, listCalls: 0 }
let queryOutcome = 'success'
let releaseQuery = null
let queryCalls = 0
let cap08Stage = null
const cap10Ipc = { active: false, calls: [] }
const delay = (ms) => new Promise((done) => setTimeout(done, ms))

export function installAuditIpc(ipc) {
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
    if (outcome === 'error') return { ok: false, message: 'Synthetic provider unavailable. Try Run again.', kind: 'connection' }
    return { ok: true, result: String(id).includes('tempo') ? (/^[a-f0-9]{32}$/.test(String(sql).trim()) ? auditSpanResult : auditTraceResult) : auditSqlResult }
  }
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
    await writeFile(resolve(outputDir, 'measurements.json'), JSON.stringify({ observations }, null, 2))
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
