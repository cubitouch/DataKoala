/** #524: native first drag, no chart picker click; synthetic source results. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'
export const screenshots=['first-drag-line.png','first-drag-return.png']
let requests
export function installAuditIpc(ipc){installBaseIpc(ipc);requests=[];ipc.removeHandler('query:run');ipc.handle('query:run',()=>{requests.push('unexpected');throw Error('Unexpected query')})}
export async function runVisualAudit({win,outputDir,waitFor,capture}){
 const js=code=>win.webContents.executeJavaScript(code)
 const settle=()=>js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
 win.show();win.focus();win.setContentSize(1440,900);win.webContents.setZoomFactor(1)
 const result={columns:[{name:'timestamp',dataTypeID:1184,dataTypeName:'timestamptz'},{name:'value',dataTypeID:23,dataTypeName:'int4'}],rows:Array.from({length:12},(_,i)=>({timestamp:new Date(Date.UTC(2026,0,1,i)).toISOString(),value:10+i})),rowCount:12,durationMs:1}
 await js(`(()=>{const s=window.__datakoalaStore,t=structuredClone(s.getState().tabs[0]),p=${data(auditProfiles.postgres)};Object.assign(t,{id:'brush-A',connectionProfileId:p.id,queryMode:'sql',result:null,resultRevision:0,sqlVisualization:{...t.sqlVisualization,view:'line',xColumn:'timestamp',valueColumn:'value'},sqlResultFilters:[],running:false,queryError:null});const b={...structuredClone(t),id:'brush-B',title:'Other'};s.setState({profiles:[p],tabs:[t,b],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:'connected',generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:'loaded',error:null}}});s.getState().startQuery(t.id);s.getState().completeQuery(${data(result)},null,t.id)})()`)
 const observations=[],matrix=[]
 const brush=async transition=>{
  await waitFor(win,'document.querySelector("[data-result-chart-canvas][data-visual-finished=true] canvas")','true chart readiness '+transition)
  const box=await js(`document.querySelector('[data-result-chart-canvas] canvas').getBoundingClientRect().toJSON()`)
  assert.ok(box.width>240&&box.height>100)
  const from={x:Math.round(box.x+box.width*.3),y:Math.round(box.y+box.height*.5)},to={x:Math.round(box.x+box.width*.7),y:from.y}
  win.webContents.sendInputEvent({type:'mouseMove',...from});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...from})
  for(const f of [.2,.4,.6,.8,1])win.webContents.sendInputEvent({type:'mouseMove',button:'left',x:Math.round(from.x+(to.x-from.x)*f),y:from.y})
  win.webContents.sendInputEvent({type:'mouseUp',button:'left',...to})
  await waitFor(win,'document.querySelector("[data-result-filter-chip]")','first native drag '+transition)
  matrix.push({transition,requests:requests.length,filter:await js('document.querySelector("[data-result-filter-chip]").textContent')})
 }
 const clear=async()=>{await js(`document.querySelector('[data-result-filter-chip] button[aria-label^="Remove"]').click()`);await settle()}
 await brush('initial-query-completion')
 const shot=async filename=>{const target=await js(`document.querySelector('[data-result-chart-canvas]').getBoundingClientRect().toJSON()`);observations.push({filename,width:1440,height:900,dpr:1,zoom:1,target});await capture(win,filename)}
 await shot(screenshots[0]);await clear();await brush('repeat-after-clear');await clear()
 await js(`window.__datakoalaStore.setState({activeTabId:'brush-B'})`);await settle();await js(`window.__datakoalaStore.setState({activeTabId:'brush-A'})`)
 await brush('tab-return');await shot(screenshots[1]);await clear()
 await js(`window.__datakoalaStore.getState().completeQuery(${data({...result,durationMs:2})},null,'brush-A')`);await brush('result-replacement');await clear()
 for(const view of ['area','bar']){await js(`(()=>{const s=window.__datakoalaStore;s.getState().setVisualization('sql',{...s.getState().tabs[0].sqlVisualization,view:${data(view)}},'brush-A')})()`);await brush('type-'+view);await clear()}
 assert.equal(requests.length,0)
 await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({sourceHead:process.env.DATAKOALA_AUDIT_HEAD,observations,matrix,providers:'synthetic SQL only; Loki/Tempo/live matrix Pending',humanAcceptance:'Pending'},null,2))
}
