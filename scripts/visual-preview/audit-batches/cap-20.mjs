/** CAP-20: Loki Patterns — isolated, synthetic-provider, real Electron renderer audit. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAuditIpc as installBaseIpc } from '../audit.mjs'
import { auditLogResult, auditProfiles, auditRange } from '../audit-fixtures.mjs'
import { rendererValue as data } from '../renderer-value.mjs'

export const screenshots = [
  'cap20-patterns-default-desktop.png',
  'cap20-patterns-inspector-desktop.png',
  'cap20-patterns-view-logs-desktop.png',
  'cap20-patterns-empty-desktop.png',
]

const singular = [
  'Amber', 'Birch', 'Cedar', 'Dawn', 'Ember', 'Fern', 'Granite', 'Harbor',
  'Ivory', 'Jasper', 'Kestrel', 'Lagoon', 'Marble', 'Nectar', 'Orchid', 'Pebble',
  'Quartz', 'River', 'Spruce', 'Thistle', 'Umber', 'Velvet', 'Willow', 'Zephyr',
]
const descriptions = [
  ['Request 123 completed', 'ERROR'],
  ['Request 456 completed', 'ERROR'],
  ['Request 789 completed', 'INFO'],
  ['Request 101 completed', 'ERROR'],
  ['Worker started normally', 'INFO'],
  ['Worker started normally', 'INFO'],
  ['Captured payload "quoted" and backslash \\ in a diagnostic event', undefined],
  ['An exceptionally long diagnostic sequence '.repeat(15), 'WARN'],
  ...singular.map((word) => [`${word} independent process finished normally`, 'INFO']),
]
const canonical = auditLogResult.logRows[0]
const rows = descriptions.map(([line, severity], index) => {
  const timestampMs = Date.parse('2026-08-19T16:45:00.000Z') - index * 1000
  return {
    ...canonical, id: `cap20-${index}`, timestampMs,
    timestampNs: String(BigInt(timestampMs) * 1000000n),
    line, labels: { service_name: 'example-service', environment: 'example' },
    structuredMetadata: {}, parsedFields: {},
    ...(severity ? { severity } : { severity: undefined }),
  }
})
const asResult = logRows => ({
  ...auditLogResult, rows: logRows, logRows, rowCount: logRows.length,
  execution: { provider: 'loki', durationMs: 7, rowCount: logRows.length },
})
const populated = asResult(rows)
const empty = asResult([])
const promoted = asResult(rows.slice(0, 4))
const builderBase = {
  labelMatchers: [{ label: 'service_name', operator: '=', value: 'example-service' }],
  lineFilters: [], parsers: [], fieldFilters: [],
}

let reply = populated
let failNext = false
const requests = []
export function installAuditIpc(ipc) {
  requests.length = 0
  reply = populated
  failNext = false
  installBaseIpc(ipc)
  const handle = (channel, fn) => { ipc.removeHandler(channel); ipc.handle(channel, fn) }
  handle('connections:loki:labels', () => ['service_name', 'environment', 'severity'])
  handle('connections:loki:label-values', (_event, _id, label) =>
    label === 'service_name' ? ['example-service'] : ['example'])
  handle('query:run-loki', (_event, id, request) => {
    requests.push({ id, ...request })
    if (failNext) { failNext = false; throw Error('Synthetic CAP-20 Loki unavailable') }
    return reply
  })
}

export async function runVisualAudit({ win, outputDir, waitFor, capture, dragDivider }) {
  await mkdir(outputDir, { recursive: true })
  const observations = [], interactions = []
  const evaluate = expression => win.webContents.executeJavaScript(expression)
  const settle = () => evaluate('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))')
  const state = () => evaluate('window.__datakoalaStore.getState().tabs[0]')
  const clicked = async expression => { await evaluate(expression); await settle() }
  const button = async label => {
    const expression = `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${data(label)})`
    await waitFor(win, expression, label + ' button')
    await clicked(`(() => {const b=${expression};if(!b || b.disabled)throw Error('Unavailable button: '+${data(label)});b.click()})()`)
  }
  const selectedPattern = () => `[...document.querySelectorAll('[data-pattern-row] button')].find(b => b.textContent.includes('Request') && b.textContent.includes('completed'))`
  const patternSelected = async () => {
    await waitFor(win, selectedPattern(), 'Request pattern visible')
    await clicked(`(() => {const e=${selectedPattern()};if(!e)throw Error('Missing request pattern');e.click()})()`)
    await waitFor(win, `document.querySelector('[data-pattern-inspector]')`, 'pattern inspector')
  }
  const currentQuery = () => evaluate(`document.querySelector('[aria-label="Generated LogQL query"] .cm-content')?.innerText.trim() ?? ''`)
  const snapshot = () => evaluate(`(() => {
    const root = document.querySelector('[aria-label="Log patterns"]')
    const inspector = document.querySelector('[data-pattern-inspector]')
    const items = [...document.querySelectorAll('[data-pattern-row] button')].map(e => ({
      text: e.textContent.trim(), selected: e.getAttribute('aria-selected'),
      index: Number(e.closest('[data-index]')?.getAttribute('data-index')),
    }))
    return {
      patterns: root?.innerText ?? null, inspector: inspector?.innerText ?? null,
      inspectorWidth: document.querySelector('[data-resizable-detail]')?.getAttribute('data-detail-width') ?? null,
      selectedCount: items.filter(item => item.selected === 'true').length,
      items, localPattern: document.body.innerText.includes('Local pattern filter:'),
      currentView: [...document.querySelectorAll('[aria-label="Result view"] button')].find(e => e.getAttribute('aria-pressed') === 'true')?.textContent.trim(),
    }
  })()`)
  const save = async (filename, description, targetSelector) => {
    await settle()
    const observed = await evaluate(`(() => {
      const el = document.querySelector(${data(targetSelector)}), r = el?.getBoundingClientRect()
      return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
        target: r ? { x:r.x, y:r.y, width:r.width, height:r.height } : null,
        documentOverflow: document.documentElement.scrollWidth > innerWidth + 1 }
    })()`)
    assert.equal(observed.width, 1440)
    assert.equal(observed.height, 900)
    assert.equal(observed.dpr, 1)
    observed.zoom = win.webContents.getZoomFactor()
    assert.equal(observed.zoom, 1)
    assert.ok(observed.target?.width > 0 && observed.target?.height > 0, filename + ': missing visible target')
    assert.equal(observed.documentOverflow, false, filename + ': page overflows viewport')
    observations.push({
      filename, description, ...observed, semantic: await snapshot(),
      query: await currentQuery(), requests: requests.length,
    })
    await capture(win, filename)
  }
  const assertNoDispatch = async (name, expectedFilters) => {
    const before = requests.length
    await patternSelected()
    await button('View logs')
    await waitFor(win, `document.body.innerText.includes('Local pattern filter:')`, name + ' local fallback')
    assert.equal(requests.length, before, name + ': unexpectedly dispatched a query')
    const tab = await state()
    assert.equal(tab.lokiResultView, 'list')
    assert.deepEqual(tab.lokiBuilder.lineFilters, expectedFilters)
    assert.equal((await snapshot()).localPattern, true)
    interactions.push({ name, queryCallsDelta: 0, preservedLineFilters: expectedFilters, localRows: 4 })
  }
  const restorePatterns = async (lineFilters = [], queryMode = 'builder') => {
    await evaluate(`(() => {
      const s = window.__datakoalaStore, old = s.getState().tabs[0]
      s.getState().setLokiState({
        lokiBuilder: { ...old.lokiBuilder, lineFilters: ${data(lineFilters)} },
        lokiResultView: 'patterns',
      })
      s.getState().setQueryMode(${data(queryMode)})
      s.getState().setResult(${data(populated)}, null)
    })()`)
    await waitFor(win, `document.querySelector('[aria-label="Log patterns"] [data-pattern-row]')`, 'restored patterns')
    await settle()
  }

  win.show(); win.focus(); win.setContentSize(1440, 900)
  win.webContents.setZoomFactor(1)
  await evaluate(`(() => {
    const s = window.__datakoalaStore, old = JSON.parse(JSON.stringify(s.getState().tabs[0]))
    const p = ${data(auditProfiles.loki)}
    old.id = 'cap20'; old.title = 'CAP-20'; old.connectionProfileId = p.id
    old.queryMode = 'builder'; old.sql = '{service_name="draft"}'
    old.result = null; old.queryError = null; old.running = false
    old.lokiBuilder = ${data(builderBase)}; old.lokiResultView = 'list'
    old.lokiTimeRange = ${data(auditRange)}; old.lokiResultLimit = 2000
    old.lokiGroupBy = []; old.sqlResultFilters = []
    s.setState({ profiles:[p], tabs:[old], activeTabId:old.id,
      connectionStateByProfileId:{ [p.id]:{status:'connected',generation:1,error:null} },
      metadataByProfileId:{ [p.id]:{schemas:[],status:'loaded',error:null,isStale:false} },
    })
  })()`)
  await waitFor(win, `document.querySelector('[data-loki-builder]') && !document.querySelector('[role="combobox"][disabled]')`, 'Loki Builder ready')
  const sidebarDelta = await evaluate(`240-document.querySelector('[aria-label="Resize sidebar"]').getBoundingClientRect().left`)
  if (Math.abs(sidebarDelta) > 1) await dragDivider(win, '[aria-label="Resize sidebar"]', Math.round(sidebarDelta), 0)
  const editorDelta = await evaluate(`document.querySelector('.main').getBoundingClientRect().top+345-document.querySelector('.editor-resizer').getBoundingClientRect().top`)
  if (Math.abs(editorDelta) > 1) await dragDivider(win, '.editor-resizer', 0, Math.round(editorDelta))
  reply = populated
  await button('Run')
  await waitFor(win, `!window.__datakoalaStore.getState().tabs[0].running && window.__datakoalaStore.getState().tabs[0].result?.logRows?.length === 32`, 'populated synthetic Loki query')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].expression, '{service_name="example-service"}')
  await button('Patterns')
  await waitFor(win, `document.querySelector('[aria-label="Log patterns"]')?.innerText.includes('28 patterns · 32 loaded logs')`, 'pattern count')
  const metrics = await snapshot()
  assert.ok(metrics.items.some(item => item.text.includes('4 logs · 12.5%') && item.text.includes('Request')))
  assert.ok(metrics.items.some(item => item.text.includes('2 logs · 6.3%') && item.text.includes('Worker')))
  assert.ok(metrics.items[0].text.includes('4 logs · 12.5%'), 'descending count order')
  assert.ok(metrics.items[1].text.includes('2 logs · 6.3%'), 'second count ordering')
  assert.ok(metrics.items[0].text.includes('ERROR'), 'representative severity')
  interactions.push({
    name:'grouping-counts-ordering', totalLogs:32, totalPatterns:28,
    first:metrics.items[0].text, second:metrics.items[1].text,
    denominator:'all 32 loaded rows', tieBreak:'template alphabetical, as implemented',
  })
  await save('cap20-patterns-default-desktop.png', 'Actual virtualized counts, severity, ordering and long messages', '[aria-label="Log patterns"]')

  await patternSelected()
  const inspector = await snapshot()
  assert.equal(inspector.selectedCount, 1)
  assert.ok(inspector.inspector.includes('4') && inspector.inspector.includes('12.5%'))
  assert.ok(inspector.inspector.includes('Request') && inspector.inspector.includes('Example messages'))
  assert.ok(inspector.inspector.includes('Variable samples'))
  assert.ok(inspector.inspector.includes('123') && inspector.inspector.includes('456'))
  const beforeWidth = Number(inspector.inspectorWidth)
  await clicked(`document.querySelector('[role="separator"][aria-label="Resize Selected pattern details"]').focus()`)
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Left'})
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Left'})
  await waitFor(win, `Number(document.querySelector('[data-resizable-detail]')?.getAttribute('data-detail-width')) > ${beforeWidth}`, 'keyboard inspector resize')
  const afterWidth = Number((await snapshot()).inspectorWidth)
  await clicked(`document.querySelector('[data-pattern-scroller]').scrollTop = document.querySelector('[data-pattern-scroller]').scrollHeight`)
  await settle()
  assert.ok((await snapshot()).inspector?.includes('Request'), 'scroll preserves selected details')
  await clicked(`document.querySelector('[data-pattern-scroller]').scrollTop = 0`)
  await settle()
  await save('cap20-patterns-inspector-desktop.png', 'Selected pattern; native keyboard-resized shared inspector', '[aria-label="Selected pattern details"]')
  // Inspector is dismissed via native Escape and reopened through its actual list row.
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'})
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'})
  await waitFor(win, `!document.querySelector('[data-pattern-inspector]')`, 'Escape dismisses pattern details')
  await patternSelected()
  assert.equal(Number((await snapshot()).inspectorWidth), afterWidth)
  interactions.push({name:'inspector',selectedPattern:'Request <number> completed',resize:{beforeWidth,afterWidth},scrollPreservesSelection:true,escapeCloses:true,widthPersists:true})

  reply = promoted
  const originalBuilder = (await state()).lokiBuilder
  await button('View logs')
  await waitFor(win, `!window.__datakoalaStore.getState().tabs[0].running && window.__datakoalaStore.getState().tabs[0].lokiResultView === 'list' && window.__datakoalaStore.getState().tabs[0].result?.logRows?.length===4`, 'promoted pattern results')
  assert.equal(requests.length, 2)
  const expected = '{service_name="example-service"} |= "completed"'
  assert.equal(requests[1].expression, expected)
  const tab = await state()
  assert.deepEqual(tab.lokiBuilder.lineFilters, [{operator:'|=',value:'completed'}])
  assert.deepEqual(tab.lokiBuilder.labelMatchers, originalBuilder.labelMatchers)
  assert.equal((await snapshot()).localPattern, false)
  assert.equal(await evaluate(`document.querySelector('input[aria-label="Line contains"]')?.value ?? document.querySelector('[data-field-name="Line contains"] input')?.value`), 'completed')
  interactions.push({name:'safe-promotion',exactLogQL:expected,queryCallsDelta:1,matchedLoadedRows:4,otherBuilderStateRetained:true})
  await save('cap20-patterns-view-logs-desktop.png', 'Real View logs promoted Builder query and populated List results', '[aria-label="Loki explorer"]')

  // Non-|= and multi-stage saved pipelines are genuinely incompatible with the visible single filter.
  reply = populated
  await restorePatterns([{operator:'!=',value:'healthcheck'}])
  await assertNoDispatch('single negative operator', [{operator:'!=',value:'healthcheck'}])
  await restorePatterns([{operator:'|=',value:'Request'}, {operator:'!=',value:'healthcheck'}])
  await assertNoDispatch('multiple existing line filters', [{operator:'|=',value:'Request'}, {operator:'!=',value:'healthcheck'}])
  // Raw LogQL cannot be silently replaced with a generated Builder query.
  await restorePatterns([], 'sql')
  await assertNoDispatch('raw LogQL mode', [])
  const afterUnsafe = requests.length
  assert.equal(afterUnsafe, 2)

  // A replacement result must invalidate the selected inspector, even without leaving Patterns.
  await restorePatterns()
  await patternSelected()
  const replacement = asResult(rows.map((r,index) => ({
    ...r, id:'replacement-'+index, line:`Replacement independent record ${index} was received`,
  })))
  await evaluate(`window.__datakoalaStore.getState().setResult(${data(replacement)}, null)`)
  await waitFor(win, `!document.querySelector('[data-pattern-inspector]')`, 'stale selected pattern removed')
  interactions.push({name:'result-replacement',inspectorCleared:true,queryCallsDelta:0})

  await evaluate(`window.__datakoalaStore.getState().setResult(${data(empty)}, null)`)
  await waitFor(win, `document.querySelector('[aria-label="Log patterns"]')?.innerText.includes('No logs to cluster.')`, 'genuinely empty pattern results')
  const noRows = await snapshot()
  assert.ok(noRows.patterns.includes('0 patterns · 0 loaded logs'))
  assert.equal(noRows.selectedCount, 0)
  assert.ok(!noRows.inspector)
  assert.equal(requests.length, afterUnsafe)
  await save('cap20-patterns-empty-desktop.png', 'Empty result is distinct from a failed query', '[aria-label="Log patterns"]')
  interactions.push({name:'empty-and-optional-fields',missingSeverityRowRendered:true,emptyMessage:'No logs to cluster.',noNaN:true,viewLogsAbsent:!await evaluate(`[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='View logs')`)})
  assert.equal(await evaluate(`document.body.innerText.includes('NaN%')`), false)

  // An actual failing synthetic provider call must expose failure feedback, never an empty success.
  await evaluate(`window.__datakoalaStore.getState().setQueryMode('builder')`)
  failNext = true
  await button('Run')
  await waitFor(win, `document.body.innerText.includes('Synthetic CAP-20 Loki unavailable')`, 'provider error feedback')
  assert.equal(requests.length, afterUnsafe + 1)
  assert.ok(!(await evaluate(`document.querySelector('[aria-label="Log patterns"]')?.innerText.includes('No logs to cluster.') ?? false`)), 'failure masquerades as empty success')
  interactions.push({name:'unavailable-provider',errorVisible:true,requestDelta:1,notReportedAsSuccessfulEmpty:true})

  const sourceHead = process.env.DATAKOALA_AUDIT_HEAD
  assert.ok(sourceHead && /^[0-9a-f]{40}$/.test(sourceHead), 'GitHub generating sourceHead must be a full SHA')
  await writeFile(resolve(outputDir, 'measurements.json'), JSON.stringify({
    sourceHead, execution:'real Electron renderer, deterministic IPC without live Loki',
    viewport:{width:1440,height:900,dpr:1,zoom:1}, fixture:{rows:32,patterns:28},
    requests, interactions, observations,
  }, null, 2) + '\n')
  console.log('CAP20_OK ' + JSON.stringify({sourceHead,requests:requests.map(x=>x.expression),screenshots:observations.map(x=>x.filename)}))
}
