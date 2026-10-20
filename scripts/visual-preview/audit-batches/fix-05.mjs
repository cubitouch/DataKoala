/** #405: same renderer, viewport and zoom for all three real row consumers. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles,auditRange,auditLogs,auditLogResult,auditTraceResult,auditSpanResult } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'
export const screenshots=['fix05-logs.png','fix05-patterns.png','fix05-traces.png','fix05-long-narrow.png','fix05-large-list.png']
let openings
export function installAuditIpc(ipc){installBaseIpc(ipc);openings=[];ipc.removeHandler('query:run');ipc.handle('query:run',(_event,id,sql)=>{openings.push({id,sql});return {ok:true,result:auditSpanResult}})}
export async function runVisualAudit({win,outputDir,waitFor,capture}){
  const baseline=process.env.DATAKOALA_BATCH4_BASELINE==='1'
  const js=code=>win.webContents.executeJavaScript(code)
  const settle=()=>js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
  const observations=[],measurements=[]
  const key=async keyCode=>{win.webContents.sendInputEvent({type:'keyDown',keyCode});if(keyCode==='Enter')win.webContents.sendInputEvent({type:'char',keyCode:'\r'});if(keyCode==='Space')win.webContents.sendInputEvent({type:'char',keyCode:' '});win.webContents.sendInputEvent({type:'keyUp',keyCode});await settle()}
  const selectors={logs:'[aria-label="Log results"] article button',patterns:'[data-pattern-row] button',traces:'[class*="traceList"] button'}
  const seed=async(view,long=false,large=false)=>{
    const kind=view==='traces'?'tempo':'loki',p=auditProfiles[kind]
    const rows=Array.from({length:large?5000:1},(_,i)=>({...auditLogs[0],id:'row-'+i,line:long?'Long message\n'+('Readable message with context '.repeat(50)):'Ready',timestampMs:auditLogs[0].timestampMs-i,timestampNs:String(BigInt(auditLogs[0].timestampMs-i)*1000000n)}))
    const result=view==='traces'?{...auditTraceResult,rows:[{...auditTraceResult.rows[0],rootService:'api',rootOperation:'Ready',matchedSpans:1}],rowCount:1}:{...auditLogResult,rows,logRows:rows,rowCount:rows.length}
    await js(`(()=>{const s=window.__datakoalaStore,t=JSON.parse(JSON.stringify(s.getState().tabs[0])),p=${data(p)};t.id='rows-${view}';t.connectionProfileId=p.id;t.result=${data(result)};t.resultRevision=(t.resultRevision??0)+1;t.queryError=null;t.running=false;t.sql=${data(kind==='tempo'?'{ true }':'{service_name="example-service"}')};t.queryMode='sql';t.lokiResultView=${data(view==='patterns'?'patterns':'list')};t.lokiGroupBy=[];t.lokiTimeRange=${data(auditRange)};t.tempoTimeRange=${data(auditRange)};t.tempoResultView='list';s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:'connected',generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:'loaded',error:null,isStale:false}}})})()`)
    await waitFor(win,`document.querySelector(${data(selectors[view])})`,'actual '+view+' row');await settle()
  }
  const measure=async view=>js(`(()=>{const b=document.querySelector(${data(selectors[view])}),r=b.closest('[data-observability-row]')??b.closest('article')??b,c=b.querySelector('[data-row-chevron],[data-log-row-chevron]'),box=r.getBoundingClientRect(),chevron=c?.getBoundingClientRect();return {height:box.height,width:box.width,font:getComputedStyle(b).font,chevronRight:chevron?box.right-chevron.right:null,shared:!!r.matches('[data-observability-row]')}})()`)
  const shot=async filename=>{const target=await js(`(document.querySelector('[data-observability-row]')??document.querySelector('main')??document.body).getBoundingClientRect().toJSON()`);const [width,height]=win.getContentSize();observations.push({filename,width,height,dpr:1,zoom:1,target});await capture(win,filename)}
  win.show();win.focus();win.setContentSize(1440,900);win.webContents.setZoomFactor(1);await settle()
  for(const [index,view] of ['logs','patterns','traces'].entries()){
    await seed(view);measurements.push({view,...await measure(view)});await shot(screenshots[index])
    if(!baseline){assert.equal(measurements.at(-1).shared,true,view+' renders shared component');await js(`document.querySelector(${data(selectors[view])}).focus()`);await key(view==='patterns'?'Space':'Enter');if(view==='logs')assert.equal(await js(`!!document.querySelector('[aria-label="Selected log details"]') && document.body.innerText.includes('Ready')`),true);if(view==='patterns')assert.equal(await js(`!!document.querySelector('[aria-label="Selected pattern details"]') && document.body.innerText.includes('Ready')`),true);if(view==='traces'){await waitFor(win,`!document.querySelector(${data(selectors.traces)})`,'opened trace');assert.equal(openings.at(-1).sql,auditTraceResult.rows[0].traceId)}}
  }
  if(!baseline){assert.deepEqual(measurements.map(m=>m.height),[42,42,42],'actual single-line row height');assert.ok(measurements.every(m=>Math.abs(m.chevronRight-14)<1),'shared trailing alignment')}
  win.setContentSize(900,900);await seed('logs',true);const long=await measure('logs');if(!baseline)assert.ok(long.height>42,'long content grows');await shot(screenshots[3])
  win.setContentSize(1440,900);await seed('logs',false,true)
  await js(`document.querySelector(${data(selectors.logs)}).focus();window.__rowOrigin=document.activeElement;const e=document.querySelector('[class*="logScroller"]');e.scrollTop=e.scrollHeight;`);await settle()
  const rendered=await js(`document.querySelectorAll('[aria-label="Log results"] article').length`);assert.ok(rendered<100,'5000 rows stay virtualized')
  if(!baseline){assert.equal(await js('window.__rowOrigin.isConnected && document.activeElement===window.__rowOrigin'),true,'focused recycled identity remains mounted');await key('Enter');assert.equal(await js(`!!document.querySelector('[aria-label="Selected log details"]')`),true)}
  await shot(screenshots[4])
  await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({sourceHead:process.env.DATAKOALA_AUDIT_HEAD,baseline,observations,measurements,long,rendered,openings,providers:'synthetic; manual acceptance Pending'},null,2))
}
