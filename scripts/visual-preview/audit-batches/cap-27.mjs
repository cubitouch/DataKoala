/** CAP-27: real-renderer legend, point filter and temporal brush characterization. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'

export const screenshots = [
  'cap27-legend-default-desktop.png',
  'cap27-legend-hidden-desktop.png',
  'cap27-legend-isolated-desktop.png',
  'cap27-chart-filter-desktop.png',
]

const timestamps = Array.from({ length: 6 }, (_, index) =>
  new Date(Date.UTC(2026, 7, 19, 16, index * 10)).toISOString())
const values = {
  Alpha: [20, 28, 21, 34, 25, 38],
  Beta: [70, 82, 95, 76, 108, 90],
  Gamma: [142, 153, 137, 158, 146, 165],
}
const series = Object.keys(values)
const chartOrder = ['Gamma', 'Beta', 'Alpha'] // orderChartSeries sorts descending total
const rows = timestamps.flatMap((timestamp, index) =>
  series.map((service) => ({ timestamp, service, value: values[service][index] })))
const fixture = {
  columns: [
    { name: 'timestamp', dataTypeID: 1184, dataTypeName: 'timestamptz', logicalType: 'datetime' },
    { name: 'service', dataTypeID: 25, dataTypeName: 'text', logicalType: 'string' },
    { name: 'value', dataTypeID: 23, dataTypeName: 'int4', logicalType: 'number' },
  ],
  rows, rowCount: rows.length, durationMs: 7,
}
const palette = {
  Alpha: [239, 138, 98],
  Beta: [98, 184, 197],
  Gamma: [245, 207, 51],
}
const calls = []

export function installAuditIpc(ipc) {
  calls.length = 0
  installBaseIpc(ipc)
  const handle = (channel, handler) => { ipc.removeHandler(channel); ipc.handle(channel, handler) }
  handle('query:run', (_event, id, query, parameters, options) => {
    calls.push({ channel: 'query:run', id, query, parameters, options })
    return { ok: true, result: fixture }
  })
  handle('query:run-loki', (_event, id, request) => {
    calls.push({ channel: 'query:run-loki', id, request })
    throw Error('CAP-27 must not query Loki')
  })
}

export async function runVisualAudit({ win, outputDir, waitFor, capture, dragDivider }) {
  await mkdir(outputDir, { recursive: true })
  const observations = [], behavior = []
  const js = expression => win.webContents.executeJavaScript(expression)
  const settle = () => js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
  const tab = () => js('window.__datakoalaStore.getState().tabs[0]')
  const noQuery = (before, step) => {
    assert.equal(calls.length, before, step + ' must not send a provider request')
    return { before, after: calls.length, delta: 0 }
  }
  const render = () => waitFor(win,
    'document.querySelector("[data-result-chart-canvas]")?.getAttribute("data-visual-finished")==="true" && document.querySelector("[data-result-chart-canvas]")?.getAttribute("data-visual-fingerprint")===document.querySelector("[data-result-chart-canvas]")?.getAttribute("data-visual-expected-fingerprint")',
    'current finished chart')
  const click = async selector => {
    await waitFor(win, 'document.querySelector(' + data(selector) + ')', 'click ' + selector)
    await js('document.querySelector(' + data(selector) + ').click()')
    await settle()
  }
  const select = async (name) => {
    const selector = '[data-chart-legend] button[aria-pressed]'
    await waitFor(win,
      '[...document.querySelectorAll(' + data(selector) + ')].some(e=>e.textContent.trim()===' + data(name) + ')',
      'legend ' + name)
    await js('([...document.querySelectorAll(' + data(selector) + ')].find(e=>e.textContent.trim()===' + data(name) + ')).click()')
    await render()
  }
  const isolate = async name => {
    await click('button[aria-label=' + JSON.stringify('Isolate ' + name) + ']')
    await render()
  }
  const key = async code => {
    const electronKeyCode = code.startsWith('Arrow') ? code.slice(5) : code
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: electronKeyCode })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: electronKeyCode })
    await settle()
  }
  const chartState = () => js('(() => {const c=document.querySelector("[data-result-chart-canvas]"),p=c?.querySelector("[class*=plot]"),l=c?.querySelector("[data-chart-legend]"),d=c?.querySelector("[aria-label=\\"Resize chart legend\\"]"),box=e=>{const r=e?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null};return {type:c?.getAttribute("data-visual-type"),finished:c?.getAttribute("data-visual-finished"),series:Number(c?.getAttribute("data-visual-series")),items:Number(c?.getAttribute("data-visual-items")),configuration:c?.getAttribute("data-visual-config"),fingerprint:c?.getAttribute("data-visual-fingerprint"),expectedFingerprint:c?.getAttribute("data-visual-expected-fingerprint"),legendWidth:getComputedStyle(c).getPropertyValue("--chart-legend-width").trim(),canvas:box(c),plot:box(p),legend:box(l),divider:box(d),buttons:[...l.querySelectorAll("button[aria-pressed]")].map(e=>({label:e.textContent.trim(),visible:e.getAttribute("aria-pressed")})),chips:[...document.querySelectorAll("[data-result-filter-chip]")].map(e=>e.textContent.trim()),stats:document.querySelector("[data-result-chart] [class*=stats]")?.textContent?.trim(),canvasCount:p?.querySelectorAll("canvas").length??0}})()')
  // Scan only ECharts canvas pixels, not legend marker CSS. This asserts actual drawing.
  const pixels = () => js('(() => {const p=document.querySelector("[data-result-chart-canvas] [class*=plot]"),canvases=[...(p?.querySelectorAll("canvas")??[])];const targets=' + data(palette) + ';const columns={Alpha:[],Beta:[],Gamma:[]},counts={Alpha:0,Beta:0,Gamma:0};for(const canvas of canvases){if(canvas.width<200||canvas.height<100)continue;const ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx)continue;const pic=ctx.getImageData(0,0,canvas.width,canvas.height),arr=pic.data;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const n=(y*canvas.width+x)*4;if(arr[n+3]<210)continue;for(const [name,rgb] of Object.entries(targets)){if(Math.abs(arr[n]-rgb[0])<=18&&Math.abs(arr[n+1]-rgb[1])<=18&&Math.abs(arr[n+2]-rgb[2])<=18){counts[name]++;if(name==="Beta")columns.Beta.push([x,y]);break}}}}return {counts,betaPixels:columns.Beta,plotRect:(()=>{const r=p.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()}})()')
  const checkDrawing = async (visible, label) => {
    await render(); await settle()
    const scene = await pixels()
    for (const name of series) {
      if (visible.includes(name))
        assert.ok(scene.counts[name] >= 12, label + ': ' + name + ' has no independently colored plotted pixels: ' + JSON.stringify(scene.counts))
      else
        assert.ok(scene.counts[name] < 12, label + ': hidden ' + name + ' still has plotted pixels: ' + JSON.stringify(scene.counts))
    }
    return scene.counts
  }
  const save = async (filename, description, extra = {}) => {
    await render(); await settle()
    const state = await chartState()
    const viewport = await js('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})')
    assert.deepEqual(viewport, { width: 1440, height: 900, dpr: 1 })
    const zoom = win.webContents.getZoomFactor()
    assert.equal(zoom, 1)
    assert.ok(state.canvas?.width > 0 && state.canvas?.height > 0)
    assert.equal(state.type, 'line')
    assert.equal(state.finished, 'true')
    observations.push({ filename, description, target: state.canvas, dpr: 1, zoom, viewport, state, providerRequests: calls.length, ...extra })
    await capture(win, filename)
  }
  const move = (x, y) => win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y) })
  const press = (type, x, y) => win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 })
  const drag = async (a, b, y) => {
    move(a, y); press('mouseDown', a, y)
    for (let i = 1; i <= 12; i++) { move(a + (b - a) * i / 12, y); await settle() }
    press('mouseUp', b, y); await settle()
  }
  win.show(); win.focus(); win.setContentSize(1440, 900); win.webContents.setZoomFactor(1)
  await js('(() => {const s=window.__datakoalaStore,t=JSON.parse(JSON.stringify(s.getState().tabs[0])),p=' + data(auditProfiles.postgres) + ',r=' + data(fixture) + ';t.id="cap27";t.title="CAP-27";t.connectionProfileId=p.id;t.queryMode="sql";t.sql="select timestamp, service, value from synthetic_cap27";t.result=r;t.pendingResult=null;t.resultRevision=1;t.lastSuccessfulResultRevision=1;t.isResultStale=false;t.queryError=null;t.running=false;t.sqlResultFilters=[];t.builderResultFilters=[];t.seriesVisibility={};t.sqlVisualization={...t.sqlVisualization,view:"line",xColumn:"timestamp",valueColumn:"value",seriesColumn:"service",seriesColumns:[],aggregation:"sum",valueAxisScale:"linear"};s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:"connected",generation:1,error:null,serverVersion:"17"}},metadataByProfileId:{[p.id]:{schemas:[],status:"loaded",error:null,isStale:false}}})})()')
  const sidebarDelta = await js('240-document.querySelector("[aria-label=\\"Resize sidebar\\"]").getBoundingClientRect().left')
  if(Math.abs(sidebarDelta)>1) await dragDivider(win,'[aria-label="Resize sidebar"]',Math.round(sidebarDelta),0)
  const editorDelta = await js('document.querySelector(".main").getBoundingClientRect().top+300-document.querySelector(".editor-resizer").getBoundingClientRect().top')
  if(Math.abs(editorDelta)>1) await dragDivider(win,'.editor-resizer',0,Math.round(editorDelta))
  await render()
  const initial = await chartState()
  assert.equal(initial.series,3)
  assert.deepEqual(initial.buttons.map(x=>x.label),chartOrder)
  assert.deepEqual(initial.buttons.map(x=>x.visible),['true','true','true'])
  assert.equal((await tab()).result.rows.length,18)
  const defaultPixels = await checkDrawing(series,'default')
  assert.equal(calls.length,0)
  await save(screenshots[0],'Six fixed UTC timestamps; three named plotted series and real HTML legend',{pixels:defaultPixels})
  behavior.push({scenario:'default',actualSeries:initial.buttons.map(x=>x.label),points:18,provider:noQuery(0,'default')})

  const beforeHide = calls.length
  await select('Beta')
  await waitFor(win,'document.querySelector("[data-chart-legend] button[aria-pressed=false]")','hidden Beta')
  assert.deepEqual((await chartState()).buttons.map(x=>x.visible),['true','false','true'])
  const hiddenPixels = await checkDrawing(['Alpha','Gamma'],'hidden')
  behavior.push({scenario:'hide',series:'Beta',pixelCounts:hiddenPixels,provider:noQuery(beforeHide,'hide')})
  await save(screenshots[1],'Beta hidden by actual legend toggle; other canvas series remain',{pixels:hiddenPixels})
  await select('Beta')
  assert.deepEqual((await chartState()).buttons.map(x=>x.visible),['true','true','true'])
  await checkDrawing(series,'restored')

  const beforeIsolate = calls.length
  await select('Gamma')
  await isolate('Beta')
  assert.deepEqual((await chartState()).buttons.map(x=>x.visible),['false','true','false'])
  const isolatedPixels = await checkDrawing(['Beta'],'isolation')
  await save(screenshots[2],'Beta isolated after Gamma hidden; unique visible curve',{pixels:isolatedPixels})
  await isolate('Beta')
  assert.deepEqual((await chartState()).buttons.map(x=>x.visible),['true','true','true'])
  await checkDrawing(series,'isolation restored')
  await isolate('Alpha'); await isolate('Alpha')
  assert.deepEqual((await chartState()).buttons.map(x=>x.visible),['true','true','true'])
  behavior.push({scenario:'isolation',preHidden:'Gamma',isolated:'Beta',repeatRestoresAll:true,drawn:isolatedPixels,provider:noQuery(beforeIsolate,'isolation')})

  const beforeResize = calls.length
  const start = await chartState()
  assert.ok(start.divider?.width>0 && start.legend?.width>0)
  console.log('CAP27_RESIZE before '+JSON.stringify({legend:start.legend,plot:start.plot,divider:start.divider}))
  await js('document.querySelector(' + data('[aria-label="Resize chart legend"]') + ').focus()')
  assert.equal(await js('document.activeElement?.getAttribute("aria-label")'),'Resize chart legend')
  await key('ArrowLeft')
  console.log('CAP27_RESIZE ArrowLeft dispatched')
  await render()
  const wide = await chartState()
  console.log('CAP27_RESIZE wide '+JSON.stringify({legend:wide.legend,plot:wide.plot,divider:wide.divider}))
  assert.ok(wide.legend.width>=start.legend.width+20,'keyboard ArrowLeft expands right legend')
  assert.ok(wide.plot.width<start.plot.width,'plot reacts to legend expansion')
  await key('ArrowRight')
  await render()
  const restored = await chartState()
  assert.ok(Math.abs(restored.legend.width-start.legend.width)<3,'legend keyboard restore')
  assert.deepEqual(restored.buttons,start.buttons)
  await checkDrawing(series,'resized-restored')
  behavior.push({scenario:'legend-keyboard-resize',control:'actual focused separator ArrowLeft then ArrowRight',before:start,expanded:wide,restored,provider:noQuery(beforeResize,'resize'),pointer:'UV (not exercised)'})

  // Use actual ECharts curve pixels to locate a rendered Beta point. Never invoke
  // React callbacks or mutate filters directly after the initial fixture setup.
  const beforePoint = calls.length
  const scene = await pixels()
  const beta = scene.betaPixels
  assert.ok(beta.length>=24,'Beta line/symbol pixels available for native hit testing')
  const histogram = new Map()
  for(const [x,y] of beta) histogram.set(x,(histogram.get(x)??[]).concat(y))
  const xs = [...histogram.entries()].filter(([,ys])=>ys.length>=4)
    .sort((a,b)=>a[0]-b[0])
  const clusters = []
  for(const [x,ys] of xs){
    if(!clusters.length||x-clusters.at(-1).last>14)clusters.push({first:x,last:x,candidates:[[x,ys]]})
    else{clusters.at(-1).last=x;clusters.at(-1).candidates.push([x,ys])}
  }
  assert.ok(clusters.length>=6,'six discrete Beta ECharts symbols must be detectable: '+clusters.length)
  const third = clusters[2].candidates.sort((a,b)=>b[1].length-a[1].length)[0]
  const x = scene.plotRect.x + third[0]
  const ys = third[1].slice().sort((a,b)=>a-b)
  const y = scene.plotRect.y + ys[Math.floor(ys.length/2)]
  move(x,y); press('mouseDown',x,y); press('mouseUp',x,y)
  await waitFor(win,'document.querySelector("[role=menu][aria-label=\\"Filter from chart point\\"]")','point filter menu')
  await click('[role=menu] [role=menuitem]:last-child')
  await waitFor(win,'document.querySelectorAll("[data-result-filter-chip]").length===2','series and timestamp filter chips')
  const active = (await tab()).sqlResultFilters
  assert.deepEqual(active.map(f=>({column:f.column,operator:f.operator,value:f.value,execution:f.execution??'client'})),[
    {column:'service',operator:'equals',value:'Beta',execution:'client'},
    {column:'timestamp',operator:'equals',value:timestamps[2],execution:'client'},
  ])
  assert.equal((await tab()).result.rows.length,18,'original rows retained')
  assert.ok((await chartState()).stats.includes('1 of 18 rows'),'actual view narrowed to one source row')
  behavior.push({scenario:'point-filter',selection:{series:'Beta',timestamp:timestamps[2],value:values.Beta[2],pixel:{x,y}},filters:active,provider:noQuery(beforePoint,'point/filter')})
  await save(screenshots[3],'Actual Beta 16:20 point selected; one source row and two local chips')
  for(const filter of active) await click('[data-result-filter-chip] button[aria-label^="Remove filter"]')
  await waitFor(win,'document.querySelectorAll("[data-result-filter-chip]").length===0','filters cleared via chip controls')
  assert.equal((await tab()).result.rows.length,18)
  assert.ok((await chartState()).stats.startsWith('18 rows'))
  noQuery(beforePoint,'point/filter clear')

  const beforeBrush = calls.length
  const current = await chartState()
  // Real ECharts lineX brush: drag through the central chart band between known time samples.
  const marginL=50,marginR=24
  const plotWidth=current.plot.width-marginL-marginR
  const a=current.plot.x+marginL+plotWidth*0.22
  const b=current.plot.x+marginL+plotWidth*0.65
  await drag(a,b,current.plot.y+Math.min(70,current.plot.height*0.25))
  await waitFor(win,'window.__datakoalaStore.getState().tabs[0].sqlResultFilters.some(f=>f.operator==="range")','native brush range')
  const range = (await tab()).sqlResultFilters.find(f=>f.operator==='range')
  assert.equal(range.column,'timestamp')
  assert.equal(range.execution??'client','client')
  assert.ok(Date.parse(range.startInclusive)>=Date.parse(timestamps[0]))
  assert.ok(Date.parse(range.endExclusive)<=Date.parse(timestamps[5]))
  assert.ok(Date.parse(range.startInclusive)<Date.parse(range.endExclusive))
  const filteredStats=(await chartState()).stats
  assert.match(filteredStats,/ of 18 rows/)
  assert.equal((await tab()).result.rows.length,18)
  noQuery(beforeBrush,'local brush')
  await click('[data-result-filter-chip] button[aria-label^="Remove filter"]')
  await waitFor(win,'document.querySelectorAll("[data-result-filter-chip]").length===0','brush reset')
  assert.ok((await chartState()).stats.startsWith('18 rows'))
  behavior.push({scenario:'native-brush',inputPixels:{a,b,y:current.plot.y+Math.min(70,current.plot.height*0.25)},range,afterFilter:filteredStats,resetRestores18:true,provider:noQuery(beforeBrush,'brush/reset')})

  assert.equal(calls.length,0,'entire batch presentation-only; zero synthetic provider requests')
  const report = { sourceHead:process.env.DATAKOALA_AUDIT_HEAD??'UNSPECIFIED',
    execution:'real Electron renderer; isolated synthetic PostgreSQL result and IPC interception',
    fixture:{timestamps,values,series,rows:rows.length,target:{series:'Beta',timestamp:timestamps[2],value:values.Beta[2]}},
    providerRequests:calls,providerRequestCount:calls.length,behavior,observations }
  await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify(report,null,2)+'\n')
  console.log('CAP27_OK '+JSON.stringify({sourceHead:report.sourceHead,screenshots:observations.map(x=>x.filename),providerRequestCount:calls.length}))
}
