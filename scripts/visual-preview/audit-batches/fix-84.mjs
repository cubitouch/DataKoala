/** Batch 4 dialogs: real Electron keys + production renderer/IPC, synthetic providers. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles, auditKinds } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'
export const screenshots = ['fix84-picker.png','fix84-form.png','fix84-delete.png','fix84-reset.png','fix84-narrow.png']
let profiles, deletes, failDelete, releaseSave, saves
export function installAuditIpc(ipc) {
  installBaseIpc(ipc)
  profiles = auditKinds.map(kind => auditProfiles[kind]); deletes=[];failDelete=true;saves=[];releaseSave=null
  const handle=(channel,fn)=>{ipc.removeHandler(channel);ipc.handle(channel,fn)}
  handle('connections:list',()=>profiles)
  handle('connections:live',()=>[])
  handle('connections:remove',(_event,id)=>{deletes.push(id);if(failDelete)throw Error('Synthetic deletion unavailable');profiles=profiles.filter(p=>p.id!==id)})
  handle('connections:upsert',async(_event,profile)=>{saves.push(profile.id);await new Promise(done=>{releaseSave=done});return profile})
}
export async function runVisualAudit({win,outputDir,waitFor,capture}) {
  const baseline=process.env.DATAKOALA_BATCH4_BASELINE==='1'
  const js=code=>win.webContents.executeJavaScript(code)
  const settle=()=>js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
  const key=async(keyCode,modifiers=[])=>{win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});if(keyCode==='Enter')win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await settle()}
  const button=async label=>{await js(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${data(label)});if(!b)throw Error('Missing action');b.click()})()`);await settle()}
  const focused=[];const observations=[]
  const ownership=()=>js(`(()=>{const d=document.querySelector('[role=dialog]'),a=document.activeElement;return {inside:!!d?.contains(a),active:{tag:a.tagName,id:a.id,label:a.getAttribute('aria-label'),text:a.tagName==='INPUT'?null:a.textContent.slice(0,80)},dialogs:document.querySelectorAll('[role=dialog]').length}})()`)
  const traverse=async name=>{
    focused.push({name,phase:'initial',...await ownership()})
    if(!baseline) assert.equal(focused.at(-1).inside,true,name+' initial focus')
    for(const modifiers of [[],['shift']])for(let i=0;i<30;i++){
      await key('Tab',modifiers);const state=await ownership();focused.push({name,phase:modifiers.length?'reverse':'forward',...state});if(!baseline)assert.equal(state.inside,true,name+' native Tab ownership')
    }
  }
  const shot=async filename=>{const target=await js(`(document.querySelector('[role=dialog]')??document.querySelector('aside')).getBoundingClientRect().toJSON()`);const [width,height]=win.getContentSize();observations.push({filename,width,height,dpr:1,zoom:1,target});await capture(win,filename)}
  const openPicker=async()=>{await js(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='+ new connection');window.__batch4origin=b;b.focus()})()`);await key('Enter');await waitFor(win,`document.querySelector('#connection-picker-title')`,'picker');await settle()}
  const openKind=async kind=>{const pickerIndex={postgres:0,'local-files':1,'sqlite-file':2,bigquery:3,prometheus:4,tempo:5,loki:6}[kind];await js(`document.querySelectorAll('[role=radio]')[${pickerIndex}].click()`);await settle()}
  win.show();win.focus();win.setContentSize(1440,900);win.webContents.setZoomFactor(1);await settle()
  await openPicker();await traverse('picker');await shot(screenshots[0])
  for(const kind of auditKinds){
    await openKind(kind);await traverse('create '+kind)
    if(kind==='postgres'){
      await js(`(()=>{const e=document.querySelector('#profile-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Retained draft');e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await settle();await shot(screenshots[1])
    }
    await button('← Back')
    if(!baseline)assert.equal((await ownership()).inside,true,'Back keeps picker ownership')
  }
  await openKind('postgres');assert.equal(await js(`document.querySelector('#profile-name').value`),'Retained draft');await button('← Back');await button('Cancel')
  if(!baseline)assert.equal(await js('document.activeElement===window.__batch4origin'),true,'picker return')
  for(const kind of auditKinds){
    const selector='button[aria-label='+JSON.stringify('Edit connection '+auditProfiles[kind].name)+']'
    await js(`document.querySelector(${data(selector)}).focus()`);await key('Enter');await settle();await traverse('edit '+kind)
    if(!baseline){await key('Escape');assert.equal(await js(`document.activeElement===document.querySelector(${data(selector)})`),true,'edit return')}
    else await button('Cancel')
  }
  const deleteSelector='button[aria-label='+JSON.stringify('Delete connection '+auditProfiles.postgres.name)+']'
  await js(`document.querySelector(${data(deleteSelector)}).click()`);await settle();await shot(screenshots[2])
  if(!baseline){
    await traverse('delete');await button('Delete connection');await waitFor(win,`document.querySelector('[role=alert]')?.textContent.includes('Synthetic deletion unavailable')`,'recoverable deletion');assert.equal(deletes.length,1);failDelete=false;await button('Delete connection');await waitFor(win,`!document.querySelector('[role=dialog]')`,'delete retry');assert.deepEqual(deletes,[auditProfiles.postgres.id,auditProfiles.postgres.id])
  }else await button('Cancel')
  await button('Reset');await settle();await shot(screenshots[3]);if(!baseline)await traverse('reset');await button('Cancel')
  win.setContentSize(420,900);await openPicker();await openKind('bigquery');await settle();await shot(screenshots[4]);if(!baseline){const bounds=observations.at(-1).target;assert.ok(bounds.x>=0 && bounds.x+bounds.width<=420,'narrow containment');await traverse('narrow BigQuery')};await button('Cancel')
  if(!baseline){
    const selector='button[aria-label='+JSON.stringify('Edit connection '+auditProfiles.bigquery.name)+']'
    win.setContentSize(1440,900);await js(`document.querySelector(${data(selector)}).click()`);await settle();await button('Save');await settle();assert.equal(saves.length,1);assert.equal(typeof releaseSave,'function');await key('Escape');await openPicker();releaseSave();await settle();assert.equal(await js(`!!document.querySelector('#connection-picker-title')`),true,'obsolete Save cannot close replacement picker');await button('Cancel')
  }
  await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({sourceHead:process.env.DATAKOALA_AUDIT_HEAD,baseline,observations,focused,deletes,saves,providers:'synthetic; human acceptance Pending'},null,2))
}
