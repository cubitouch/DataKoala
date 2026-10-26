/** #517: actual create/edit form geometry, no Teleport connection. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles } from '../audit-fixtures.mjs'
export const screenshots = ['teleport-create.png', 'teleport-edit-narrow.png']
export function installAuditIpc(ipc) { installBaseIpc(ipc) }
export async function runVisualAudit({win, outputDir, waitFor, capture}) {
  const js = code => win.webContents.executeJavaScript(code)
  const click = text => js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`)
  const observations=[]
  win.show();win.focus();win.setContentSize(1440,900);win.webContents.setZoomFactor(1)
  await click('+ new connection');await js(`[...document.querySelectorAll('button')].find(b=>b.querySelector('strong')?.textContent==='PostgreSQL').click()`)
  const inspect = async (filename,width) => {
    win.setContentSize(width,900)
    await click('Advanced')
    await js(`[...document.querySelectorAll('label')].find(e=>e.textContent.includes('Open a Teleport tunnel')).click()`)
    await waitFor(win,'document.querySelector("#teleport-db-service")','Teleport fields')
    const geometry=await js(`(() => {const label=[...document.querySelectorAll('label')].find(e=>e.textContent.includes('Open a Teleport tunnel'));const field=document.querySelector('#teleport-db-service');const grid=field.closest('[class*=advancedFields]');return {gap:grid.getBoundingClientRect().top-label.getBoundingClientRect().bottom,target:document.querySelector('[role=dialog]').getBoundingClientRect().toJSON(),focus:document.activeElement.tagName}})()`)
    if(!process.env.DATAKOALA_CAPTURE_BASE)assert.ok(geometry.gap>=10,JSON.stringify(geometry))
    observations.push({filename,width,height:900,dpr:1,zoom:1,...geometry});await capture(win,filename)
    await js(`[...document.querySelectorAll('label')].find(e=>e.textContent.includes('Open a Teleport tunnel')).click()`)
    assert.equal(await js('!!document.querySelector("#teleport-db-service")'),false)
    await click('Cancel')
  }
  await inspect(screenshots[0],1440)
  await waitFor(win, '!document.querySelector("[role=dialog]")', 'closed create form')
  await js(`window.__datakoalaStore.setState({profiles:[${JSON.stringify(auditProfiles.postgres)}]})`)
  await waitFor(win, `document.querySelector('[aria-label="Edit connection ${auditProfiles.postgres.name}"]')`, 'saved synthetic profile')
  await js(`document.querySelector('[aria-label="Edit connection ${auditProfiles.postgres.name}"]').click()`)
  await inspect(screenshots[1],900)
  await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({sourceHead:process.env.DATAKOALA_AUDIT_HEAD,observations,liveTeleport:'Pending'},null,2))
}
