/** #492 / CAP-02: real sidebar CSS and native keyboard; synthetic saved profiles only. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'
export const screenshots = ['fix92-cancel-focus.png', 'fix92-confirm-focus.png']
let profiles, removals
export function installAuditIpc(ipc) {
  installBaseIpc(ipc)
  profiles = [auditProfiles.postgres, {...auditProfiles.postgres,id:'other-pg',name:'Other PG'}]
  removals = []
  const handle = (channel, fn) => { ipc.removeHandler(channel);ipc.handle(channel, fn) }
  handle('connections:list', () => profiles)
  handle('connections:live', () => [])
  handle('connections:remove', (_event, id) => {removals.push(id);profiles=profiles.filter(p=>p.id!==id)})
}
export async function runVisualAudit({win, outputDir, waitFor, capture}) {
  const js = code => win.webContents.executeJavaScript(code)
  const settle = () => js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
  const key = async (keyCode, modifiers=[]) => {
    win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers})
    if(keyCode==='Enter')win.webContents.sendInputEvent({type:'char',keyCode:'\r'})
    win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await settle()
  }
  win.show();win.focus();win.setContentSize(1440,900);win.webContents.setZoomFactor(1);await settle()
  const label='Delete connection '+auditProfiles.postgres.name
  const origin='button[aria-label='+JSON.stringify(label)+']'
  await waitFor(win, `document.querySelector(${data(origin)})`, 'saved profile')
  await js(`window.__fix92origin=document.querySelector(${data(origin)})`)
  const open = async () => {
    await js('window.__fix92origin.focus()')
    assert.equal(await js('document.activeElement===window.__fix92origin'),true,'Delete must be keyboard reachable without hover')
    await key('Enter')
    await waitFor(win, `document.querySelector('[role=dialog]')`, 'Delete dialog')
    assert.equal(await js('document.activeElement.textContent.trim()'),'Cancel')
    // The pointer must not keep the original row hovered during restoration.
    win.webContents.sendInputEvent({type:'mouseMove',x:1400,y:850});await settle()
  }
  const observations=[]
  const shot=async filename=>{
    const target=await js(`document.querySelector('aside').getBoundingClientRect().toJSON()`)
    observations.push({filename,width:1440,height:900,dpr:1,zoom:1,target});await capture(win,filename)
  }
  for(const dismissal of ['Escape','Cancel']) {
    await open()
    if(dismissal==='Escape')await key('Escape')
    else await js(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Cancel').click()`)
    await waitFor(win,'!document.querySelector("[role=dialog]") && document.activeElement===window.__fix92origin','exact Delete focus after '+dismissal)
    assert.equal(removals.length,0)
    assert.equal(await js('window.__datakoalaStore.getState().profiles.length'),2)
  }
  await shot(screenshots[0])
  // Native Tab reaches confirm; Enter removes exactly once.
  await open();await key('Tab');await key('Enter')
  await waitFor(win, `!document.querySelector(${data(origin)}) && document.activeElement.textContent.trim()==='+ new connection'`, 'surviving focus')
  assert.deepEqual(removals,[auditProfiles.postgres.id])
  assert.equal(await js(`!!document.querySelector('[aria-label="Delete connection Other PG"]')`),true)
  await shot(screenshots[1])
  await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({sourceHead:process.env.DATAKOALA_AUDIT_HEAD,observations,removals,nativeDatabase:'unverified'},null,2))
}
