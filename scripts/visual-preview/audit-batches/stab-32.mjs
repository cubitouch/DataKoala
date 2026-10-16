/** #432 recovery UX: synthetic metadata failure, actual Electron renderer. No live gcx claim. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBase } from '../audit.mjs'
import { auditProfiles, auditRange, auditLogResult } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'
export const screenshots=['stab32-failure-desktop.png','stab32-failure-narrow.png','stab32-retrying-narrow.png','stab32-recovered-narrow.png']
const diagnostic='Config ~/.config/gcx/config.yaml changed while loading layered configuration; retry'
let labelCalls=0,queryCalls=0,releaseLabels
export function installAuditIpc(ipc) {
 installBase(ipc);labelCalls=0;queryCalls=0;releaseLabels=null
 ipc.removeHandler('connections:loki:labels');ipc.handle('connections:loki:labels',()=>{labelCalls++;if(labelCalls===1)throw Error(diagnostic);return new Promise(done=>{releaseLabels=()=>done(['app','level','service_name'])})})
 ipc.removeHandler('query:run-loki');ipc.handle('query:run-loki',()=>{queryCalls++;return auditLogResult})
}
export async function runVisualAudit({win,outputDir,waitFor,capture}) {
 const js=code=>win.webContents.executeJavaScript(code)
 const settle=()=>js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
 const click=async label=>{await js(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${data(label)});if(!b)throw Error('Missing '+${data(label)});b.click()})()`);await settle()}
 win.show();win.setContentSize(1440,900);win.webContents.setZoomFactor(1)
 const p=auditProfiles.loki
 await js(`(()=>{const s=window.__datakoalaStore,t=structuredClone(s.getState().tabs[0]),p=${data(p)};Object.assign(t,{id:'stab32',connectionProfileId:p.id,queryMode:'sql',sql:'{app="preserved"}',lokiBuilder:{labelMatchers:[{label:'app',operator:'=',value:'preserved'}],lineFilters:[],parsers:[],fieldFilters:[]},result:${data(auditLogResult)},queryError:null,running:false,lokiTimeRange:${data(auditRange)},lokiResultView:'list'});s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:'connected',generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:'loaded',error:null,isStale:false}}})})()`)
 await waitFor(win,'document.getElementById("loki-retry-labels")','label failure')
 const original=await js('(()=>{const t=window.__datakoalaStore.getState().tabs[0];return {sql:t.sql,builder:t.lokiBuilder,range:t.lokiTimeRange}})()')
 const observations=[]
 const save=async(filename)=>{await settle();const report=await js(`(()=>{const e=document.getElementById('loki-label-recovery'),r=e.getBoundingClientRect();return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,zoom:1,target:r.toJSON(),text:e.innerText,overflow:document.documentElement.scrollWidth>innerWidth,actions:[...e.querySelectorAll('button')].map(b=>({text:b.textContent,box:b.getBoundingClientRect().toJSON()}))}})()`);assert.equal(report.overflow,false);for(const b of report.actions) assert.ok(b.box.right<=report.width+1);observations.push({filename,...report,labelCalls,queryCalls});await capture(win,filename)}
 assert.equal(await js(`document.body.textContent.split(${data(diagnostic)}).length-1`),1,'diagnostic appears only in optional details')
 assert.equal(await js('document.querySelectorAll("#loki-retry-labels").length'),1)
 assert.equal(await js('document.querySelector("#loki-label-recovery details").open'),false)
 await save(screenshots[0]);win.setContentSize(900,900);await settle();await save(screenshots[1])
 // Raw execution remains available while label discovery has failed.
 await click('Run');await waitFor(win,'!window.__datakoalaStore.getState().tabs[0].running','raw query completes');assert.equal(queryCalls,1)
 await click('Retry labels');await waitFor(win,'document.getElementById("loki-retry-labels")?.disabled','retry progress');await save(screenshots[2]);assert.equal(labelCalls,2);assert.ok(releaseLabels);releaseLabels()
 await waitFor(win,'document.getElementById("loki-label-recovery")?.textContent.includes("Loki labels refreshed")','recovery success')
 const after=await js('(()=>{const t=window.__datakoalaStore.getState().tabs[0];return {sql:t.sql,builder:t.lokiBuilder,range:t.lokiTimeRange}})()');assert.deepEqual(after,original)
 assert.equal(await js('window.__datakoalaStore.getState().connectionStateByProfileId["audit-loki"].status'),'connected')
 assert.equal(await js('document.querySelectorAll("#loki-label-recovery [role=alert]").length'),0)
 await save(screenshots[3])
 await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({sourceHead:process.env.DATAKOALA_AUDIT_HEAD,observations,syntheticMetadataFailure:true,liveGcxVerified:false,labelCalls,queryCalls},null,2))
}
