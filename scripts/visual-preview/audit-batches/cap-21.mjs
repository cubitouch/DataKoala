/** CAP-21: Loki volume/view audit. Synthetic IPC, real Electron renderer, no production changes. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditProfiles, auditRange, auditLogResult } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'

export const screenshots = [
  'cap21-views-loki-default-desktop.png',
  'cap21-views-loki-changed-desktop.png',
  'cap21-loki-raw-desktop.png',
  'cap21-views-loki-empty-or-error-desktop.png',
]
const FROM = '2026-08-19T16:00:00.000Z'
const TO = '2026-08-19T17:00:00.000Z'
const STEP = '30s'
const EXPRESSION = '{service_name="example-service"}'
const TIMES = [0, 20, 40, 60].map(minutes => new Date(Date.parse(FROM) + minutes * 60000).toISOString())
const COLUMNS = [
  { name: 'timestamp', dataTypeID: 0, dataTypeName: 'timestamp', logicalType: 'timestamp' },
  { name: 'value', dataTypeID: 0, dataTypeName: 'float8', logicalType: 'number' },
  { name: 'service_name', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
]
const metric = rows => ({
  resultKind: 'metrics', columns: COLUMNS, rows, rowCount: rows.length,
  durationMs: 7, execution: { provider: 'loki', durationMs: 7, rowCount: rows.length },
})
const series = [
  ...TIMES.map((timestamp, i) => ({ timestamp, value: [2, 7, 3, 5][i], service_name: 'checkout' })),
  ...TIMES.map((timestamp, i) => ({ timestamp, value: [1, 2, 4, 1][i], service_name: 'worker' })),
]
const volume = metric(series)
const staleVolume = metric(series.slice(0, 4))
const emptyVolume = metric([])
const probe = metric([{ timestamp: TIMES[0], value: 2, service_name: 'probe' }])
const sourceRow = auditLogResult.logRows[0]
const logRows = [5, 15, 25, 35, 55].map((minute, i) => {
  const timestampMs = Date.parse(FROM) + minute * 60000
  return { ...sourceRow, id: 'cap21-log-' + i,
    timestampMs, timestampNs: String(BigInt(timestampMs) * 1000000n),
    line: 'CAP-21 synthetic event ' + (i + 1), severity: i % 2 ? 'WARN' : 'INFO',
    labels: { service_name: 'example-service', environment: 'audit' } }
})
const logs = { ...auditLogResult, rows: logRows, logRows, rowCount: logRows.length,
  execution: { provider: 'loki', durationMs: 7, rowCount: logRows.length } }
const requests = []
const deferred = []
let holdTrend = false
let holdPrimary = false
let rejectTrend = false
let rejectPrimary = false
let metricReply = volume
let logReply = logs

export function installAuditIpc(ipc) {
  installBaseIpc(ipc)
  requests.length = 0; deferred.length = 0
  holdTrend = false; holdPrimary = false
  rejectTrend = false; rejectPrimary = false
  metricReply = volume; logReply = logs
  const handle = (channel, fn) => { ipc.removeHandler(channel); ipc.handle(channel, fn) }
  handle('connections:loki:labels', () => ['service_name', 'environment'])
  handle('connections:loki:label-values', (_event, _id, label) => label === 'service_name' ? ['example-service', 'checkout', 'worker'] : ['audit'])
  handle('query:run-loki', (_event, id, request) => {
    const kind = request.expression.startsWith('count(sum by') ? 'probe'
      : request.expression.includes('count_over_time') ? 'trend' : 'primary'
    const entry = { sequence: requests.length + 1, kind, id, ...request }
    requests.push(entry)
    if (kind === 'probe') return probe
    if (kind === 'trend' && rejectTrend) {
      rejectTrend = false
      throw Error('Synthetic CAP-21 volume unavailable')
    }
    if (kind === 'primary' && rejectPrimary) {
      rejectPrimary = false
      throw Error('Synthetic CAP-21 primary unavailable')
    }
    if ((kind === 'trend' && holdTrend) || (kind === 'primary' && holdPrimary)) {
      return new Promise((resolvePromise, rejectPromise) => {
        deferred.push({ sequence: entry.sequence, kind, resolve: resolvePromise, reject: rejectPromise })
      })
    }
    return kind === 'trend' ? metricReply : logReply
  })
}

export async function runVisualAudit({ win, outputDir, waitFor, capture, dragDivider }) {
  await mkdir(outputDir, { recursive: true })
  const observations = [], interactions = []
  const evaluate = code => win.webContents.executeJavaScript(code)
  const settle = () => evaluate('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))')
  const state = () => evaluate('window.__datakoalaStore.getState().tabs.find(t => t.id === "cap21")')
  const count = kind => requests.filter(r => r.kind === kind).length
  const button = async label => {
    const selector = '[...document.querySelectorAll("button")].find(b => !b.disabled && (b.getAttribute("aria-label") === ' + data(label) + ' || b.textContent.trim() === ' + data(label) + '))'
    await waitFor(win, selector, label + ' control')
    await evaluate('(' + selector + ').click()')
    await settle()
  }
  const view = async name => {
    await button(name)
    await waitFor(win, '[...document.querySelectorAll("[aria-label=\\"Result view\\"] button")].some(b => b.getAttribute("aria-pressed") === "true" && b.getAttribute("aria-label") === ' + data(name) + ')', name + ' selected')
  }
  const snapshot = () => evaluate('(() => {const t=window.__datakoalaStore.getState().tabs.find(t=>t.id==="cap21");const c=document.querySelector("[data-result-chart-canvas][data-visual-type]");const result=document.querySelector("[aria-label=\\"Loki query results\\"]");const editor=document.querySelector("[aria-label=\\"LogQL editor\\"]");return {view:t.lokiResultView, mode:t.queryMode, running:t.running, queryError:t.queryError, resultKind:t.result?.resultKind, resultRows:t.result?.logRows?.length ?? t.result?.rows?.length ?? null, chart:c?{type:c.getAttribute("data-visual-type"),finished:c.getAttribute("data-visual-finished"),series:Number(c.getAttribute("data-visual-series")),items:Number(c.getAttribute("data-visual-items")),fingerprint:c.getAttribute("data-visual-fingerprint"),expectedFingerprint:c.getAttribute("data-visual-expected-fingerprint"),config:JSON.parse(c.getAttribute("data-visual-config")||"null"),canvas:Boolean(c.querySelector("canvas")),bounds:(()=>{const r=c.getBoundingClientRect();return {width:r.width,height:r.height}})()}:null,resultsText:result?.textContent?.slice(0,350),rawValue:t.sql,editorBounds:editor?(()=>{const r=editor.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})():null,queryPanel:document.querySelector("[aria-label=\\"Loki explorer\\"]")?.getBoundingClientRect().toJSON(),overflow:document.documentElement.scrollWidth>innerWidth+1}})()')
  const expectChart = async (name, items = 8) => {
    const key = name.toLowerCase()
    await waitFor(win, 'document.querySelector("[data-visual-type=' + key + '][data-visual-finished=true]")?.querySelector("canvas")', 'finished ' + name + ' chart')
    const s = await snapshot()
    assert.equal(s.chart.type, key)
    assert.equal(s.chart.finished, 'true')
    assert.equal(s.chart.fingerprint, s.chart.expectedFingerprint, 'stale chart revision')
    assert.equal(s.chart.series, 2, 'both series should be retained')
    assert.equal(s.chart.items, items, 'all nonuniform fixture points should be represented')
    assert.ok(s.chart.canvas && s.chart.bounds.width > 0 && s.chart.bounds.height > 0)
    assert.equal(s.overflow, false)
    return s
  }
  const save = async (filename, description, targetSelector) => {
    await settle()
    const dimensions = await evaluate('(() => {const e=document.querySelector(' + data(targetSelector) + ');const r=e?.getBoundingClientRect();return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,target:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,documentOverflow:document.documentElement.scrollWidth>innerWidth+1}})()')
    assert.deepEqual([dimensions.width,dimensions.height,dimensions.dpr],[1440,900,1])
    dimensions.zoom = win.webContents.getZoomFactor()
    assert.equal(dimensions.zoom,1)
    assert.ok(dimensions.target?.width > 0 && dimensions.target?.height > 0)
    assert.equal(dimensions.documentOverflow,false)
    observations.push({filename,description,...dimensions,semantic:await snapshot(),requests:requests.length})
    await capture(win,filename)
  }
  const assertBounds = list => {
    for(const r of list) {
      assert.equal(r.id,'audit-loki')
      assert.equal(r.start,FROM)
      assert.equal(r.end,TO)
      assert.equal(r.step,STEP)
      if(r.kind==='primary') { assert.equal(r.expression,EXPRESSION); assert.equal(r.limit,2000) }
      if(r.kind==='trend') {
        assert.equal(r.expression,'sum by (service_name) (count_over_time(('+EXPRESSION+')['+STEP+']))')
      }
      if(r.kind==='probe') assert.equal(r.limit,1)
    }
  }

  win.show(); win.focus(); win.setContentSize(1440,900); win.webContents.setZoomFactor(1)
  const profile = {...auditProfiles.loki,grafana:{baseUrl:'https://grafana.example.test/',datasourceUid:'loki-audit',datasourceType:'loki',orgId:7}}
  await evaluate('(() => {const s=window.__datakoalaStore, t=JSON.parse(JSON.stringify(s.getState().tabs[0])), p=' + data(profile) + ';t.id="cap21";t.title="CAP-21";t.connectionProfileId=p.id;t.queryMode="builder";t.sql=\'{service_name="raw-draft"}\';t.result=null;t.queryError=null;t.running=false;t.lokiResultView="list";t.lokiGroupBy=["service_name"];t.lokiTimeRange=' + data(auditRange) + ';t.lokiResultLimit=2000;t.lokiBuilder={labelMatchers:[{label:"service_name",operator:"=",value:"example-service"}],lineFilters:[],parsers:[],fieldFilters:[]};s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:"connected",generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:"loaded",error:null,isStale:false}}})})()')
  await waitFor(win,'document.querySelector("[data-loki-builder]")','loaded Loki Builder')
  const sidebarDelta = await evaluate('240-document.querySelector("[aria-label=\\"Resize sidebar\\"]").getBoundingClientRect().left')
  if(Math.abs(sidebarDelta)>1) await dragDivider(win,'[aria-label="Resize sidebar"]',Math.round(sidebarDelta),0)
  const editorDelta = await evaluate('document.querySelector(".main").getBoundingClientRect().top+315-document.querySelector(".editor-resizer").getBoundingClientRect().top')
  if(Math.abs(editorDelta)>1) await dragDivider(win,'.editor-resizer',0,Math.round(editorDelta))

  await button('Run')
  await waitFor(win,'window.__datakoalaStore.getState().tabs[0].result?.logRows?.length === 5 && !window.__datakoalaStore.getState().tabs[0].running','primary result settled')
  assert.equal(count('primary'),1)
  assert.equal(count('probe'),0)
  assert.equal(count('trend'),0)
  await view('Table')
  await waitFor(win,'document.querySelector("[data-result-explorer]")','generic raw-log Table')
  assert.equal(count('primary'),1); assert.equal(count('trend'),0)
  interactions.push({scenario:'List and Table without synthetic volume',primary:1,probes:0,trends:0,tableRendered:true})
  await view('Line')
  await expectChart('Line')
  assert.deepEqual([count('primary'),count('probe'),count('trend')],[1,1,1])
  assertBounds(requests)
  const chartInitial = await snapshot()
  assert.equal(chartInitial.chart.config.x,'timestamp')
  assert.equal(chartInitial.chart.config.y,'value')
  interactions.push({scenario:'optional trend triggered only on Chart',queries:requests.slice(),totalVolume:series.reduce((n,row)=>n+row.value,0),fixtureTimes:TIMES,fixtureSeries:{checkout:[2,7,3,5],worker:[1,2,4,1]},chart:chartInitial.chart})
  await save(screenshots[0],'Line trend after explicit logs Run; 2 series, 8 nonuniform points, 1-hour UTC domain','[data-result-chart-canvas][data-visual-type="line"]')

  for (const name of ['Area','Bar']) {await view(name);await expectChart(name)}
  assert.deepEqual([count('primary'),count('probe'),count('trend')],[1,1,1],'presentation changes must not dispatch')
  const changed = await snapshot()
  interactions.push({scenario:'Line-Area-Bar without provider re-execution',views:['line','area','bar'],chart:changed.chart,queries:requests.length})
  await save(screenshots[1],'Bar view from same bounded volume fixture, no new provider query','[data-result-chart-canvas][data-visual-type="bar"]')
  await view('Line')
  await expectChart('Line')
  await view('Table')
  await view('Line')
  await expectChart('Line')
  assert.equal(count('trend'),1,'return from Table should reuse settled trend')
  interactions.push({scenario:'Table-Line return retains cached optional trend',additionalQueries:0})

  // Verify Grafana handoff using a synthetic clipboard, never navigate to a server.
  await evaluate('(() => {window.__cap21Copied=[];Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>window.__cap21Copied.push(text)}})})()')
  await button('Grafana')
  await button('Copy Grafana link')
  await waitFor(win,'window.__cap21Copied.length===1','copied Grafana link')
  const copied = await evaluate('window.__cap21Copied[0]')
  const grafana = new URL(copied)
  const pane = JSON.parse(grafana.searchParams.get('panes')).datakoala
  const expectedFrom = String(Date.parse(FROM)), expectedTo = String(Date.parse(TO))
  assert.equal(grafana.origin,'https://grafana.example.test')
  assert.equal(grafana.pathname,'/explore')
  assert.equal(grafana.searchParams.get('orgId'),'7')
  assert.equal(pane.range.from,expectedFrom)
  assert.equal(pane.range.to,expectedTo)
  assert.equal(pane.queries[0].expr,EXPRESSION)
  assert.equal(pane.queries[0].queryType,'range')
  interactions.push({scenario:'Grafana UI copy',expectedFrom,expectedTo,actualFrom:pane.range.from,actualTo:pane.range.to,expr:pane.queries[0].expr,queryType:pane.queries[0].queryType,absolute:true,url:copied,noExternalNavigation:true})

  // Raw LogQL handoff and real CodeMirror editing; a chart selection is presentation only.
  await button('LogQL')
  await waitFor(win,'document.querySelector("[aria-label=\\"LogQL editor\\"] .cm-content")','raw editor')
  const rawBefore = (await state()).sql
  await evaluate('document.querySelector("[aria-label=\\"LogQL editor\\"] .cm-content").focus()')
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'a',modifiers:['control']})
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'a',modifiers:['control']})
  await win.webContents.insertText('{service_name="cap21-raw"} |= "needle"')
  await waitFor(win,'window.__datakoalaStore.getState().tabs[0].sql.includes("cap21-raw")','native raw draft')
  const raw = (await state()).sql
  const beforeRawViews = requests.length
  await view('Area')
  await view('Table')
  assert.equal((await state()).sql,raw)
  const rawViewRequests = requests.slice(beforeRawViews)
  assert.ok(rawViewRequests.every(request => request.kind !== 'primary'), 'view switch must not run primary LogQL')
  const rawLayout = await snapshot()
  assert.ok(rawLayout.editorBounds && rawLayout.editorBounds.width > 0, 'raw editing surface should have a measurable width')
  const rawLayoutIssue = rawLayout.editorBounds.width <= 500 || rawLayout.editorBounds.height <= 50
  interactions.push({scenario:'raw editor',rawBefore,rawAfter:raw,layout:rawLayout.editorBounds,rawLayoutIssue,viewChangeQueryDelta:rawViewRequests.length,viewChangeQueries:rawViewRequests,primaryReexecutions:0,unsentDraftMayTriggerOptionalTrend:true})
  await save(screenshots[2],'Native-edited raw LogQL preserved through chart and Table; optional trend requests recorded','[aria-label="LogQL editor"]')

  // Restore original builder expression before lifecycle experiments.
  await button('Builder')
  await view('Line')
  await expectChart('Line')
  const beforePending = count('trend')
  holdTrend = true
  await button('Run')
  await waitFor(win,'document.body.innerText.includes("Loading log volume…") && !window.__datakoalaStore.getState().tabs[0].running','logs before pending optional trend')
  await waitFor(win,'Boolean('+ 'true' +')','pending queue recorded')
  assert.equal(deferred.filter(item=>item.kind==='trend').length,1)
  const pendingOne = deferred.shift()
  assert.equal(count('trend'),beforePending+1)
  assert.equal((await state()).result.logRows.length,5)
  await view('Table')
  assert.equal((await state()).result.logRows.length,5)
  holdTrend = false
  pendingOne.resolve(volume)
  await settle()
  await view('Line')
  await expectChart('Line')
  interactions.push({scenario:'primary before optional trend; pending switch to Table',pendingSequence:pendingOne.sequence,primaryVisibleBeforeTrend:true,retainedLogs:5,queriesAfterReturn:requests.length})

  // A previous pending optional response may never replace the newer chart revision.
  holdTrend = true
  await button('Run')
  await waitFor(win,'document.body.innerText.includes("Loading log volume…")','older trend pending')
  const older = deferred.shift()
  assert.ok(older && older.kind==='trend')
  await button('Run')
  await waitFor(win,'document.body.innerText.includes("Loading log volume…")','newer trend pending')
  const newer = deferred.shift()
  assert.ok(newer && newer.kind==='trend' && newer.sequence > older.sequence)
  holdTrend = false
  newer.resolve(volume)
  await expectChart('Line')
  older.resolve(staleVolume)
  await settle()
  const afterStale = await snapshot()
  assert.equal(afterStale.chart.items,8,'late earlier trend should not overwrite latest')
  interactions.push({scenario:'latest-wins stale optional completion',older:older.sequence,newer:newer.sequence,finalChartItems:afterStale.chart.items,finalTrendWasLatest:true})

  // Synthetic trend failure keeps the successfully completed primary logs, with distinct feedback.
  rejectTrend = true
  await button('Run')
  await waitFor(win,'document.body.innerText.includes("Log volume unavailable: Log volume query failed: Synthetic CAP-21 volume unavailable")','optional error')
  const errorView = await snapshot()
  assert.equal(errorView.queryError,null)
  assert.equal(errorView.resultRows,5)
  assert.equal(errorView.view,'line')
  await save(screenshots[3],'Optional trend error, successful five-log primary preserved','[aria-label="Loki query results"]')
  interactions.push({scenario:'optional volume error',primaryError:errorView.queryError,rows:errorView.resultRows,visibleVolumeError:true})
  await view('List')
  await waitFor(win,'document.querySelector("[aria-label=\\"Log results\\"]")','usable log list after optional failure')
  metricReply = emptyVolume
  await view('Line')
  await waitFor(win,'!document.body.innerText.includes("Log volume unavailable:")','empty volume distinct from previous error')
  assert.equal((await state()).result.logRows.length,5)
  interactions.push({scenario:'empty optional volume',primaryRows:5,volumeRows:0,errorIsNotPrimary:true,visual:await snapshot()})
  await view('List')
  rejectPrimary = true
  await button('Run')
  await waitFor(win,'window.__datakoalaStore.getState().tabs[0].queryError?.includes("Synthetic CAP-21 primary unavailable")','distinct primary failure')
  const primaryFailure = await snapshot()
  assert.ok(primaryFailure.queryError.includes('Synthetic CAP-21 primary unavailable'))
  interactions.push({scenario:'primary failure',state:primaryFailure})

  // Remount only after the evidence captures: the durable result/view must survive tab switches.
  rejectPrimary = false
  logReply = logs
  await button('Run')
  await waitFor(win,'!window.__datakoalaStore.getState().tabs[0].running && window.__datakoalaStore.getState().tabs[0].result?.logRows?.length===5','primary recovery')
  const mainCallsBeforeRemount = count('primary')
  await evaluate('(() => {const s=window.__datakoalaStore,old=s.getState().tabs.find(t=>t.id==="cap21"),other={...old,id:"cap21-other",title:"Other tab",result:null,resultRevision:0,lokiResultView:"list",running:false};s.setState({tabs:[old,other],activeTabId:other.id})})()')
  await waitFor(win,'window.__datakoalaStore.getState().activeTabId==="cap21-other"','other tab remounted')
  await evaluate('window.__datakoalaStore.setState({activeTabId:"cap21"})')
  await waitFor(win,'document.querySelector("[aria-label=\\"Loki explorer\\"]") && window.__datakoalaStore.getState().activeTabId==="cap21"','original tab remount')
  assert.equal((await state()).result.logRows.length,5)
  assert.equal((await state()).lokiResultView,'list')
  assert.equal(count('primary'),mainCallsBeforeRemount,'remount must not rerun primary')
  interactions.push({scenario:'renderer remount',primaryReexecutions:0,durableRows:5,durableView:'list',optionalTrendLocal:true})


  // Characterize the actual Table text-search and CSV copy contract.
  await view('Table')
  await waitFor(win,'document.querySelector("[data-result-table-pane] input[placeholder=\\"filter rows…\\"]")','table row search')
  const tableCalls = requests.length
  await evaluate('(() => {const e=document.querySelector("[data-result-table-pane] input[placeholder=\\"filter rows…\\"]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,"synthetic event 3");e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}))})()')
  await waitFor(win,'document.querySelector("[data-result-toolbar]")?.textContent?.includes("1 of 5")','filtered Table row count')
  await button('Copy CSV')
  await waitFor(win,'window.__cap21Copied.length >= 2','Table CSV clipboard')
  const filteredCsv = await evaluate('window.__cap21Copied.at(-1)')
  assert.ok(filteredCsv.includes('CAP-21 synthetic event 3'), 'CSV must include the filtered row')
  assert.ok(!filteredCsv.includes('CAP-21 synthetic event 1'), 'CSV must exclude unrelated rows')
  assert.equal(requests.length,tableCalls,'local filtering/copy must not rerun Loki')
  interactions.push({scenario:'Table filtered Copy CSV',filter:'synthetic event 3',visibleRows:1,totalRows:5,clipboardText:filteredCsv,providerQueryDelta:0,exportCsvUiPresent:await evaluate('Boolean([...document.querySelectorAll("[data-result-toolbar] button")].find(b=>b.textContent.trim()==="Export CSV"))')})
  await evaluate('(() => {const e=document.querySelector("[data-result-table-pane] input[placeholder=\\"filter rows…\\"]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,"");e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}))})()')
  await waitFor(win,'document.querySelector("[data-result-toolbar]")?.textContent?.includes("5 rows")','Table unfiltered')

  // Shared legend toggling and keyboard resize, with all cached volume points retained.
  await view('Line')
  await expectChart('Line')
  await waitFor(win,'document.querySelectorAll("[data-chart-legend] button[aria-pressed]").length === 2','two legend toggles')
  const legendBefore = await evaluate('[...document.querySelectorAll("[data-chart-legend] button[aria-pressed]")].map(b=>({label:b.textContent.trim(),pressed:b.getAttribute("aria-pressed")}))')
  assert.ok(legendBefore.every(v=>v.pressed === 'true'))
  const callsBeforeLegend = requests.length
  await evaluate('document.querySelector("[data-chart-legend] button[aria-pressed]").click()')
  await waitFor(win,'document.querySelector("[data-chart-legend] button[aria-pressed]")?.getAttribute("aria-pressed")==="false"','legend toggled off')
  await evaluate('document.querySelector("[data-chart-legend] button[aria-pressed]").click()')
  await waitFor(win,'document.querySelector("[data-chart-legend] button[aria-pressed]")?.getAttribute("aria-pressed")==="true"','legend toggled back on')
  const widthBefore = Number(await evaluate('document.querySelector("[aria-label=\\"Resize chart legend\\"]")?.getAttribute("aria-valuenow")'))
  await evaluate('document.querySelector("[aria-label=\\"Resize chart legend\\"]").focus()')
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Left'})
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Left'})
  await waitFor(win,'Number(document.querySelector("[aria-label=\\"Resize chart legend\\"]")?.getAttribute("aria-valuenow")) > '+widthBefore,'keyboard legend resize')
  const widthAfter = Number(await evaluate('document.querySelector("[aria-label=\\"Resize chart legend\\"]").getAttribute("aria-valuenow")'))
  await expectChart('Line')
  assert.equal(requests.length,callsBeforeLegend)
  interactions.push({scenario:'legend toggle and resize',series:legendBefore.map(v=>v.label),bothRestored:true,widthBefore,widthAfter,providerQueryDelta:0,chartStillPopulated:true})

  // The independent volume may finish while the durable primary operation is still pending.
  holdPrimary = true; holdTrend = false; metricReply = volume
  await button('Run')
  await waitFor(win,'window.__datakoalaStore.getState().tabs.find(t=>t.id==="cap21")?.running','pending primary operation')
  await settle()
  const primaryDeferred = deferred.find(v => v.kind === 'primary')
  assert.ok(primaryDeferred, 'expected held primary IPC')
  const primarySequence = primaryDeferred.sequence
  const trendSequence = requests.filter(r => r.kind === 'trend').at(-1)?.sequence
  assert.ok(trendSequence > primarySequence, 'optional volume dispatched alongside pending primary')
  assert.equal((await state()).running,true)
  holdPrimary = false
  deferred.splice(deferred.indexOf(primaryDeferred),1)
  primaryDeferred.resolve(logs)
  await waitFor(win,'!window.__datakoalaStore.getState().tabs.find(t=>t.id==="cap21")?.running','primary after early optional volume')
  await expectChart('Line')
  interactions.push({scenario:'trend settled before primary',primarySequence,trendSequence,primaryWasPending:true,finalRows:(await state()).result.logRows.length,finalChartItems:8})

  // Remount a chart while the optional volume request is held: old completion is stale.
  holdTrend = true
  await button('Run')
  await waitFor(win,'!window.__datakoalaStore.getState().tabs.find(t=>t.id==="cap21")?.running && document.body.innerText.includes("Loading log volume…")','volume pending before remount')
  await settle()
  const pendingRemount = deferred.find(v=>v.kind==='trend')
  assert.ok(pendingRemount,'held trend before remount')
  deferred.splice(deferred.indexOf(pendingRemount),1)
  const primaryBeforeReturn = count('primary')
  await evaluate('window.__datakoalaStore.setState({activeTabId:"cap21-other"})')
  await waitFor(win,'window.__datakoalaStore.getState().activeTabId==="cap21-other"','unmount current Loki')
  holdTrend = false
  await evaluate('window.__datakoalaStore.setState({activeTabId:"cap21"})')
  await waitFor(win,'window.__datakoalaStore.getState().activeTabId==="cap21" && document.querySelector("[aria-label=\\"Loki explorer\\"]")','remount original Loki')
  await expectChart('Line')
  const trendBeforeLate = count('trend')
  pendingRemount.resolve(staleVolume)
  await settle()
  await expectChart('Line')
  assert.equal(count('primary'),primaryBeforeReturn,'remount cannot rerun primary')
  assert.equal((await snapshot()).chart.items,8,'old pending volume cannot overwrite remounted chart')
  interactions.push({scenario:'pending trend through renderer remount',pendingSequence:pendingRemount.sequence,retriedLocalTrendOnRemount:count('trend')===trendBeforeLate,primaryReruns:0,finalChartItems:8})

  // Successful empty primary is different from a provider error and from empty metric volume.
  await view('List')
  logReply = { ...logs, rows:[], logRows:[], rowCount:0, execution:{...logs.execution,rowCount:0} }
  await button('Run')
  await waitFor(win,'!window.__datakoalaStore.getState().tabs.find(t=>t.id==="cap21")?.running && window.__datakoalaStore.getState().tabs.find(t=>t.id==="cap21")?.result?.logRows?.length===0','empty primary success')
  const emptyPrimaryState = await snapshot()
  assert.equal(emptyPrimaryState.queryError,null,'empty result must not masquerade as failure')
  assert.equal(emptyPrimaryState.resultRows,0)
  interactions.push({scenario:'empty primary',success:true,rows:0,queryError:null,resultText:emptyPrimaryState.resultsText})
  logReply=logs

  const sourceHead = process.env.DATAKOALA_AUDIT_HEAD
  assert.ok(sourceHead && /^[0-9a-f]{40}$/.test(sourceHead),'full generating source head required')
  await writeFile(resolve(outputDir,'measurements.json'),JSON.stringify({
    sourceHead,viewport:{width:1440,height:900,dpr:1,zoom:1},
    execution:'actual Electron renderer; controlled local synthetic Loki IPC; no authenticated provider',
    fixture:{from:FROM,to:TO,step:STEP,volumeRows:series,total:series.reduce((n,row)=>n+row.value,0),logCount:5},
    requests, interactions, observations,
  },null,2)+'\n')
  console.log('CAP21_OK '+JSON.stringify({sourceHead,requests:requests.length,images:observations.map(o=>o.filename)}))
}
