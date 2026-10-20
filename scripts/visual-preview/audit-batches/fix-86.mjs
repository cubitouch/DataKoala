/** #486: current failure invalidates chart/table data and export eligibility. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'
export const screenshots = ['fix86-error-desktop.png', 'fix86-error-narrow.png']
export function installAuditIpc(ipc) { installBaseIpc(ipc) }
export async function runVisualAudit({ win, outputDir, waitFor, capture }) {
  const js = code => win.webContents.executeJavaScript(code)
  const observations = []
  win.show(); win.setContentSize(1440, 900); win.webContents.setZoomFactor(1)
  const fixture = { columns: [{ name: 'name', dataTypeID: 25, dataTypeName: 'text' }, { name: 'value', dataTypeID: 23, dataTypeName: 'int4' }], rows: [{ name: 'A', value: 42 }], rowCount: 1, durationMs: 1 }
  await js(`(() => {const s=window.__datakoalaStore,t=structuredClone(s.getState().tabs[0]),p=${data(auditProfiles.postgres)};Object.assign(t,{id:'fix86',connectionProfileId:p.id,queryMode:'sql',sql:'select missing_column',result:${data(fixture)},resultRevision:1,sqlVisualization:{...t.sqlVisualization,view:'bar',xColumn:'name',valueColumn:'value'},queryError:null,running:false});s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:'connected',generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:'loaded',error:null,isStale:false}}});window.__fix86configuration=structuredClone(t.sqlVisualization)})()`)
  await waitFor(win, 'document.querySelector("[data-result-chart]")', 'successful chart A')
  await js(`window.__datakoalaStore.getState().startQuery('fix86');window.__datakoalaStore.getState().completeQuery(null,'Column missing_column does not exist. Correct the query and run it again.','fix86')`)
  await waitFor(win, 'document.querySelector("[role=alert]")?.textContent.includes("missing_column")', 'visible failure B')
  for (const [index, width] of [1440, 900].entries()) {
    win.setContentSize(width, 900)
    await js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
    const state = await js(`(() => {const s=window.__datakoalaStore.getState(),t=s.tabs[0];return {result:t.result,configuration:t.sqlVisualization,expected:window.__fix86configuration,draft:t.sql,chart:!!document.querySelector('[data-result-chart]'),exports:[...document.querySelectorAll('button')].filter(e=>/Copy CSV|Copy chart|Export PNG|Export CSV/.test((e.getAttribute('aria-label')||'')+' '+e.textContent)).length,target:document.querySelector('[data-result-table-pane]').getBoundingClientRect().toJSON()}})()`)
    assert.equal(state.result, null); assert.equal(state.chart, false); assert.equal(state.exports, 0)
    assert.deepEqual(state.configuration, state.expected); assert.equal(state.draft, 'select missing_column')
    observations.push({filename:screenshots[index],width,height:900,dpr:1,zoom:1,target:state.target})
    await capture(win, screenshots[index])
  }
  await js(`window.__datakoalaStore.getState().completeQuery(${data(fixture)},null,'fix86')`)
  await waitFor(win, 'document.querySelector("[data-result-chart]") && !document.querySelector("[data-result-table-pane] [role=alert]")', 'successful recovery C')
  await writeFile(resolve(outputDir, 'measurements.json'), JSON.stringify({sourceHead:process.env.DATAKOALA_AUDIT_HEAD,observations,transport:'synthetic; provider/controller behavior covered separately',manualAcceptance:'Pending'},null,2))
}
