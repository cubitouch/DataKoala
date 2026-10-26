/** #491: adapter-generated data crosses the production preload/native IPC boundary. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'
export const screenshots=['fix91-statistics.png','fix91-narrow.png','fix91-failure.png','fix91-recovered.png']
let fixture,requests,outcome,releaseOld
export function installAuditIpc(ipc){
  installBaseIpc(ipc)
  fixture=JSON.parse(readFileSync(process.env.DATAKOALA_STATS_FIXTURE,'utf8'));requests=[];outcome='A';releaseOld=null
  ipc.removeHandler('query:run');ipc.handle('query:run',async(_event,id,sql)=>{
    const mode=outcome;requests.push({id,sql,mode})
    if(mode==='old')await new Promise(done=>{releaseOld=done})
    if(mode==='B')return {ok:false,kind:'query',message:'Synthetic statistics failure B'}
    const result=structuredClone(fixture.result)
    if(mode==='C')result.execution.bytesBilled=1234
    return {ok:true,result}
  })
}
export async function runVisualAudit({win,outputDir,waitFor,capture}){
  const baseline=process.env.DATAKOALA_BATCH4_BASELINE==='1'
  const js=code=>win.webContents.executeJavaScript(code)
  const settle=()=>js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
  const key=async(keyCode,modifiers=[])=>{win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});if(keyCode==='Enter'&&!modifiers.length)win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await settle()}
  const run=async()=>{await js(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Run');if(!b||b.disabled)throw Error('Run unavailable');b.focus()})()`);await key('Enter')}
  const observations=[]
  const shot=async filename=>{const target=await js(`(document.querySelector('[data-query-statistics]')??document.querySelector('[data-result-toolbar]')??document.querySelector('main')??document.body).getBoundingClientRect().toJSON()`);const [width,height]=win.getContentSize();observations.push({filename,width,height,dpr:1,zoom:1,target});await capture(win,filename)}
  win.show();win.focus();win.setContentSize(1440,900);win.webContents.setZoomFactor(1);await settle()
  await js(`(()=>{const s=window.__datakoalaStore,t=JSON.parse(JSON.stringify(s.getState().tabs[0])),p=${data(auditProfiles.bigquery)},other=${data(auditProfiles.postgres)};t.id='stats-A';t.title='Stats A';t.connectionProfileId=p.id;t.queryMode='sql';t.sql=${data(fixture.calls[0].query)};t.result=null;t.resultRevision=0;t.queryError=null;t.running=false;const b={...t,id:'stats-B',title:'Stats B',connectionProfileId:other.id,sql:'select 1'};s.setState({profiles:[p,other],tabs:[t,b],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:'connected',generation:1,error:null},[other.id]:{status:'connected',generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:'loaded',error:null},[other.id]:{schemas:[],status:'loaded',error:null}}})})()`);await settle();await run()
  await waitFor(win,`window.__datakoalaStore.getState().tabs[0].result?.execution?.bytesBilled===2048`,'native result A')
  if(!baseline)await js(`document.querySelector('[aria-label="Query statistics"]').click()`);
  if(!baseline)for(const text of ['Script job: 2048 B billed','Script job: 300 slot-ms','Script job: cache miss','12 total final-statement rows','Script job: 50 ms elapsed'])assert.equal(await js(`document.querySelector('[role=dialog]')?.textContent.includes(${data(text)})`),true,text)
  if(!baseline)await js(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Close').click()`);
  await shot(screenshots[0]);win.setContentSize(900,900);await settle();await shot(screenshots[1]);if(!baseline)assert.ok(observations.at(-1).target.x+observations.at(-1).target.width<=900,'narrow stats containment')
  outcome='B';await run();await waitFor(win,`window.__datakoalaStore.getState().tabs[0].queryError==='Synthetic statistics failure B'`,'failure B');assert.equal(await js(`document.querySelector('[data-query-statistics]')===null`),true,'failed query hides old statistics');await shot(screenshots[2])
  outcome='old';await run();assert.equal(typeof releaseOld,'function');outcome='C';await js(`document.querySelector('[data-query-editor] .cm-content').focus()`);await key('Enter',['control']);await waitFor(win,`window.__datakoalaStore.getState().tabs[0].result?.execution?.bytesBilled===1234`,'newer C')
  releaseOld();await settle();assert.equal(await js('window.__datakoalaStore.getState().tabs[0].result.execution.bytesBilled'),1234,'old completion cannot overwrite statistics')
  await js(`window.__datakoalaStore.setState({activeTabId:'stats-B'})`);await settle();assert.equal(await js(`document.querySelector('[data-query-statistics]')===null`),true,'other profile has no A stats')
  await js(`window.__datakoalaStore.setState({activeTabId:'stats-A'})`);await settle();if(!baseline)await js(`document.querySelector('[aria-label="Query statistics"]').click()`);if(!baseline)assert.equal(await js(`document.querySelector('[role=dialog]')?.textContent.includes('1234 B billed')`),true);await shot(screenshots[3])
  await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({sourceHead:process.env.DATAKOALA_AUDIT_HEAD,baseline,observations,requests,adapterFixtureCalls:fixture.calls,transport:'native Electron preload/IPC; generated offline by real adapter + serializer',liveBigQuery:'Pending'},null,2))
}
