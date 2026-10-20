/** #494: CAP-12/13 native pointer and keyboard regressions; synthetic data/exports. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'
export const screenshots = ['fix94-resized.png', 'fix94-filter-focus.png']
let exports
export function installAuditIpc(ipc) {
  installBaseIpc(ipc)
  exports = []
  ipc.removeHandler('export:save-text')
  ipc.handle('export:save-text', (_event, input) => { exports.push(input); return null })
}
export async function runVisualAudit({ win, outputDir, waitFor, capture, dragDivider }) {
  const js = code => win.webContents.executeJavaScript(code)
  const settle = () => js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
  const key = async keyCode => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    if (keyCode === 'Enter') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode }); await settle()
  }
  win.show(); win.focus(); win.setContentSize(1440,900); win.webContents.setZoomFactor(1)
  await settle()
  const result = { columns: [{ name: 'name', dataTypeID: 25, dataTypeName: 'text' }, { name: 'value', dataTypeID: 23, dataTypeName: 'int4' }], rows: Array.from({length: 200}, (_, i) => ({ name: i === 1 ? null : 'row '+(199-i), value: i })), rowCount: 200, durationMs: 7 }
  await js(`(() => {const s=window.__datakoalaStore,t=structuredClone(s.getState().tabs[0]),p=${data(auditProfiles.postgres)};Object.assign(t,{id:'fix94',connectionProfileId:p.id,queryMode:'sql',result:${data(result)},resultRevision:1,sqlResultFilters:[],queryError:null,running:false});s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:'connected',generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:'loaded',error:null,isStale:false}}});window.__fix94copies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.__fix94copies.push(text)}})})()`)
  await waitFor(win, 'document.querySelectorAll("th").length===2', 'table')
  await js('document.querySelectorAll("th")[1].click()'); await settle()
  const state = () => js(`({headers:[...document.querySelectorAll('th')].map(e=>({sort:e.getAttribute('aria-sort'),width:e.getBoundingClientRect().width})),rows:[...document.querySelectorAll('[data-result-row-index]')].map(e=>e.textContent)})`)
  const before = await state()
  await dragDivider(win, '[aria-label="Resize name column"]', -120, 0); await settle()
  const after = await state()
  assert.ok(Math.abs(before.headers[0].width-after.headers[0].width)>10)
  assert.deepEqual(after.headers.map(h=>h.sort), before.headers.map(h=>h.sort))
  assert.deepEqual(after.rows, before.rows)
  assert.ok(after.rows.length<200, 'virtualization remains bounded')
  const expected = 'name,value\n'+result.rows.map(r=>(r.name??'')+','+r.value).join('\n')
  await js(`document.querySelector('[aria-label="Copy CSV"]').click();[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Export CSV').click()`)
  await waitFor(win, 'window.__fix94copies.length===1', 'CSV copy')
  assert.equal(await js('window.__fix94copies[0]'), expected)
  assert.equal(exports.at(-1)?.content, expected)
  const observations=[]
  const shot = async filename => {
    const target=await js(`document.querySelector('[data-result-table-pane]').getBoundingClientRect().toJSON()`)
    observations.push({filename,width:1440,height:900,dpr:1,zoom:1,target});await capture(win, filename)
  }
  await shot(screenshots[0])
  for (const width of [1440, 900]) {
    win.setContentSize(width,900);await settle()
    for (const row of [0,1]) {
      const selector=`[data-result-row-index="${row}"] summary[aria-label="Filter actions for name"]`
      await js(`document.querySelector(${data(selector)}).focus()`);await key('Enter');await key('Tab')
      assert.equal(await js(`document.activeElement.tagName`),'BUTTON')
      await key('Escape')
      assert.equal(await js(`document.activeElement===document.querySelector(${data(selector)})`),true)
      assert.equal(await js(`document.querySelector(${data(selector)}).closest('details').open`),false)
      assert.equal(await js('window.__datakoalaStore.getState().tabs[0].sqlResultFilters.length'),0)
    }
  }
  win.setContentSize(1440,900);await settle();await shot(screenshots[1])
  // Keyboard sorting after a completed resize is still usable.
  await js('document.querySelectorAll("th")[1].focus()');await key('Enter')
  assert.equal((await state()).headers[1].sort,'descending')
  await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({sourceHead:process.env.DATAKOALA_AUDIT_HEAD,observations,before,after,nativeClipboard:'unverified',nativeFilesystem:'unverified'},null,2))
}
