/** #525: counted synthetic IPC and a real rendered Log volume returning across views/tabs. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBase } from '../audit.mjs'
import { auditProfiles, auditRange, auditLogResult } from '../audit-fixtures.mjs'
import { runLokiViewTransitionAudit, transitionScreenshots } from './manual-542.mjs'
import { rendererValue as data } from '../renderer-value.mjs'
export const screenshots = ['volume-loaded-return.png', 'volume-pending-return.png', 'volume-bar-after-patterns.png', ...transitionScreenshots]
let calls, releaseVolume, auditIpc
const metrics = {
  resultKind: 'metrics',
  columns: [{name:'timestamp',dataTypeID:0,dataTypeName:'timestamp'},{name:'value',dataTypeID:0,dataTypeName:'number'}],
  rows: Array.from({length:12},(_,i)=>({timestamp:new Date(Date.UTC(2026,7,19,16,i*5)).toISOString(),value:2+i})),
  rowCount:12,durationMs:1,execution:{provider:'loki',durationMs:1},
}
export function installAuditIpc(ipc) {
  installBase(ipc); calls=[];releaseVolume=null;auditIpc=ipc
  ipc.removeHandler('connections:loki:format-query')
  ipc.handle('connections:loki:format-query', (_event,_id,query)=>query.replace(/\s*\|=/,'\n|='))
  ipc.removeHandler('query:run-loki')
  ipc.handle('query:run-loki',(_event,id,request)=>{
    const kind=request.expression.includes('count_over_time')?'volume':request.expression.includes('count(')?'probe':'primary'
    calls.push({kind,id,request})
    if(kind==='primary')return auditLogResult
    if(kind==='probe')return {...metrics,rows:[{timestamp:metrics.rows[0].timestamp,value:1}],rowCount:1}
    if(calls.filter(c=>c.kind==='volume').length===2)return new Promise(done=>{releaseVolume=()=>done(metrics)})
    return metrics
  })
}
export async function runVisualAudit({win,outputDir,waitFor,capture}) {
  const js=code=>win.webContents.executeJavaScript(code)
  const settle=()=>js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
  const choose=async label=>{await js(`document.querySelector('[aria-label="Result view"] button[aria-label="${label}"]').click()`);await settle()}
  const counts=()=>Object.fromEntries(['primary','probe','volume'].map(kind=>[kind,calls.filter(c=>c.kind===kind).length]))
  const ready=()=>waitFor(win,'document.querySelector("[data-result-chart-canvas][data-visual-finished=true] canvas")','rendered Log volume')
  const formatted=async()=>{
    await js(`(()=>{const panel=document.querySelector('[data-generated-query-panel]'),toggle=panel?.querySelector('[aria-expanded="false"]');toggle?.click()})()`)
    await waitFor(win,`document.querySelectorAll('[data-generated-query-panel] .cm-line').length > 1`,'newline-formatted Builder query')
  }
  const run=async()=>{await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Run').click()`);await waitFor(win,'!window.__datakoalaStore.getState().tabs[0].running','primary complete')}
  win.show();win.focus();win.setContentSize(1440,900);win.webContents.setZoomFactor(1)
  await js(`(()=>{const s=window.__datakoalaStore,t=structuredClone(s.getState().tabs[0]),p=${data(auditProfiles.loki)};Object.assign(t,{id:'volume-A',connectionProfileId:p.id,queryMode:'builder',lokiBuilder:{labelMatchers:[{label:'service_name',operator:'=',value:'example-service'}],lineFilters:[{operator:'|=',value:'needle'}],parsers:[],fieldFilters:[]},result:null,queryError:null,running:false,lokiGroupBy:[],lokiTimeRange:${data(auditRange)},lokiResultView:'list'});const b={...structuredClone(t),id:'volume-B',title:'Other'};s.setState({profiles:[p],tabs:[t,b],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:'connected',generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:'loaded',error:null,isStale:false}}})})()`)
  await waitFor(win,`document.querySelector('[aria-label="Loki query results"]')`,'Loki workspace')
  await formatted();await run()
  assert.ok(calls.find(c=>c.kind==='primary').request.expression.includes('\n|='),'Run uses newline-formatted Builder query')
  const observations=[],transitions=[]
  const shot=async filename=>{const target=await js(`document.querySelector('[data-result-chart-canvas]').getBoundingClientRect().toJSON()`);observations.push({filename,width:1440,height:900,dpr:1,zoom:1,target});await capture(win,filename)}
  // #542 is verified separately: exact cold sequence, then warmed/repeated cycles.
  for(const kind of ['Bar','Line','Bar']){
    await choose('Table');await waitFor(win,`document.querySelector('[data-result-table-pane]')`,'actual Table')
    await choose('Patterns');await waitFor(win,`document.querySelector('[aria-label="Result view"] button[aria-label="Patterns"][aria-pressed="true"]')`,'Patterns selected')
    await choose(kind);await ready()
    const actual=await js(`document.querySelector('[data-result-chart-canvas]').dataset.visualType`)
    assert.equal(actual,kind.toLowerCase());assert.equal(await js(`!!document.querySelector('[data-result-table-pane]')`),false)
    assert.equal(await js(`document.querySelector('[aria-label="Result view"] button[aria-label="${kind}"]').getAttribute('aria-pressed')`),'true')
    assert.deepEqual(counts(),{primary:1,probe:0,volume:1});transitions.push({sequence:['Table','Patterns',kind],actual,counts:counts()})
  }
  await shot(screenshots[2]);await choose('Line');await ready()
  for(const view of ['List','Patterns','Table']){await choose(view);await choose('Line');await ready();assert.deepEqual(counts(),{primary:1,probe:0,volume:1});transitions.push({view,counts:counts()})}
  await js(`window.__datakoalaStore.setState({activeTabId:'volume-B'})`);await settle();await js(`window.__datakoalaStore.setState({activeTabId:'volume-A'})`);await ready();await formatted();await ready();assert.deepEqual(counts(),{primary:1,probe:0,volume:1});await shot(screenshots[0])
  await run();await waitFor(win,'document.body.innerText.includes("Loading log volume")','pending volume');assert.ok(releaseVolume)
  await choose('List');await choose('Line')
  await js(`window.__datakoalaStore.setState({activeTabId:'volume-B'})`);await settle()
  releaseVolume();await waitFor(win,'window.__datakoalaStore.getState().tabs[0].lokiVolume?.result?.resultKind === "metrics"','inactive completion')
  await js(`window.__datakoalaStore.setState({activeTabId:'volume-A'})`);await ready();await formatted();await ready();assert.deepEqual(counts(),{primary:2,probe:0,volume:2});await shot(screenshots[1])
  observations.push(...await runLokiViewTransitionAudit({ipc:auditIpc,win,outputDir,waitFor,capture}))
  await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({sourceHead:process.env.DATAKOALA_AUDIT_HEAD,observations,transitions,finalCounts:counts(),calls,transport:'synthetic Loki IPC; real Electron/ECharts',humanAcceptance:'Pending'},null,2))

}
