/** #493 / CAP-29 VC29-03: controlled delayed IPC rejection, native Save/retry. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
export const screenshots = ['fix93-failed-save.png', 'fix93-retried-save.png']
let settings, calls, releaseSave, fail
const ok = value => ({ok:true,value})
export function installAuditIpc(ipc) {
  installBaseIpc(ipc)
  settings = {provider:'openrouter',model:'synthetic/alpha',hasApiKey:true}
  calls=[];releaseSave=null;fail=true
  const handle = (channel, fn) => {ipc.removeHandler(channel);ipc.handle(channel,fn)}
  handle('ai:settings:get', () => ok({...settings}))
  handle('ai:models', () => ok([{id:'synthetic/alpha',name:'Alpha'},{id:'synthetic/beta',name:'Beta'}]))
  handle('ai:cancel', () => ok(null))
  handle('ai:settings:save', async (_event,input) => {
    assert.equal(input.apiKey,'','Never enter credentials in this audit')
    calls.push({model:input.model})
    if(fail) {
      await new Promise(done=>{releaseSave=done})
      releaseSave=null
      return {ok:false,code:'storage',message:'Synthetic settings save unavailable. Try again.'}
    }
    settings={...settings,model:input.model};return ok({...settings})
  })
}
export async function runVisualAudit({win,outputDir,waitFor,capture}) {
  const js=code=>win.webContents.executeJavaScript(code)
  const settle=()=>js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
  const key=async keyCode=>{
    win.webContents.sendInputEvent({type:'keyDown',keyCode})
    if(keyCode==='Enter')win.webContents.sendInputEvent({type:'char',keyCode:'\r'})
    win.webContents.sendInputEvent({type:'keyUp',keyCode});await settle()
  }
  const button=text=>js(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)throw Error('Missing enabled button');b.focus();return true})()`)
  win.show();win.focus();win.setContentSize(1440,900);win.webContents.setZoomFactor(1);await settle()
  await button('Settings');await key('Enter')
  await waitFor(win, `document.querySelector('[role=dialog] [role=combobox]')?.value==='synthetic/alpha'`, 'Settings loaded')
  await js(`window.__fix93parent=document.querySelector('[role=dialog]');document.querySelector('[role=dialog] [role=combobox]').click()`);await settle()
  await js(`[...document.querySelectorAll('[role=option]')].find(e=>e.textContent.includes('Beta')).click()`);await settle()
  // #470: nested Escape must close only the selector and keep the draft.
  await js(`document.querySelector('[role=dialog] [role=combobox]').click()`);await settle();await key('Escape')
  assert.equal(await js(`document.querySelector('[role=dialog]')===window.__fix93parent && !document.querySelector('[role=listbox]')`),true)
  assert.equal(await js(`document.activeElement===document.querySelector('[role=dialog] [role=combobox]')`),true)
  await button('Save');await key('Enter')
  assert.equal(typeof releaseSave,'function','Save remains pending until controlled rejection')
  assert.equal(await js(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Save').disabled`),true)
  assert.equal(settings.model,'synthetic/alpha')
  // Ensure a real async boundary before failure; disabled focus loss is native.
  await settle();releaseSave();await settle()
  await waitFor(win, `document.querySelectorAll('[role=alert]').length===1 && ![...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Save').disabled`, 'failed Save settled')
  assert.equal(await js(`document.querySelector('[role=dialog]')===window.__fix93parent && window.__fix93parent.contains(document.activeElement) && !document.activeElement.disabled`),true)
  assert.equal(await js(`document.querySelector('[role=dialog] [role=combobox]').value`),'synthetic/beta')
  assert.equal(settings.model,'synthetic/alpha')
  assert.equal(calls.length,1)
  const observations=[]
  const shot=async filename=>{
    const target=await js(`(document.querySelector('[role=dialog]')??document.querySelector('aside')).getBoundingClientRect().toJSON()`)
    observations.push({filename,width:1440,height:900,dpr:1,zoom:1,target});await capture(win,filename)
  }
  await shot(screenshots[0])
  // From the focused notice, Tab can reach an enabled action inside Settings.
  await key('Tab');assert.equal(await js('window.__fix93parent.contains(document.activeElement) && !document.activeElement.disabled'),true)
  fail=false;await button('Save');await key('Enter')
  await waitFor(win, '!document.querySelector("[role=dialog]")','successful retry closes Settings')
  assert.equal(calls.length,2);assert.equal(settings.model,'synthetic/beta')
  await shot(screenshots[1])
  await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({sourceHead:process.env.DATAKOALA_AUDIT_HEAD,observations,calls,model:settings.model,realKeychain:'unverified'},null,2))
}
