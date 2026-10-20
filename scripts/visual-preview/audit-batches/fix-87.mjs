/** #487: shared copy alerts, recoverable CSV export, desktop/narrow containment. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'
export const screenshots = ['fix87-copy-error.png','fix87-copy-error-narrow.png']
let mode='failed'
const saves=[]
export function installAuditIpc(ipc) {
  installBaseIpc(ipc)
  ipc.removeHandler('export:save-text')
  ipc.handle('export:save-text',(_event,input)=>{
    saves.push(input)
    if(mode==='failed')throw Error('Synthetic Save permission denied')
    return mode==='cancelled'?null:'/synthetic/results.csv'
  })
}
export async function runVisualAudit({win,outputDir,waitFor,capture}) {
  const js=code=>win.webContents.executeJavaScript(code)
  const settle=()=>js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
  const observations=[]
  win.show();win.setContentSize(1440,900);win.webContents.setZoomFactor(1)
  const result={columns:[{name:'value',dataTypeID:23,dataTypeName:'int4'}],rows:[{value:42}],rowCount:1,durationMs:1}
  await js(`(()=>{const s=window.__datakoalaStore,t=structuredClone(s.getState().tabs[0]),p=${data(auditProfiles.postgres)};Object.assign(t,{id:'fix87',connectionProfileId:p.id,queryMode:'sql',sql:'select 42',result:${data(result)},resultRevision:1,sqlVisualization:{...t.sqlVisualization,view:'table'},queryError:null,running:false});s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:'connected',generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:'loaded',error:null,isStale:false}}});window.__fix87notices=[];window.__fix87copied=[];window.__fix87deny=true;window.addEventListener('datakoala:notification',e=>window.__fix87notices.push(e.detail));Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(window.__fix87deny)throw Error('Error invoking remote method \\'clipboard:write\\': Error: Clipboard permission denied');window.__fix87copied.push(text)}}})})()`)
  await waitFor(win,'document.querySelector("[aria-label=\"Copy CSV\"]")','CSV actions')
  for(const [index,width] of [1440,900].entries()) {
    win.setContentSize(width,900);await settle()
    await js('document.querySelector("[aria-label=\"Copy CSV\"]").click()')
    await waitFor(win,'[...document.querySelectorAll("[role=alert]")].some(e=>e.textContent.includes("Could not copy to clipboard"))','copy failure')
    const target=await js(`(()=>{const e=[...document.querySelectorAll('[role=alert]')].find(e=>e.textContent.includes('Could not copy to clipboard'));return e.getBoundingClientRect().toJSON()})()`)
    assert.ok(target.x>=0&&target.right<=width,'toast contained in viewport')
    assert.equal(await js('document.querySelectorAll("[role=alert]").length'),1)
    const detail=await js('window.__fix87notices.at(-1)')
    assert.equal(detail.details,'Clipboard permission denied')
    assert.ok(!detail.message.includes('remote method'))
    observations.push({filename:screenshots[index],width,height:900,dpr:1,zoom:1,target})
    await capture(win,screenshots[index])
  }
  assert.equal(await js('window.__fix87notices.length'),2)
  await js('window.__fix87deny=false;document.querySelector("[aria-label=\"Copy CSV\"]").click()')
  await waitFor(win,'window.__fix87copied.length===1','safe clipboard retry')
  assert.equal(await js('window.__fix87copied[0]'),'value\n42')
  const exportButton='[...document.querySelectorAll("button")].find(e=>e.textContent.trim()==="Export CSV")'
  await js(exportButton+'.click()')
  await waitFor(win,'window.__fix87notices.at(-1)?.message.includes("Could not export CSV")','export failure')
  mode='saved';await js(exportButton+'.click()')
  await waitFor(win,'window.__fix87notices.at(-1)?.message==="Table exported as CSV"','export retry')
  assert.equal(saves.length,2);assert.deepEqual(saves[0],saves[1])
  await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({sourceHead:process.env.DATAKOALA_AUDIT_HEAD,observations,nativeClipboard:'Pending OS test; synthetic denial',manualAcceptance:'Pending'},null,2))
}
