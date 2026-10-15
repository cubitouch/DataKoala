/** CAP-29: isolated synthetic settings; real renderer and native Escape input. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { rendererValue as data } from '../renderer-value.mjs'

export const screenshots = [
  'cap29-dialog-settings-desktop.png',
  'cap29-nested-settings-options-desktop.png',
  'cap29-nested-settings-escape-desktop.png',
]
const catalog = [
  { id: 'synthetic/alpha', name: 'Synthetic Alpha' },
  { id: 'synthetic/beta', name: 'Synthetic Beta' },
  { id: 'synthetic/' + 'long-model-identifier-'.repeat(10), name: 'Synthetic long model' },
]
let settings, calls, mode, releaseModels
const success = value => ({ ok: true, value })
export function installAuditIpc(ipc) {
  installBaseIpc(ipc)
  settings = { provider: 'openrouter', model: '', hasApiKey: false }
  calls = []; mode = 'normal'; releaseModels = null
  const handle = (channel, fn) => { ipc.removeHandler(channel); ipc.handle(channel, fn) }
  handle('ai:settings:get', () => {
    calls.push({ channel: 'get', value: { ...settings } })
    return success({ ...settings })
  })
  handle('ai:models', async () => {
    calls.push({ channel: 'models', mode })
    if (mode === 'loading') await new Promise(done => { releaseModels = done })
    return success(mode === 'empty' ? [] : catalog)
  })
  handle('ai:settings:save', (_event, input) => {
    // Do not retain key values, even in audit diagnostics.
    assert.equal(input.apiKey, '', 'CAP-29 never enters credentials')
    calls.push({ channel: 'save', model: input.model, keySubmitted: false, mode })
    if (mode === 'save-error') return { ok: false, code: 'storage', message: 'Synthetic settings save unavailable. Try again.' }
    assert.ok(catalog.some(m => m.id === input.model))
    settings = { ...settings, model: input.model }
    return success({ ...settings })
  })
  handle('ai:cancel', () => { calls.push({ channel: 'cancel' }); return success(null) })
  for (const channel of ['ai:test', 'ai:propose', 'ai:propose-builder', 'ai:analyze-anomalies', 'ai:analyze-plan', 'ai:key:remove'])
    handle(channel, () => { throw Error('CAP-29 forbids provider/secret operation: ' + channel) })
}

export async function runVisualAudit({ win, outputDir, waitFor, capture }) {
  await mkdir(outputDir, { recursive: true })
  const observations = [], ledger = [], escapeTrials = []
  const js = expression => win.webContents.executeJavaScript(expression)
  const settle = () => js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
  const wait = (expression, label) => waitFor(win, expression, 'CAP-29 ' + label)
  const click = async selector => { await wait('document.querySelector(' + data(selector) + ')', selector); await js('document.querySelector(' + data(selector) + ').click()'); await settle() }
  const button = async text => {
    await js('(() => {const b=[...document.querySelectorAll("button")].find(e=>e.textContent.trim()===' + data(text) + ');if(!b||b.disabled)throw Error("Missing enabled button");b.focus();b.click()})()')
    await settle()
  }
  const key = async (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await settle()
  }
  const state = () => js(`(() => {
    const dialog=document.querySelector('[role=dialog][aria-modal=true]'), child=document.querySelector('[data-popover-overlay]'), active=document.activeElement;
    const identity=e=>e?{tag:e.tagName,id:e.id,role:e.getAttribute('role'),label:e.getAttribute('aria-label'),text:e.tagName==='INPUT'?null:e.textContent.trim().slice(0,90)}:null;
    const number=e=>{if(!e)return null; if(!window.__cap29.ids.has(e))window.__cap29.ids.set(e,++window.__cap29.next);return window.__cap29.ids.get(e)};
    const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
    return {modal:!!dialog,popover:!!child,parentIdentity:number(dialog),childIdentity:number(child),active:identity(active),focusInParent:!!dialog?.contains(active),focusInChild:!!child?.contains(active),selected:dialog?.querySelector('[role=combobox]')?.value??null,overlayCount:document.querySelectorAll('[data-modal-backdrop],[data-popover-overlay]').length,escapes:window.__cap29.escapes,events:window.__cap29.events,target:box(dialog),childBounds:box(child),childZ:child?getComputedStyle(child).zIndex:null,backdropZ:dialog?getComputedStyle(dialog.parentElement).zIndex:null,alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent.trim())}
  })()`)
  const record = async name => { const entry = { name, ...await state(), ipcCount: calls.length, saves: calls.filter(c => c.channel === 'save').length }; ledger.push(entry); console.log('CAP29_TRANSITION ' + JSON.stringify(entry)); return entry }
  const open = async () => {
    await button('Settings')
    await wait('document.querySelector("[role=dialog][aria-modal=true]") && !document.querySelector("[role=dialog] [role=combobox]").disabled', 'settings ready')
    await settle()
  }
  const select = async id => {
    await click('[role=dialog] [role=combobox]')
    await wait('document.querySelectorAll("[role=option]").length>0', 'options')
    await js('(() => {const e=[...document.querySelectorAll("[role=option]")].find(e=>e.textContent.includes(' + data(id) + '));if(!e)throw Error("Missing fixture option");e.click()})()')
    await settle()
    assert.equal((await state()).selected, id)
  }
  const saveImage = async (filename, targetSelector) => {
    await settle()
    const snapshot = await state()
    const geometry = await js('(() => {const r=document.querySelector(' + data(targetSelector) + ').getBoundingClientRect();return {target:{x:r.x,y:r.y,width:r.width,height:r.height},width:innerWidth,height:innerHeight,dpr:devicePixelRatio}})()')
    assert.deepEqual([geometry.width,geometry.height,geometry.dpr,win.webContents.getZoomFactor()], [1440,900,1,1])
    assert.ok(geometry.target.width>0 && geometry.target.height>0)
    observations.push({ filename, ...geometry, zoom: 1, state: snapshot })
    await capture(win, filename)
  }
  win.show(); win.focus(); win.setContentSize(1440,900); win.webContents.setZoomFactor(1)
  await js(`window.__cap29={ids:new WeakMap(),next:0,escapes:0,events:[]};document.addEventListener('keydown',e=>{if(e.key==='Escape'){window.__cap29.escapes++;window.__cap29.events.push({phase:'document-capture',parent:!!document.querySelector('[data-modal-backdrop]'),child:!!document.querySelector('[data-popover-overlay]'),targetRole:e.target.getAttribute('role'),targetLabel:e.target.getAttribute('aria-label')})}},true)`)
  await open()
  const initial = await record('unconfigured')
  assert.equal(initial.active.role, 'dialog', 'Initial focus belongs to dialog')
  assert.equal(initial.selected, '')
  assert.equal(await js('document.querySelector("input[type=password]").value'), '')
  assert.equal(await js('[...document.querySelectorAll("[role=dialog] button")].find(e=>e.textContent.trim()==="Save").disabled'), true)
  await saveImage(screenshots[0], '[role=dialog]')
  // Actual native Tab boundary wrapping, rather than a synthetic key event.
  await js('[...document.querySelectorAll("[role=dialog] button:not([disabled])")].at(-1).focus()')
  await key('Tab')
  // The API-key help button precedes its input in the real field chrome.
  assert.equal(await js('document.activeElement===document.querySelector("[role=dialog] button:not([disabled])")'), true, 'Tab wraps to the first actual focusable help control')
  await record('unconfigured-forward-tab-wrap')
  await key('Tab', ['shift'])
  assert.equal(await js('document.activeElement.textContent.trim()'), 'Cancel', 'Disabled Save/Test excluded from reverse focus wrap')
  await record('unconfigured-tab-wrap')
  await button('Cancel')
  // Configure only the supported IPC fixture; no secret is supplied or stored.
  settings = { provider: 'openrouter', model: catalog[0].id, hasApiKey: true }
  for (let trial=0; trial<2; trial++) {
    await open()
    const parent = await record('configured-parent-' + trial)
    assert.equal(await js('document.querySelector("input[type=password]").value'), '••••••••••••••••')
    await click('[role=dialog] [role=combobox]')
    await wait('document.querySelector("[role=listbox][aria-label=Model]")', 'nested list present')
    const nested = await record('nested-open-' + trial)
    assert.equal(nested.parentIdentity, parent.parentIdentity, 'Opening child must preserve parent DOM identity')
    const options = await js('[...document.querySelectorAll("[role=option]")].map(e=>({text:e.textContent,selected:e.getAttribute("aria-selected")}))')
    assert.equal(options.length, catalog.length)
    for (let i=0;i<catalog.length;i++) assert.ok(options[i].text.includes(catalog[i].id))
    assert.deepEqual(options.map(o=>o.selected), ['true','false','false'])
    assert.ok(nested.childBounds.x>=0 && nested.childBounds.y>=0 && nested.childBounds.x+nested.childBounds.width<=1440 && nested.childBounds.y+nested.childBounds.height<=900)
    const stacking = await js('(() => {const e=document.querySelector("[data-popover-overlay]"),r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+10,r.y+10))})()')
    assert.equal(stacking,true,'Nested overlay paints above modal')
    // Observe automatic focus before explicitly placing native pointer focus in
    // the visible search control for keyboard navigation. Never manufacture a
    // passing automatic-focus assertion by forcing focus before its snapshot.
    const searchPoint = await js('(() => {const r=document.querySelector("[data-combobox-search] input").getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()')
    win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...searchPoint})
    win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...searchPoint})
    await settle()
    assert.equal(await js('document.activeElement===document.querySelector("[data-combobox-search] input")'),true)
    await record('nested-search-native-focus-' + trial)
    await key('Down')
    assert.ok(await js('document.querySelector("[role=option][data-active=true]").textContent.includes("synthetic/beta")'), 'ArrowDown moves active option')
    await record('nested-arrow-down-' + trial)
    await key('Home')
    assert.ok(await js('document.querySelector("[role=option][data-active=true]").textContent.includes("synthetic/alpha")'), 'Home restores first active option')
    assert.equal((await state()).selected,catalog[0].id,'Navigation does not commit')
    assert.equal(calls.filter(c=>c.channel==='save').length,0,'Navigation never saves')
    if (!trial) await saveImage(screenshots[1], '[data-popover-overlay]')
    const before = await record('before-first-Escape-' + trial)
    await key('Escape')
    await wait('!document.querySelector("[data-popover-overlay]")','first Escape child dismissed')
    const after = await record('after-first-Escape-' + trial)
    // KNOWN DEFECT V-02 / VC29-01. This exact characterization must change
    // after a production fix, with parent-preservation/focus acceptance added.
    assert.deepEqual({modal:after.modal,popover:after.popover,overlayCount:after.overlayCount,escapeDelta:after.escapes-before.escapes,focus:after.active.text},
      {modal:false,popover:false,overlayCount:0,escapeDelta:1,focus:'Settings'},
      'CAP-29 known Escape defect changed: review and update characterization; never accept arbitrary outcomes')
    assert.equal(settings.model,catalog[0].id)
    if (!trial) await saveImage(screenshots[2], 'aside[aria-label="Connections and objects"]')
    await key('Escape')
    const second = await record('after-second-Escape-' + trial)
    assert.equal(second.modal,false); assert.equal(second.active.text,'Settings')
    escapeTrials.push({before,after,second,productAcceptance:'FAIL: first Escape must preserve Settings and return focus to model'})
  }
  await open(); await select(catalog[1].id)
  await record('alternative-draft')
  assert.equal(settings.model,catalog[0].id)
  await button('Cancel'); await open()
  assert.equal((await state()).selected,catalog[0].id,'Cancel does not save')
  await select(catalog[1].id); await button('Save')
  await wait('!document.querySelector("[data-modal-backdrop]")','save closes modal')
  assert.equal(settings.model,catalog[1].id)
  await open(); assert.equal((await state()).selected,catalog[1].id)
  await record('saved-alternative-reloaded')
  // Failed save leaves the draft and focus usable and does not persist it.
  await select(catalog[0].id); mode='save-error'; await button('Save')
  await wait('document.querySelector("[role=alert]")','save error')
  const failed = await record('failed-save')
  assert.deepEqual(failed.alerts,['Synthetic settings save unavailable. Try again.'])
  assert.equal(failed.modal,true); assert.equal(failed.selected,catalog[0].id)
  assert.equal(settings.model,catalog[1].id)
  mode='normal'; await button('Save'); await open()
  assert.equal((await state()).selected,catalog[0].id)
  await record('save-retry-reloaded'); await button('Cancel')
  mode='loading'; await open(); await click('[role=dialog] [role=combobox]')
  await wait('document.querySelector("[role=listbox][aria-busy=true]")','gated model loading')
  await record('catalog-loading'); assert.ok(releaseModels); releaseModels(); await settle()
  await wait('document.querySelectorAll("[role=option]").length===3','loading settled')
  await click('[role=dialog] [role=combobox]'); await button('Cancel')
  mode='empty'; settings={provider:'openrouter',model:'',hasApiKey:false}
  await open(); await click('[role=dialog] [role=combobox]')
  await wait('document.querySelector("[role=listbox]")?.textContent.includes("No matching options")','empty catalog')
  assert.equal(await js('document.querySelectorAll("[role=option]").length'),0)
  await record('empty-catalog'); await click('[role=dialog] [role=combobox]'); await button('Cancel')
  mode='normal'; settings={provider:'openrouter',model:catalog[0].id,hasApiKey:false}
  await open()
  assert.equal(await js('[...document.querySelectorAll("[role=dialog] button")].find(e=>e.textContent.trim()==="Test connection").disabled'),true)
  await record('missing-credentials')
  await select(catalog[2].id); await record('long-identifier-draft')
  // Arbitrary invalid identifiers cannot be committed by the non-custom selector.
  await click('[role=dialog] [role=combobox]')
  await js('(() => {const e=document.querySelector("[aria-label=\\"Search Model\\"]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,"not-a-model");e.dispatchEvent(new Event("input",{bubbles:true}))})()')
  await wait('document.querySelectorAll("[role=option]").length===0','unmatched search')
  await key('Return')
  assert.equal((await state()).selected,catalog[2].id)
  await record('invalid-search-no-commit')
  await click('[role=dialog] [role=combobox]'); await button('Cancel')
  const sourceHead=process.env.DATAKOALA_AUDIT_HEAD
  assert.match(sourceHead??'',/^[0-9a-f]{40}$/)
  await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({sourceHead,viewport:{width:1440,height:900,dpr:1,zoom:1},fixture:{catalog,secret:'none; configured boolean only'},observations,ledger,escapeTrials,calls,productAcceptance:'FAIL',disposition:'PARTIAL',limitations:['Synthetic IPC persistence only; OS credential encryption remains source-only','Dismissal callback internals not instrumented; DOM disappearance and native event capture observed','No real OpenRouter requests or credentials','Loading screenshot not captured within three-image budget']},null,2)+'\n')
}
