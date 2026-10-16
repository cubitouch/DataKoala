/** P2-06: real CodeMirror geometry/scrolling with synthetic Loki IPC. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc } from '../audit.mjs'
import { auditProfiles, auditRange } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'
export { installAuditIpc }
export const screenshots = ['stab06-raw-desktop.png', 'stab06-raw-narrow.png']
export async function runVisualAudit({ win, outputDir, waitFor, capture }) {
  const js = code => win.webContents.executeJavaScript(code)
  const settle = () => js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
  const profile = auditProfiles.loki
  const query = '{service_name="example-service"}\n' + Array.from({length:100},(_,i)=>'|= "line '+i+'"').join('\n')
  await js(`(() => {const s=window.__datakoalaStore,t=structuredClone(s.getState().tabs[0]),p=${data(profile)};Object.assign(t,{id:'stab06',connectionProfileId:p.id,queryMode:'sql',sql:${data(query)},result:null,queryError:null,running:false,lokiTimeRange:${data(auditRange)}});s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:'connected',generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:'loaded',error:null,isStale:false}}})})()`)
  await waitFor(win,'document.querySelector(".cm-scroller")','LogQL CodeMirror')
  const observations=[]
  for (const [i,width] of [1440,900].entries()) {
    win.setContentSize(width,900); await settle()
    for (const height of [300,420]) {
      await js(`document.querySelector('[aria-label="Loki explorer"]').parentElement.style.setProperty('--editor-height','${height}px')`); await settle()
      const layout=await js(`(() => {const e=document.querySelector('[aria-label="LogQL editor"]'),body=e.closest('[class*="rawQueryBody"]'),scroller=e.querySelector('.cm-scroller');scroller.scrollTop=1000;return {editor:e.getBoundingClientRect().toJSON(),body:body.getBoundingClientRect().toJSON(),client:scroller.clientHeight,scroll:scroller.scrollHeight,top:scroller.scrollTop,overflow:document.documentElement.scrollWidth>innerWidth}})()`)
      console.log('STAB06_LAYOUT',JSON.stringify({width,height,...layout}))
      assert.ok(layout.editor.height>100,'multiline editor must fill pane, not one line')
      assert.ok(Math.abs(layout.editor.height-layout.body.height)<2,'editor fills available body')
      assert.ok(layout.scroll>layout.client && layout.top>0,'native internal scrolling')
      assert.equal(layout.overflow,false)
      if(height===420) {
        observations.push({filename:screenshots[i],width,height:900,dpr:1,zoom:1,target:layout.editor,layout})
        await capture(win,screenshots[i])
      }
    }
    for (const label of ['Builder','LogQL']) {
      await js(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${data(label)});if(!b)throw Error('Missing mode');b.click()})()`);await settle()
    }
    assert.equal(await js('window.__datakoalaStore.getState().tabs[0].sql'),query)
  }
  await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({sourceHead:process.env.DATAKOALA_AUDIT_HEAD,observations},null,2))
}
