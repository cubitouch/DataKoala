/** #405: same renderer, viewport and zoom for all three real row consumers. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles,auditRange,auditLogs,auditLogResult,auditTraceResult,auditSpanResult } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'
export const screenshots=['fix05-logs.png','fix05-patterns.png','fix05-traces.png','fix05-long-narrow.png','fix05-large-list.png',...(process.env.DATAKOALA_BATCH4_BASELINE==='1'?[]:['patterns-numeric-narrow.png','patterns-numeric-inspector.png','patterns-numeric-virtualized.png','patterns-numeric-total.png'])]
let openings
export function installAuditIpc(ipc){installBaseIpc(ipc);openings=[];ipc.removeHandler('query:run');ipc.handle('query:run',(_event,id,sql)=>{openings.push({id,sql});return {ok:true,result:auditSpanResult}})}
export async function runVisualAudit({win,outputDir,waitFor,capture}){
  const baseline=process.env.DATAKOALA_BATCH4_BASELINE==='1'
  const js=code=>win.webContents.executeJavaScript(code)
  const settle=()=>js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
  const observations=[],measurements=[]
  const key=async keyCode=>{win.webContents.sendInputEvent({type:'keyDown',keyCode});if(keyCode==='Enter')win.webContents.sendInputEvent({type:'char',keyCode:'\r'});if(keyCode==='Space')win.webContents.sendInputEvent({type:'char',keyCode:' '});win.webContents.sendInputEvent({type:'keyUp',keyCode});await settle()}
  const selectors={logs:'[aria-label="Log results"] article button',patterns:'[data-pattern-row] button',traces:'[class*="traceList"] button'}
  const seed=async(view,long=false,large=false)=>{
    const letters=n=>{let out='';for(let v=n;v>=0;v=Math.floor(v/26)-1)out=String.fromCharCode(97+v%26)+out;return out}
    const kind=view==='traces'?'tempo':'loki',p=auditProfiles[kind]
    const numericGroups=[{count:1,line:'Ready',severity:''},{count:10,line:'Queue delayed',severity:'INFO'},{count:990,line:'Cache invalidated unexpectedly',severity:'WARN'},{count:1000,line:'Missing dependency stops worker jobs',severity:'CUSTOM-VERY-LONG-LEVEL'},{count:7999,line:'Background authentication failure requires administrator attention immediately',severity:'ERROR'}]
    const rows=view==='patterns'&&!large?numericGroups.flatMap((g,index)=>Array.from({length:g.count},(_,i)=>({...auditLogs[0],id:'group-'+index+'-'+i,line:g.line,severity:g.severity}))):Array.from({length:large?(view==='patterns'?600:5000):4},(_,i)=>({...auditLogs[0],id:'row-'+i,severity:['INFO','WARN','CUSTOM-VERY-LONG-LEVEL',''][i%4],line:view==='patterns'&&large?'Pattern'+letters(i)+' reports a distinct semantic event':long?'Long message\n'+('Readable message with context '.repeat(50)):['Ready','Queue delayed','Cache invalidated','Missing dependency'][i%4],timestampMs:auditLogs[0].timestampMs-i,timestampNs:String(BigInt(auditLogs[0].timestampMs-i)*1000000n)}))
    const result=view==='traces'?{...auditTraceResult,rows:[{...auditTraceResult.rows[0],rootService:'api',rootOperation:'Ready',matchedSpans:1}],rowCount:1}:{...auditLogResult,rows,logRows:rows,rowCount:rows.length}
    await js(`(()=>{const s=window.__datakoalaStore,t=JSON.parse(JSON.stringify(s.getState().tabs[0])),p=${data(p)};t.id='rows-${view}';t.connectionProfileId=p.id;t.result=${data(result)};t.resultRevision=(t.resultRevision??0)+1;t.queryError=null;t.running=false;t.sql=${data(kind==='tempo'?'{ true }':'{service_name="example-service"}')};t.queryMode='sql';t.lokiResultView=${data(view==='patterns'?'patterns':'list')};t.lokiGroupBy=[];t.lokiTimeRange=${data(auditRange)};t.tempoTimeRange=${data(auditRange)};t.tempoResultView='list';s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:'connected',generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:'loaded',error:null,isStale:false}}})})()`)
    await waitFor(win,`document.querySelector(${data(selectors[view])})`,'actual '+view+' row');await settle()
  }
  const measure=async view=>js(`(()=>{const b=document.querySelector(${data(selectors[view])}),r=b.closest('[data-observability-row]')??b.closest('article')??b,c=b.querySelector('[data-row-chevron],[data-log-row-chevron]'),box=r.getBoundingClientRect(),chevron=c?.getBoundingClientRect();return {height:box.height,width:box.width,font:getComputedStyle(b).font,chevronRight:chevron?box.right-chevron.right:null,shared:!!r.matches('[data-observability-row]')}})()`)
  const shot=async filename=>{const target=await js(`(document.querySelector('[data-observability-row]')??document.querySelector('main')??document.body).getBoundingClientRect().toJSON()`);const [width,height]=win.getContentSize();observations.push({filename,width,height,dpr:1,zoom:1,target});await capture(win,filename)}
  const numericGeometry=async label=>{
    const cells=await js(`([...document.querySelectorAll('[data-pattern-row] button')].map(b=>{const c=b.querySelector('[data-pattern-count]'),p=b.querySelector('[data-pattern-percentage]'),s=b.querySelector('[data-log-level-cell]'),t=b.querySelector('[data-pattern-template]');return{count:c.textContent,countTitle:c.title,percentage:p.textContent,countBox:c.getBoundingClientRect().toJSON(),percentageBox:p.getBoundingClientRect().toJSON(),severityBox:s.getBoundingClientRect().toJSON(),templateBox:t.getBoundingClientRect().toJSON(),button:b.getBoundingClientRect().toJSON(),chevron:b.querySelector('[data-row-chevron]').getBoundingClientRect().toJSON(),height:b.closest('[data-observability-row]').getBoundingClientRect().height}}))`)
    assert.ok(cells.length)
    for(const c of cells){assert.equal(c.height,42);assert.equal(c.severityBox.width,88);for(const key of ['countBox','percentageBox','severityBox','templateBox'])assert.ok(Math.abs(c[key].x-cells[0][key].x)<1,key+' starts align');assert.ok(Math.abs(c.countBox.width-cells[0].countBox.width)<1);assert.ok(Math.abs(c.percentageBox.width-cells[0].percentageBox.width)<1);assert.ok(c.chevron.right<=c.button.right,'chevron reachable');assert.ok(c.percentageBox.right<c.severityBox.x,'numeric columns do not overlap severity')}
    measurements.push({label,numeric:cells});return cells
  }
  win.show();win.focus();win.setContentSize(1440,900);win.webContents.setZoomFactor(1);await settle()
  for(const [index,view] of ['logs','patterns','traces'].entries()){
    await seed(view);if(!baseline&&view!=='traces'){const cells=await js(`[...document.querySelectorAll('[data-observability-row] [data-log-level-cell]')].map(e=>({width:e.getBoundingClientRect().width,start:e.parentElement.nextElementSibling.getBoundingClientRect().left,height:e.closest('[data-observability-row]').getBoundingClientRect().height}))`);assert.ok(cells.length>0);assert.ok(cells.every(c=>c.width===88&&c.height===42),'same bounded level slot and compact height');assert.ok(cells.every(c=>Math.abs(c.start-cells[0].start)<1),'message starts align');}measurements.push({view,...await measure(view)});await shot(screenshots[index])
    if(!baseline){assert.equal(measurements.at(-1).shared,true,view+' renders shared component');const firstTemplate=view==='patterns'?await js(`document.querySelector('[data-pattern-template]').textContent`):'';await js(`document.querySelector(${data(selectors[view])}).focus()`);await key(view==='patterns'?'Space':'Enter');if(view==='logs')assert.equal(await js(`!!document.querySelector('[aria-label="Selected log details"]') && document.body.innerText.includes('Ready')`),true);if(view==='patterns'){assert.equal(await js(`!!document.querySelector('[aria-label="Selected pattern details"]') && document.querySelector('[aria-label="Selected pattern details"]').textContent.includes(${data(firstTemplate)})`),true)}if(view==='traces'){await waitFor(win,`!document.querySelector(${data(selectors.traces)})`,'opened trace');assert.equal(openings.at(-1).sql,auditTraceResult.rows[0].traceId)}}
  }
  if(!baseline){assert.deepEqual(measurements.map(m=>m.height),[42,42,42],'actual single-line row height');assert.ok(measurements.every(m=>Math.abs(m.chevronRight-14)<1),'shared trailing alignment')}
  win.setContentSize(900,900);await seed('logs',true);const long=await measure('logs');if(!baseline)assert.equal(long.height,42,'long/newline Loki previews stay one line');await shot(screenshots[3])
  win.setContentSize(1440,900);await seed('logs',false,true)
  await js(`document.querySelector(${data(selectors.logs)}).focus();window.__rowOrigin=document.activeElement;const e=document.querySelector('[class*="logScroller"]');e.scrollTop=e.scrollHeight;`);await settle()
  const rendered=await js(`document.querySelectorAll('[aria-label="Log results"] article').length`);assert.ok(rendered<100,'5000 rows stay virtualized')
  if(!baseline){assert.equal(await js('window.__rowOrigin.isConnected && document.activeElement===window.__rowOrigin'),true,'focused recycled identity remains mounted');await key('Enter');assert.equal(await js(`!!document.querySelector('[aria-label="Selected log details"]')`),true)}
  await shot(screenshots[4])
  if(!baseline){
  await seed('patterns');const desktop=await numericGeometry('desktop mixed 10000-log fixture');assert.deepEqual(desktop.map(c=>c.count).sort(),['1','10','1000','7999','990'].sort());assert.ok(desktop.some(c=>c.percentage==='0.1%')&&desktop.some(c=>c.percentage==='9.9%')&&desktop.some(c=>c.percentage==='10.0%'))
  win.setContentSize(900,900);await settle();await numericGeometry('narrow');await shot('patterns-numeric-narrow.png')
  await js(`document.querySelector('[data-pattern-row] button').click()`);await settle();await numericGeometry('narrow with inspector');await shot('patterns-numeric-inspector.png')
  await js(`document.querySelector('[data-pattern-row] button').click()`);await settle()
  // Coherent one-cluster fixture proves 100.0% and a five-digit count.
  await js(`(()=>{const s=window.__datakoalaStore,t=s.getState().tabs[0],rows=t.result.logRows.map(r=>({...r,line:'One identical pattern',severity:'INFO'}));s.setState({tabs:[{...t,result:{...t.result,rows,logRows:rows},resultRevision:t.resultRevision+1}]})})()`);await settle();const total=await numericGeometry('single 10000-log pattern');assert.equal(total[0].percentage,'100.0%');assert.equal(total[0].count,'10000');await shot('patterns-numeric-total.png')
  await seed('patterns',false,true);await js(`document.querySelector('[data-pattern-scroller]').scrollTop=100000`);await settle();await numericGeometry('virtualized after scroll');assert.ok(await js(`document.querySelectorAll('[data-pattern-row]').length < 100 && Math.max(...[...document.querySelectorAll('[data-pattern-row]')].map(e=>Number(e.dataset.index)))>100`));await shot('patterns-numeric-virtualized.png')
  }
  await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({sourceHead:process.env.DATAKOALA_AUDIT_HEAD,baseline,observations,measurements,long,rendered,openings,providers:'synthetic; manual acceptance Pending'},null,2))
}
