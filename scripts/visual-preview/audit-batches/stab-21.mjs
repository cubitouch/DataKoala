/** P2-21: actual narrow-pane bounds, complete sample label and unchanged request. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBase } from '../audit.mjs'
import { auditProfiles, auditRange, auditTraceResult, auditSpanResult } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'
export const screenshots=['stab21-tempo-toolbar.png','stab21-tempo-detail-narrow.png']
const requests=[]
export function installAuditIpc(ipc) {
 installBase(ipc);requests.length=0
 ipc.removeHandler('query:run')
 ipc.handle('query:run',(_event,id,query,parameters,request)=>{requests.push({id,query,request});return {ok:true,result:/^[a-f0-9]{32}$/.test(query.trim())?auditSpanResult:auditTraceResult}})
}
export async function runVisualAudit({win,outputDir,waitFor,capture}) {
 const js=code=>win.webContents.executeJavaScript(code)
 const settle=()=>js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
 const button=async label=>{await js(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${data(label)});if(!b)throw Error('Missing '+${data(label)});b.focus();b.click()})()`);await settle()}
 const p=auditProfiles.tempo
 await js(`(()=>{const s=window.__datakoalaStore,t=structuredClone(s.getState().tabs[0]),p=${data(p)};Object.assign(t,{id:'stab21',connectionProfileId:p.id,queryMode:'sql',sql:'{ span:duration > 300ms }',result:null,queryError:null,running:false,tempoResultView:'list',tempoSampleSize:'100',tempoTimeRange:${data(auditRange)}});s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:'connected',generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:'loaded',error:null,isStale:false,revision:1}}})})()`)
 const observations=[]
 // Keep the full 1440x900 capture while resizing the actual query/detail pane to 652px.
 await js("document.querySelector('.main').style.width='652px'");await settle()
 const sample=await js(`(()=>{const e=document.querySelector('[role=combobox][aria-label^="Sample size:"]'),label=e.querySelector('[class*=triggerLabel]');return {text:label.textContent,width:label.clientWidth,scroll:label.scrollWidth,box:e.getBoundingClientRect().toJSON(),pane:document.querySelector('.main').getBoundingClientRect().toJSON()}})()`)
 console.log('STAB21_SAMPLE',JSON.stringify(sample));assert.equal(sample.text,'100 traces');assert.ok(sample.width>=sample.scroll,'sample label must not truncate');assert.ok(sample.box.right<=sample.pane.right+1)
 observations.push({filename:screenshots[0],width:1440,height:900,dpr:1,zoom:1,target:sample.box,sample});await capture(win,screenshots[0])
 await button('Run');await waitFor(win,'document.querySelector("button[class*=traceResult]")','Tempo results')
 assert.equal(requests[0].request.sampleSize,100,'submitted sample quantity unchanged')
 await js('document.querySelector("button[class*=traceResult]").click()');await waitFor(win,'[...document.querySelectorAll("button")].some(e=>e.textContent.includes("wall-clock"))','trace detail')
 const bounds=await js(`(()=>{const pane=document.querySelector('.main').getBoundingClientRect(),toolbar=document.querySelector('[class*=filterToolbar]');return {pane:pane.toJSON(),target:toolbar.getBoundingClientRect().toJSON(),buttons:[...toolbar.querySelectorAll('button')].map(e=>({text:e.textContent,box:e.getBoundingClientRect().toJSON()}))}})()`)
 console.log('STAB21_DETAIL',JSON.stringify(bounds));assert.ok(Math.abs(bounds.pane.width-652)<1)
 for(const b of bounds.buttons) {assert.ok(b.box.x>=bounds.pane.x && b.box.right<=bounds.pane.right+1,b.text+' contained')}
 await button('Use wall-clock scale');await button('Compress idle gaps')
 observations.push({filename:screenshots[1],width:1440,height:900,dpr:1,zoom:1,...bounds});await capture(win,screenshots[1])
 await button('← Search results');assert.equal(await js('window.__datakoalaStore.getState().tabs[0].tempoSampleSize'),'100')
 await js("document.querySelector('.main').style.width=''");await settle()
 await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({sourceHead:process.env.DATAKOALA_AUDIT_HEAD,observations,requests},null,2))
}
