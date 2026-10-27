/** #542: recording-shaped grouped volume and a real configuration-loss regression.
 * All rows are synthetic. No owner workspace, log payload or credential is used.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  auditProfiles,
  auditRange,
  auditLogResult,
} from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'

export const transitionScreenshots = [
  'view542-builder-grouped-pending.png',
  'view542-restored-table-bar.png',
  'view542-chosen-axis-after-patterns.png',
]
const logRows = Array.from({ length: 1000 }, (_, i) => ({
  ...auditLogResult.logRows[i % auditLogResult.logRows.length],
  id: 'view542-log-' + i,
  line:
    'needle ' + auditLogResult.logRows[i % auditLogResult.logRows.length].line,
}))
const logs = {
  ...auditLogResult,
  logRows,
  rows: logRows,
  rowCount: logRows.length,
  columns: [
    { name: 'timestampMs', dataTypeID: 0, dataTypeName: 'timestamp' },
    ...['line', 'labels', 'structuredMetadata', 'parsedFields'].map((name) => ({
      name,
      dataTypeID: 0,
      dataTypeName: name === 'line' ? 'string' : 'json',
    })),
  ],
}
const volume = {
  resultKind: 'metrics',
  columns: [
    { name: 'timestamp', dataTypeID: 0, dataTypeName: 'timestamp' },
    { name: 'value', dataTypeID: 0, dataTypeName: 'numeric' },
    { name: 'level', dataTypeID: 0, dataTypeName: 'string' },
  ],
  rows: Array.from({ length: 122 }, (_, i) =>
    ['error', 'info', 'warn'].map((level, j) => ({
      timestamp: new Date(Date.UTC(2026, 7, 19, 16, 0, i * 20)).toISOString(),
      value: 2 + i + j,
      level,
    })),
  ).flat(),
  rowCount: 366,
  durationMs: 1,
  execution: { provider: 'loki', durationMs: 1 },
}

export async function runLokiViewTransitionAudit({
  ipc,
  win,
  outputDir,
  waitFor,
  capture,
}) {
  const js = (code) => win.webContents.executeJavaScript(code)
  const settle = () =>
    js(
      'new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))',
    )
  const choose = async (label) => {
    await js(
      `(()=>{const b=[...document.querySelectorAll('[aria-label="Result view"] button')].find(b=>b.getAttribute('aria-label')===${data(label)});b.click()})()`,
    )
    await settle()
  }
  const ready = () =>
    waitFor(
      win,
      `(()=>{const c=document.querySelector('[data-result-chart-canvas]');return c?.dataset.visualFinished==='true'&&c.dataset.visualFingerprint===c.dataset.visualExpectedFingerprint&&!!c.querySelector('canvas')})()`,
      'applied #542 ECharts option',
    )
  const observations = [],
    cases = []
  let requests = [],
    grouped = false,
    delay = false,
    release = null
  ipc.removeHandler('connections:loki:labels')
  ipc.handle('connections:loki:labels', () => ['service_name', 'level'])
  ipc.removeHandler('query:run-loki')
  ipc.handle('query:run-loki', (_event, id, request) => {
    const kind = request.expression.startsWith('count(')
      ? 'probe'
      : request.expression.includes('count_over_time')
        ? 'volume'
        : 'primary'
    requests.push({ kind, id, request })
    if (kind === 'primary') return logs
    if (kind === 'probe')
      return {
        ...volume,
        rows: [{ timestamp: volume.rows[0].timestamp, value: 3 }],
        rowCount: 1,
      }
    const result = grouped
      ? volume
      : {
          ...volume,
          columns: volume.columns.slice(0, 2),
          rows: volume.rows
            .filter((row) => row.level === 'error')
            .map(({ timestamp, value }) => ({ timestamp, value })),
          rowCount: 122,
        }
    if (delay)
      return new Promise((done) => {
        release = () => done(result)
      })
    return result
  })
  const counts = () =>
    Object.fromEntries(
      ['primary', 'probe', 'volume'].map((kind) => [
        kind,
        requests.filter((r) => r.kind === kind).length,
      ]),
    )
  const inspect = () =>
    js(`(()=>{
    const c=document.querySelector('[data-result-chart-canvas]'); let option=null;
    if(c) for(const e of [c,...c.querySelectorAll('*')]) {
      const key=Object.keys(e).find(k=>k.includes('reactFiber')); let f=key?e[key]:null;
      while(f){if(typeof f.stateNode?.getEchartsInstance==='function'){const o=f.stateNode.getEchartsInstance().getOption();option={series:o.series.map(s=>({name:s.name,type:s.type,points:s.data.slice(0,3),length:s.data.length})),xAxis:o.xAxis.map(a=>({type:a.type,data:a.data?.slice(0,3)}))};break}f=f.return} if(option)break;
    }
    const s=window.__datakoalaStore.getState(),t=s.tabs.find(t=>t.id===s.activeTabId);
    return {outer:t.lokiResultView,selected:[...document.querySelectorAll('[aria-label="Result view"] button[aria-pressed=true]')].map(b=>b.getAttribute('aria-label')),table:!!document.querySelector('[data-result-table-pane]'),config:c?JSON.parse(c.dataset.visualConfig):null,effective:c?.dataset.visualType,applied:c?.dataset.visualFingerprint,requested:c?.dataset.visualExpectedFingerprint,option,primaryColumns:t.result?.columns,volumeColumns:t.lokiVolume?.result?.columns,pending:t.lokiVolume?.pending,cacheKey:t.lokiVolume?.key,empty:document.querySelector('[data-result-empty]')?.textContent}
  })()`)
  const check = async (view) => {
    await ready()
    const report = await inspect()
    assert.equal(report.outer, view.toLowerCase())
    assert.deepEqual(report.selected, [view])
    assert.equal(report.table, false)
    assert.equal(report.effective, view.toLowerCase())
    assert.equal(report.applied, report.requested)
    assert.ok(report.option.series.length > 0)
    assert.ok(report.option.series.every((s) => s.type === view.toLowerCase()))
    return report
  }
  const seed = async (name, builder, restored = false) => {
    requests = []
    release = null
    await js(
      `(()=>{const s=window.__datakoalaStore,p=${data(auditProfiles.loki)},t=structuredClone(s.getState().tabs[0]);Object.assign(t,{id:${data(name)},connectionProfileId:p.id,queryMode:${data(builder ? 'builder' : 'sql')},sql:'{service_name="example-service"}',lokiBuilder:{labelMatchers:[{label:'service_name',operator:'=',value:'example-service'}],lineFilters:[{operator:'|=',value:'needle'}],parsers:[],fieldFilters:[]},lokiGroupBy:${data(grouped ? ['level'] : [])},lokiTimeRange:${data(auditRange)},lokiResultView:${data(restored ? 'table' : 'list')},result:${restored ? data(logs) : 'null'},pendingResult:null,queryError:null,running:false,queryOperation:undefined,queryContextId:crypto.randomUUID(),resultRevision:${restored ? 1 : 0},lokiVolume:undefined,seriesVisibility:{},sqlResultFilters:[],sqlVisualization:{view:'table',xColumn:'timestampMs',valueColumn:null,aggregation:'sum',seriesColumn:null,seriesColumns:[]}});s.setState({profiles:[p],tabs:[t],activeTabId:t.id,connectionStateByProfileId:{[p.id]:{status:'connected',generation:1,error:null}},metadataByProfileId:{[p.id]:{schemas:[],status:'loaded',error:null,isStale:false,revision:1}}})})()`,
    )
    await waitFor(
      win,
      `document.querySelector('[aria-label="Loki query results"]')`,
      'recording-shaped Loki workspace',
    )
    if (!restored) {
      await js(
        `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Run').click()`,
      )
      await waitFor(
        win,
        `!!window.__datakoalaStore.getState().tabs[0].result`,
        'primary logs',
      )
    }
  }
  const shot = async (filename) => {
    const target = await js(
      `document.querySelector('[data-result-chart-canvas]').getBoundingClientRect().toJSON()`,
    )
    observations.push({
      filename,
      width: 1440,
      height: 900,
      dpr: 1,
      zoom: 1,
      target,
    })
    await capture(win, filename)
  }
  win.setContentSize(1440, 900)
  win.webContents.setZoomFactor(1)

  grouped = true
  delay = true
  await seed('view542-grouped', true)
  await choose('Table')
  await waitFor(
    win,
    `!!document.querySelector('[data-result-table-pane]')`,
    'five-column raw Table',
  )
  await choose('Patterns')
  await choose('Bar')
  await waitFor(
    win,
    `document.body.innerText.includes('Loading log volume')`,
    'grouped volume pending',
  )
  assert.deepEqual(counts(), { primary: 1, probe: 1, volume: 1 })
  await choose('Table')
  await choose('Patterns')
  await choose('Line')
  assert.deepEqual(counts(), { primary: 1, probe: 1, volume: 1 })
  assert.ok(release)
  release()
  const line = await check('Line')
  await choose('Bar')
  const bar = await check('Bar')
  assert.equal(bar.option.series.length, 3)
  assert.deepEqual(
    bar.option.series.map((s) => s.points[0][1]).sort((a, b) => a - b),
    [2, 3, 4],
  )
  cases.push({
    name: 'Builder + level + pending cold/return',
    line,
    bar,
    counts: counts(),
    requests: [...requests],
  })
  await shot(transitionScreenshots[0])

  grouped = false
  delay = false
  await seed('view542-restored', false, true)
  for (const view of [
    'Table',
    'Patterns',
    'Bar',
    'Line',
    'Table',
    'Patterns',
    'Bar',
  ]) {
    await choose(view)
    if (view === 'Bar' || view === 'Line') await check(view)
  }
  const restored = await check('Bar')
  assert.deepEqual(counts(), { primary: 0, probe: 0, volume: 1 })
  cases.push({
    name: 'Raw restored Table + remembered table visualization',
    report: restored,
    counts: counts(),
    requests: [...requests],
  })
  await shot(transitionScreenshots[1])

  await seed('view542-axis', false)
  await choose('Line')
  await check('Line')
  await js(
    `document.querySelector('[role=combobox][aria-label^="X axis:"]').click()`,
  )
  await waitFor(
    win,
    `!![...document.querySelectorAll('[role=option]')].find(o=>o.textContent.startsWith('value'))`,
    'value X option',
  )
  await js(
    `[...document.querySelectorAll('[role=option]')].find(o=>o.textContent.startsWith('value')).click()`,
  )
  await waitFor(
    win,
    `JSON.parse(document.querySelector('[data-result-chart-canvas]')?.dataset.visualConfig??'{}').x==='value'`,
    'chosen numeric X mapping',
  )
  const chosen = await check('Line')
  for (const view of [
    'Table',
    'Patterns',
    'Bar',
    'Line',
    'Table',
    'Patterns',
    'Bar',
  ]) {
    await choose(view)
    if (view === 'Bar' || view === 'Line') await check(view)
  }
  const after = await check('Bar')
  const baseline = process.env.DATAKOALA_VIEW542_BASELINE === '1'
  assert.equal(chosen.config.x, 'value')
  assert.equal(
    after.config.x,
    baseline ? 'timestamp' : 'value',
    'confirmed mapping reset before / preserved after',
  )
  assert.deepEqual(counts(), { primary: 1, probe: 0, volume: 1 })
  cases.push({
    name: 'Confirmed chosen-axis loss',
    baseline,
    chosen,
    after,
    counts: counts(),
    requests: [...requests],
  })
  await shot(transitionScreenshots[2])
  await writeFile(
    resolve(outputDir, 'view542-measurements.json'),
    JSON.stringify(
      {
        sourceHead: process.env.DATAKOALA_AUDIT_HEAD,
        observations,
        cases,
        disposition:
          'Mapping loss reproduced; original retained-table report requires exact owner build/query retest',
        humanAcceptance: 'Pending',
      },
      null,
      2,
    ),
  )
  return observations
}
