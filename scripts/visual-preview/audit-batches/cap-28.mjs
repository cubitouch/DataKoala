/** CAP-28 audit only: native chart/export/anomaly/result lifecycle with synthetic IPC. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { nativeImage } from 'electron'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'

export const screenshots = [
  'cap28-chart-ready-desktop.png',
  'cap28-chart-export-feedback-desktop.png',
  'cap28-ai-chart-anomaly-details-desktop.png',
  'cap28-chart-empty-desktop.png',
  'cap28-postgres-error-chart-desktop.png',
]
const times = Array.from({length:6},(_,i)=>new Date(Date.UTC(2026,7,19,16,i*10)).toISOString())
const values = {Alpha:[20,22,180,21,24,23],Beta:[50,52,49,53,51,54]}
const fixture = {
  columns:[
    {name:'timestamp',logicalType:'timestamp',dataTypeName:'timestamptz',dataTypeID:1184},
    {name:'service',logicalType:'string',dataTypeName:'text',dataTypeID:25},
    {name:'value',logicalType:'number',dataTypeName:'int4',dataTypeID:23},
  ],
  rows:times.flatMap((timestamp,i)=>Object.keys(values).map(service=>({timestamp,service,value:values[service][i]}))),
  rowCount:12,durationMs:7,execution:{provider:'postgres',rowCount:12,durationMs:7},
}
const revised = {...fixture,rows:fixture.rows.map(r=>({...r,service:r.service+' v2',timestamp:new Date(Date.parse(r.timestamp)+86400000).toISOString(),value:r.value+10}))}
const requests=[], aiRequests=[], exports=[], cancellations=[]
let queryMode='normal', aiMode='normal', exportMode='success', releaseQuery=null, releaseAi=null
const response = request => ({ok:true,value:{
  summary:'Alpha has one isolated spike; Beta is a stable control.',
  anomalies:[{seriesIndex:request.chart.series.findIndex(s=>s.name==='Alpha'),pointIndex:2,title:'Isolated spike',reason:'Alpha rises to 180 at 16:20 and returns to its baseline.',severity:'high'}],
  limitations:['Synthetic sample establishes identity, not causation.'],followUps:['Compare the next revision.'],
}})
export function installAuditIpc(ipc) {
  installBaseIpc(ipc)
  const handle=(channel,fn)=>{ipc.removeHandler(channel);ipc.handle(channel,fn)}
  handle('ai:settings:get',()=>({ok:true,value:{provider:'openrouter',model:'cap28/synthetic',hasApiKey:true}}))
  handle('ai:cancel',(_e,id)=>{cancellations.push(id);return {ok:true}})
  handle('ai:analyze-anomalies',async (_e,request)=>{
    aiRequests.push(request)
    if(aiMode==='delayed')return new Promise(done=>{releaseAi=()=>done(response(request))})
    if(aiMode==='error')return {ok:false,kind:'provider',message:'CAP-28 synthetic AI unavailable. Try Analyze with AI again.'}
    return response(request)
  })
  handle('query:run',async (_e,id,query,parameters,options)=>{
    const mode=queryMode;requests.push({id,query,parameters,options,mode})
    if(mode==='loading')await new Promise(done=>{releaseQuery=done})
    if(mode==='error')return {ok:false,kind:'query',message:'CAP-28 synthetic SQL error: column missing_column does not exist'}
    return {ok:true,result:mode==='empty'?{...fixture,rows:[],rowCount:0}:mode==='revised'?revised:fixture}
  })
  handle('export:save-binary',(_e,options)=>{
    exports.push({options,mode:exportMode})
    if(exportMode==='error')throw Error('CAP-28 synthetic save denied')
    return exportMode==='cancel'?null:'/synthetic/cap28-chart.png'
  })
}
export async function runVisualAudit({win,outputDir,waitFor,capture,dragDivider}) {
  await mkdir(outputDir,{recursive:true})
  const observations=[],checks=[]
  const js=expression=>win.webContents.executeJavaScript(expression)
  const settle=()=>js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
  const tab=()=>js('window.__datakoalaStore.getState().tabs[0]')
  const click=async(name,scope='button')=>{
    const target='[...document.querySelectorAll('+data(scope)+')].find(e=>!e.disabled&&(e.textContent.trim()==='+data(name)+'||e.getAttribute("aria-label")==='+data(name)+'))'
    await waitFor(win,target,'control '+name);await js('('+target+').click()');await settle()
  }
  const text=()=>js('document.body.innerText')
  const waitText=value=>waitFor(win,'document.body.innerText.includes('+data(value)+')',value)
  const ready=async()=>{
    await waitFor(win,'(()=>{const c=document.querySelector("[data-result-chart-canvas]");return c?.dataset.visualFinished==="true"&&c.dataset.visualFingerprint===c.dataset.visualExpectedFingerprint&&Number(c.dataset.visualItems)>0&&!!c.querySelector("canvas")})()','completed populated chart')
    await settle()
  }
  // Read the actual mounted ECharts instance through the same audit-only React
  // traversal as the canonical AI preview. No callbacks or chart options injected.
  const inspect=body=>js('(()=>{const root=document.querySelector("[data-result-chart-canvas]");if(!root)return null;for(const e of [root,...root.querySelectorAll("*")]){const key=Object.keys(e).find(k=>k.includes("reactFiber"));let f=key?e[key]:null;while(f){const component=f.stateNode;if(typeof component?.getEchartsInstance==="function"){const chart=component.getEchartsInstance();'+body+'}f=f.return}}throw Error("Mounted ECharts instance missing")})()')
  const chart=()=>inspect('const o=chart.getOption();return {series:o.series.map(s=>({name:s.name,type:s.type,data:s.data,overlay:s.aiAnomalyOverlay===true})),xAxis:o.xAxis,yAxis:o.yAxis,width:chart.getWidth(),height:chart.getHeight(),finished:root.dataset.visualFinished,fingerprint:root.dataset.visualFingerprint,expected:root.dataset.visualExpectedFingerprint,configuration:root.dataset.visualConfig}')
  const pixelCounts=()=>js('(()=>{const counts={orange:0,cyan:0,red:0};for(const c of document.querySelectorAll("[data-result-chart-canvas] [class*=plot] canvas")){const a=c.getContext("2d").getImageData(0,0,c.width,c.height).data;for(let i=0;i<a.length;i+=4){if(a[i+3]<180)continue;const r=a[i],g=a[i+1],b=a[i+2];if(Math.abs(r-239)<18&&Math.abs(g-138)<18&&Math.abs(b-98)<18)counts.orange++;if(Math.abs(r-98)<18&&Math.abs(g-184)<18&&Math.abs(b-197)<18)counts.cyan++;if(r>220&&g<110&&b<115)counts.red++}}return counts})()')
  const frame=async(filename,description,selector)=>{
    await settle()
    const m=await js('(()=>{const r=document.querySelector('+data(selector)+')?.getBoundingClientRect();return {viewport:{width:innerWidth,height:innerHeight},dpr:devicePixelRatio,target:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,alerts:[...document.querySelectorAll("[role=alert]")].map(e=>e.textContent.trim()),empty:document.querySelector("[data-result-empty]")?.textContent.trim(),controls:[...document.querySelectorAll("[data-result-explorer] button")].map(e=>({text:e.textContent.trim(),disabled:e.disabled})),comboboxes:[...document.querySelectorAll("[data-result-explorer] [role=combobox]")].map(e=>e.getAttribute("aria-label"))}})()')
    assert.deepEqual(m.viewport,{width:1440,height:900});assert.equal(m.dpr,1);assert.equal(win.webContents.getZoomFactor(),1);assert.ok(m.target?.width>0&&m.target.height>0)
    observations.push({filename,description,...m,zoom:1,resultRevision:(await tab()).resultRevision,providerCount:requests.length,chart:await chart()})
    await capture(win,filename)
  }
  const noQuery=(before,label)=>{assert.equal(requests.length,before,label);checks.push({label,providerBefore:before,providerAfter:requests.length,delta:0})}
  const run=async(mode)=>{
    queryMode=mode;const before=requests.length
    await click('Run','[data-query-toolbar] button')
    if(mode==='loading'){await waitFor(win,'window.__datakoalaStore.getState().tabs[0].running','running query');return}
    await waitFor(win,'!window.__datakoalaStore.getState().tabs[0].running','query completed')
    assert.equal(requests.length,before+1)
  }
  const combo=async(label,option)=>{
    const trigger='[...document.querySelectorAll("[role=combobox]")].find(e=>e.getAttribute("aria-label")?.startsWith('+data(label+':')+'))'
    await waitFor(win,trigger,label);await js('('+trigger+').click()')
    const target='[...document.querySelectorAll("[role=option]")].find(e=>e.querySelector("[data-combobox-option-label]")?.textContent.trim()==='+data(option)+')'
    await waitFor(win,target,option);await js('('+target+').click()');await settle()
  }
  win.show();win.focus();win.setContentSize(1440,900);win.webContents.setZoomFactor(1)
  await js('(()=>{const s=window.__datakoalaStore,t=JSON.parse(JSON.stringify(s.getState().tabs[0])),p='+data(auditProfiles.postgres)+';Object.assign(t,{id:"cap28",title:"CAP-28 synthetic",connectionProfileId:p.id,queryMode:"sql",sql:"select timestamp, service, value from synthetic_cap28",result:null,pendingResult:null,resultRevision:0,lastSuccessfulResultRevision:0,isResultStale:false,queryError:null,running:false,sqlResultFilters:[],builderResultFilters:[],seriesVisibility:{},sqlVisualization:{view:"line",xColumn:"timestamp",valueColumn:"value",seriesColumn:"service",seriesColumns:[],aggregation:"sum",valueAxisScale:"linear"}});s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:"connected",generation:1,error:null,serverVersion:"17"}},metadataByProfileId:{[p.id]:{schemas:[],status:"loaded",error:null,isStale:false,revision:1}}})})()')
  const delta=await js('document.querySelector(".main").getBoundingClientRect().top+275-document.querySelector(".editor-resizer").getBoundingClientRect().top')
  if(Math.abs(delta)>1)await dragDivider(win,'.editor-resizer',0,Math.round(delta))
  await run('loading');await waitText('Running…')
  checks.push({label:'initial loading',text:await text(),result:(await tab()).result,empty:await js('document.querySelector("[data-result-empty]")?.textContent')})
  assert.equal((await tab()).result,null)
  assert.ok(releaseQuery);releaseQuery();releaseQuery=null
  await waitFor(win,'!window.__datakoalaStore.getState().tabs[0].running','loading completion');await ready()
  const initial=await chart();const revision=(await tab()).resultRevision
  assert.equal(initial.series.length,2);assert.deepEqual(initial.series.map(s=>s.name).sort(),['Alpha','Beta'])
  const alpha=initial.series.find(s=>s.name==='Alpha');assert.equal(alpha.data[2][1]??alpha.data[2],180)
  const pixels=await pixelCounts();assert.ok(pixels.orange>50&&pixels.cyan>50,'both series drawn')
  checks.push({label:'initial ready',revision,initial,pixels})
  await frame(screenshots[0],'Completed two-series line with known Alpha spike','[data-result-chart-canvas]')
  const localBefore=requests.length
  await combo('Value axis scale','Log');await ready();assert.notEqual((await chart()).fingerprint,initial.fingerprint)
  await combo('Value axis scale','Linear');await ready();noQuery(localBefore,'configuration-only axis changes')
  await click('Export PNG');await waitText('Chart exported')
  assert.equal(exports.length,1)
  const image=nativeImage.createFromBuffer(Buffer.from(exports[0].options.base64,'base64'))
  const dimensions=image.getSize();assert.ok(dimensions.width>0&&dimensions.height>0)
  assert.equal(exports[0].options.defaultName,'datakoala_chart.png');assert.deepEqual(exports[0].options.extensions,['png'])
  // Generated bytes retained verbatim, outside the screenshot manifest.
  await writeFile(resolve(outputDir,'cap28-export-image.bin'),Buffer.from(exports[0].options.base64,'base64'))
  const bitmap=image.toBitmap();let nonBackground=0
  for(let i=0;i<bitmap.length;i+=4)if(Math.abs(bitmap[i]-34)>20||Math.abs(bitmap[i+1]-25)>20||Math.abs(bitmap[i+2]-22)>20)nonBackground++
  assert.ok(nonBackground>500,'export must contain drawn content')
  checks.push({label:'export saved',revision,series:['Alpha','Beta'],dimensions,nonBackground,actualBytes:'cap28-export-image.bin',nativeSaveDialog:'synthetic IPC destination; no OS write',imageVisualInspection:'required after artifact retrieval'})
  await frame(screenshots[1],'Real export control feedback; generated PNG intercepted at save IPC','[data-result-chart]')
  exportMode='error';await click('Export PNG');await waitText('Could not export chart')
  checks.push({label:'export error',feedback:'Could not export chart'})
  exportMode='cancel';await click('Export PNG');await settle()
  checks.push({label:'export cancel',text:await text(),acceptance:'characterization; no new success required'})
  noQuery(localBefore,'export success/error/cancel')
  aiMode='normal';await click('Analyze with AI');await click('AI details (1)')
  await waitText('Alpha · X '+times[2]+' · Y 180');await ready()
  const request=aiRequests[0];assert.deepEqual(request.chart.series.map(s=>s.name).sort(),['Alpha','Beta'])
  assert.deepEqual(request.chart.series.find(s=>s.name==='Alpha').points[2],{x:times[2],y:180})
  const annotated=await chart();const overlay=annotated.series.find(s=>s.overlay)
  assert.equal(overlay.data.length,1);assert.equal(overlay.data[0].sourceSeriesName,'Alpha');assert.equal(overlay.data[0].originalIndex,2)
  assert.deepEqual(overlay.data[0].value,[Date.parse(times[2]),180]);assert.ok((await pixelCounts()).red>15,'actual red annotation ring drawn')
  assert.ok((await text()).includes('Isolated spike'));assert.ok((await text()).includes('high'))
  checks.push({label:'AI anomaly identity',revision,request,overlay,control:{series:'Beta',point:request.chart.series.find(s=>s.name==='Beta').points[2]},pixels:await pixelCounts()})
  await frame(screenshots[2],'Native AI details, exact Alpha 16:20/180 and red point marker','[role=dialog]')
  await click('AI details (1)');await click('AI details (1)');await waitText('Alpha · X '+times[2]+' · Y 180');await click('AI details (1)')
  await click('Show anomalies');await ready();assert.ok(!(await chart()).series.some(s=>s.overlay))
  await click('Show anomalies');await ready();assert.deepEqual((await chart()).series.find(s=>s.overlay).data,overlay.data)
  noQuery(localBefore,'AI details and marker toggles')
  aiMode='error';await click('Analyze with AI');await waitText('CAP-28 synthetic AI unavailable. Try Analyze with AI again.');await ready()
  assert.equal((await tab()).queryError,null);assert.deepEqual((await tab()).result.rows,fixture.rows)
  checks.push({label:'AI-only failure',alerts:await js('[...document.querySelectorAll("[role=alert]")].map(e=>e.textContent.trim())'),chart:await chart()})
  aiMode='delayed';await click('Analyze with AI');await waitText('Analyzing with AI…');assert.ok(releaseAi)
  const delayedId=aiRequests.at(-1).requestId
  await run('revised');await ready();const revision2=(await tab()).resultRevision
  assert.ok(revision2>revision);assert.deepEqual((await chart()).series.map(s=>s.name).sort(),['Alpha v2','Beta v2'])
  assert.ok(!(await text()).includes('AI details (1)'));assert.ok(!(await chart()).series.some(s=>s.overlay))
  releaseAi();releaseAi=null;await settle();await settle()
  assert.ok(!(await chart()).series.some(s=>s.overlay));assert.ok(!(await text()).includes('AI details (1)'))
  checks.push({label:'old AI response invalidated',oldRevision:revision,newRevision:revision2,requestId:delayedId,cancelled:cancellations.includes(delayedId),chart:await chart()})
  const viewBefore=requests.length
  await click('Bar','[aria-label="Result view"] button');await ready();assert.equal((await chart()).series[0].type,'bar')
  await click('Line','[aria-label="Result view"] button');await ready();noQuery(viewBefore,'view switching')
  await run('empty');await waitText('Query returned no rows.')
  assert.equal((await tab()).result.rows.length,0)
  assert.ok(await js('[...document.querySelectorAll("button")].find(e=>e.textContent.trim()==="Export PNG")?.disabled'))
  checks.push({label:'empty',text:await text(),chart:await chart()})
  await frame(screenshots[3],'Completed empty result, native no-rows message and disabled export','[data-result-empty]')
  await run('normal');await ready()
  await run('error');await waitText('CAP-28 synthetic SQL error: column missing_column does not exist')
  const failed=await tab();const failureChart=await chart()
  checks.push({label:'query failure',queryError:failed.queryError,revision:failed.resultRevision,rows:failed.result?.rows.length,stale:failed.isResultStale,chart:failureChart,alerts:await js('[...document.querySelectorAll("[role=alert]")].map(e=>e.textContent.trim())'),text:await text()})
  await frame(screenshots[4],'Native SQL failure after successful chart; retained-result behavior characterized','[data-result-explorer]')
  await run('revised');await ready();assert.equal((await tab()).queryError,null)
  assert.deepEqual((await tab()).result.rows,revised.rows)
  checks.push({label:'query recovery completed',revision:(await tab()).resultRevision,chart:await chart()})
  // Unsupported data shape via the controlled fixture seam: the UI automatically
  // reconciles invalid mappings, so do not invent a user-selectable invalid field.
  await js('(()=>{const s=window.__datakoalaStore,t=s.getState().tabs[0];s.setState({tabs:[{...t,result:{columns:[{name:"message",logicalType:"string",dataTypeName:"text",dataTypeID:25}],rows:[{message:"No numeric data"}],rowCount:1,durationMs:1},resultRevision:t.resultRevision+1}]})})()')
  await waitText('This result does not contain a numeric column that can be used as a Y axis.')
  checks.push({label:'unsupported nonnumeric shape',injected:true,text:await text(),exportDisabled:await js('[...document.querySelectorAll("button")].find(e=>e.textContent.trim()==="Export PNG")?.disabled')})
  await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({sourceHead:process.env.DATAKOALA_AUDIT_HEAD??'UNSPECIFIED',execution:'real Electron; synthetic IPC; initial session and final unsupported result state injection disclosed',fixture:{times,values,rows:fixture.rows,revision1:revision,revision2},requests,aiRequests,cancellations,exports:exports.map(e=>({mode:e.mode,defaultName:e.options.defaultName,extensions:e.options.extensions,bytes:Buffer.from(e.options.base64,'base64').length})),checks,observations},null,2)+'\n')
  console.log('CAP28_OK '+JSON.stringify({screenshots,providerCount:requests.length,aiCount:aiRequests.length}))
}
