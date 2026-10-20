/** #490: actual PNG capture with controlled clipboard/Save IPC outcomes. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'
export const screenshots = ['fix90-export-success.png', 'fix90-export-error.png']
let mode = 'saved'
const saves = []
export function installAuditIpc(ipc) {
  installBaseIpc(ipc)
  ipc.removeHandler('export:save-binary')
  ipc.handle('export:save-binary', (_event, input) => {
    saves.push({ mode, bytes: input.base64.length })
    assert.ok(input.base64.length > 100)
    if (mode === 'failed') throw Error('Synthetic Save denied')
    return mode === 'cancelled' ? null : '/synthetic/chart.png'
  })
}
export async function runVisualAudit({ win, outputDir, waitFor, capture }) {
  const js = code => win.webContents.executeJavaScript(code)
  const observations = []
  win.show(); win.setContentSize(1440,900); win.webContents.setZoomFactor(1)
  const fixture = { columns: [{ name:'name',dataTypeID:25,dataTypeName:'text' },{ name:'value',dataTypeID:23,dataTypeName:'int4' }], rows:[{ name:'A',value:42 },{ name:'B',value:24 }],rowCount:2,durationMs:1 }
  await js(`(() => {const s=window.__datakoalaStore,t=structuredClone(s.getState().tabs[0]),p=${data(auditProfiles.postgres)};Object.assign(t,{id:'fix90',connectionProfileId:p.id,queryMode:'sql',result:${data(fixture)},resultRevision:1,sqlVisualization:{...t.sqlVisualization,view:'bar',xColumn:'name',valueColumn:'value'},queryError:null,running:false});s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:'connected',generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:'loaded',error:null,isStale:false}}});window.__fix90notices=[];window.addEventListener('datakoala:notification',e=>window.__fix90notices.push(e.detail))})()`)
  const run = async () => {
    await waitFor(win, '[...document.querySelectorAll("button")].some(e=>e.textContent.trim()==="Export PNG"&&!e.disabled)', 'ready PNG export')
    await js('[...document.querySelectorAll("button")].find(e=>e.textContent.trim()==="Export PNG").click()')
    await waitFor(win, '[...document.querySelectorAll("button")].some(e=>e.textContent.trim()==="Export PNG"&&!e.disabled)', 'finished PNG export')
  }
  for (const [index, outcome] of ['saved','failed'].entries()) {
    mode = outcome; await run()
    const role = outcome === 'saved' ? 'status' : 'alert'
    await waitFor(win, `document.querySelector('[role=${role}]')?.textContent.includes(${data(outcome === 'saved' ? 'Chart exported' : 'Could not export chart')})`, 'export feedback')
    const target = await js(`document.querySelector('[role=${role}]').getBoundingClientRect().toJSON()`)
    assert.equal(await js(`document.querySelectorAll('[role=${role}]').length`),1)
    observations.push({filename:screenshots[index],width:1440,height:900,dpr:1,zoom:1,target})
    await capture(win,screenshots[index])
  }
  mode='cancelled';await run()
  assert.equal(await js('window.__fix90notices.length'),2,'Cancel emits no notice')
  mode='saved';await run()
  assert.equal(await js('window.__fix90notices.length'),3,'retry emits one success')
  assert.equal(saves.length,4)
  await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({sourceHead:process.env.DATAKOALA_AUDIT_HEAD,observations,saves,nativeSaveDialog:'Pending; controlled IPC',clipboard:'Pending packaged acceptance'},null,2))
}
