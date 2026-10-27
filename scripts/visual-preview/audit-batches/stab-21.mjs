/** P2-21: actual narrow-pane bounds, complete sample label and unchanged request. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBase } from '../audit.mjs'
import { auditProfiles, auditRange, auditTraceResult, auditSpanResult, auditSqlResult } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'
export const screenshots=['stab21-tempo-toolbar.png','stab21-tempo-detail-narrow.png',...(process.env.DATAKOALA_TEMPO_BAR_BASELINE==='1'?['tempo-before-results.png']:['desktop','narrow'].flatMap(size=>['List','Scatter','Service map'].map(view=>'tempo-view-'+size+'-'+view.toLowerCase().replace(' ','-')+'.png')))]
const requests=[]
export function installAuditIpc(ipc) {
 installBase(ipc);requests.length=0
 ipc.removeHandler('query:run')
 ipc.handle('query:run',(_event,id,query,parameters,request)=>{requests.push({id,query,request});return {ok:true,result:/^[a-f0-9]{32}$/.test(query.trim())?auditSpanResult:{...auditTraceResult,notice:'Tempo search · synthetic range · 5 returned · 1 search query'}}})
}
export async function runVisualAudit({win,outputDir,waitFor,capture}) {
 const js=code=>win.webContents.executeJavaScript(code)
 const settle=()=>js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
 const button=async label=>{await js(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${data(label)});if(!b)throw Error('Missing '+${data(label)});b.focus();b.click()})()`);await settle()}
 // Measure the real SQL chart row in this build, then compare Tempo to it.
 win.setContentSize(1440,900);win.webContents.setZoomFactor(1)
 await js(`(()=>{const s=window.__datakoalaStore,t=structuredClone(s.getState().tabs[0]),p=${data(auditProfiles.postgres)};Object.assign(t,{id:'stab21-reference',connectionProfileId:p.id,queryMode:'sql',result:${data(auditSqlResult)},queryError:null,running:false,sqlVisualization:{view:'line',xColumn:'category',valueColumn:'value',aggregation:'sum'}});s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:'connected',generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:'loaded',error:null,isStale:false,revision:1}}})})()`)
 await waitFor(win,`document.querySelector('[role=toolbar][aria-label="Result view"]')`,'SQL chart view row');await settle()
 const reference=await js(`(()=>{const bar=document.querySelector('[role=toolbar][aria-label="Result view"]'),style=getComputedStyle(bar);return{height:bar.getBoundingClientRect().height,padding:style.padding,borderBottom:style.borderBottomWidth}})()`)
 const p=auditProfiles.tempo
 await js(`(()=>{const s=window.__datakoalaStore,t=structuredClone(s.getState().tabs[0]),p=${data(p)};Object.assign(t,{id:'stab21',connectionProfileId:p.id,queryMode:'sql',sql:'{ span:duration > 300ms }',result:null,queryError:null,running:false,tempoResultView:'list',tempoSampleSize:'100',tempoTimeRange:${data(auditRange)}});s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:'connected',generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:'loaded',error:null,isStale:false,revision:1}}})})()`)
 win.show();win.focus();win.setContentSize(1440,900);win.webContents.setZoomFactor(1)
 const observations=[]
 // Keep the full 1440x900 capture while resizing the actual query/detail pane to 652px.
 await js("document.querySelector('.main').style.width='652px'");await settle()
 const sample=await js(`(()=>{const e=document.querySelector('[role=combobox][aria-label^="Sample size:"]'),label=e.querySelector('[class*=triggerLabel]');return {text:label.textContent,width:label.clientWidth,scroll:label.scrollWidth,box:e.getBoundingClientRect().toJSON(),pane:document.querySelector('.main').getBoundingClientRect().toJSON()}})()`)
 console.log('STAB21_SAMPLE',JSON.stringify(sample));assert.equal(sample.text,'100 traces');assert.ok(sample.width>=sample.scroll,'sample label must not truncate');assert.ok(sample.box.right<=sample.pane.right+1)
 observations.push({filename:screenshots[0],width:1440,height:900,dpr:1,zoom:1,target:sample.box,sample});await capture(win,screenshots[0])
 await button('Run');await waitFor(win,'document.querySelector("[class*=traceList] [data-observability-row] > button")','Tempo results')
 assert.equal(requests[0].request.sampleSize,100,'submitted sample quantity unchanged')
 const viewGeometry=[]
 if(process.env.DATAKOALA_TEMPO_BAR_BASELINE==='1'){await js("document.querySelector('.main').style.width=''");await settle();const target=await js(`document.querySelector('[data-trace-view-bar]').getBoundingClientRect().toJSON()`);observations.push({filename:'tempo-before-results.png',width:1440,height:900,dpr:1,zoom:1,target});await capture(win,'tempo-before-results.png')}
 else for(const [size,width] of [['desktop',1440],['narrow',900]]){
  await js("document.querySelector('.main').style.width=''");win.setContentSize(width,900);await settle()
  for(const label of ['List','Scatter','Service map']){
   await js(`document.querySelector('[aria-label="Result view"] button[aria-label="${label}"]').focus()`)
   win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});await settle()
   await waitFor(win,`document.querySelector('[aria-label="Result view"] button[aria-label="${label}"][aria-pressed="true"]')`,'keyboard view '+label)
   const report=await js(`(()=>{const bar=document.querySelector('[data-trace-view-bar]'),count=bar.querySelector('[data-trace-count]'),picker=bar.querySelector('[role=toolbar]');return{bar:bar.getBoundingClientRect().toJSON(),count:count.getBoundingClientRect().toJSON(),picker:picker.getBoundingClientRect().toJSON(),countInsidePicker:picker.contains(count),padding:getComputedStyle(picker).padding,text:count.textContent.trim(),buttons:[...picker.querySelectorAll('button')].map(b=>({label:b.getAttribute('aria-label'),box:b.getBoundingClientRect().toJSON()})),headings:[...bar.querySelectorAll('h2')].length}})()`)
   assert.equal(report.text,'5 sampled traces');assert.equal(report.headings,0)
   assert.ok(Math.abs(report.count.right-(report.bar.right-12))<2,'count reaches right edge')
   assert.ok(Math.abs(report.picker.x-report.bar.x)<2,'View starts at left')
   assert.ok(report.countInsidePicker,'count belongs to the shared chart row')
   assert.ok(Math.abs(report.bar.height-reference.height)<1,'Tempo row matches the actual SQL chart row height')
   assert.equal(report.padding,reference.padding,'shared chart row padding')
   for(const button of report.buttons)assert.ok(button.box.x>=report.bar.x&&button.box.right<=report.bar.right,button.label+' contained')
   assert.equal(requests.length,1,'view/keyboard changes do not search or analyze a map')
   const filename='tempo-view-'+size+'-'+label.toLowerCase().replace(' ','-')+'.png'
   observations.push({filename,width,height:900,dpr:1,zoom:1,target:report.bar});viewGeometry.push({size,label,...report});await capture(win,filename)
  }
 }
 await button('List');win.setContentSize(1440,900);await js("document.querySelector('.main').style.width='652px'");await settle()
 await js('document.querySelector("[class*=traceList] [data-observability-row] > button").click()');await waitFor(win,'[...document.querySelectorAll("button")].some(e=>e.textContent.includes("wall-clock"))','trace detail')
 const bounds=await js(`(()=>{const pane=document.querySelector('.main').getBoundingClientRect(),toolbar=document.querySelector('[class*=filterToolbar]');return {pane:pane.toJSON(),target:toolbar.getBoundingClientRect().toJSON(),buttons:[...toolbar.querySelectorAll('button')].map(e=>({text:e.textContent,box:e.getBoundingClientRect().toJSON()}))}})()`)
 console.log('STAB21_DETAIL',JSON.stringify(bounds));assert.ok(Math.abs(bounds.pane.width-652)<1)
 for(const b of bounds.buttons) {assert.ok(b.box.x>=bounds.pane.x && b.box.right<=bounds.pane.right+1,b.text+' contained')}
 win.focus();win.webContents.focus();await settle()
 await js("[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Use wall-clock scale').focus()")
 assert.equal(await js("document.activeElement.textContent.trim()"),'Use wall-clock scale')
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});await settle()
 assert.ok(await js("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Compress idle gaps')"),'native keyboard activates timing action')
 const point=await js("(()=>{const r=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Compress idle gaps').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()")
 win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});await settle()
 assert.ok(await js("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Use wall-clock scale')"),'native pointer activates timing action')
 observations.push({filename:screenshots[1],width:1440,height:900,dpr:1,zoom:1,...bounds});await capture(win,screenshots[1])
 await button('← Search results');assert.equal(await js('window.__datakoalaStore.getState().tabs[0].tempoSampleSize'),'100')
 await js("document.querySelector('.main').style.width=''");await settle()
 await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({sourceHead:process.env.DATAKOALA_AUDIT_HEAD,observations,reference,viewGeometry,requests},null,2))
}
