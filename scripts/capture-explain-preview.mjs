// Deterministic PostgreSQL EXPLAIN ANALYZE preview.
// The execution-plan tree and AI response are synthetic; no database or provider is used.
import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.DATAKOALA_SMOKE = '1'
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const output = resolve(process.env.DATAKOALA_PREVIEW_OUTPUT ?? 'visual-preview')
const sleep = (ms) =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
let planAnalysisCalls = 0
let capturedPlanRequest
let aiConfigured = false
let delayPlanResponse = false
let pendingPlanResponse
let cancelledPlanRequests = 0
let previewStep = 'initialize preview'

async function wait(win, expression, description) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await win.webContents.executeJavaScript(`Boolean(${expression})`))
      return
    await sleep(100)
  }
  throw new Error(`EXPLAIN preview did not become ready: ${description}`)
}

const tree = {
  id: '0',
  plan: 'Limit',
  nodeType: 'Limit',
  startupCost: 1284.42,
  totalCost: 1284.67,
  planRows: 100,
  actualRows: 101,
  actualTotalTime: 24.8,
  loops: 1,
  children: [
    {
      id: '0.0',
      plan: 'Sort',
      nodeType: 'Sort',
      startupCost: 1284.42,
      totalCost: 1286.92,
      planRows: 1000,
      actualRows: 10_000,
      actualTotalTime: 24.7,
      loops: 1,
      sortKey: ['sum(o.amount) DESC'],
      sortMethod: 'external merge',
      sortSpaceUsed: 8192,
      sortSpaceType: 'Disk',
      tempWrittenBlocks: 215,
      tempReadBlocks: 214,
      children: [
        {
          id: '0.0.0',
          plan: 'HashAggregate',
          nodeType: 'HashAggregate',
          strategy: 'Hashed',
          startupCost: 1214.59,
          totalCost: 1224.59,
          planRows: 1000,
          actualRows: 84,
          actualTotalTime: 23.9,
          loops: 1,
          groupKey: ['c.country'],
          peakMemoryUsage: 193,
          children: [
            {
              id: '0.0.0.0',
              plan: 'Hash Join',
              nodeType: 'Hash Join',
              joinType: 'Inner',
              startupCost: 312.14,
              totalCost: 1102.05,
              planRows: 120,
              actualRows: 84000,
              actualTotalTime: 20.3,
              loops: 1,
              hashCond: '(o.customer_id = c.id)',
              sharedHitBlocks: 1287,
              sharedReadBlocks: 42,
              children: [
                {
                  id: '0.0.0.0.0',
                  plan: 'Seq Scan on orders o',
                  nodeType: 'Seq Scan',
                  schema: 'analytics',
                  relation: 'orders',
                  alias: 'o',
                  startupCost: 0,
                  totalCost: 741.31,
                  planRows: 84000,
                  actualRows: 84000,
                  actualTotalTime: 11.6,
                  loops: 1,
                  filter: "(created_at >= (now() - '30 days'::interval))",
                  rowsRemovedByFilter: 12500,
                  sharedHitBlocks: 1104,
                  sharedReadBlocks: 42,
                },
                {
                  id: '0.0.0.0.1',
                  plan: 'Hash',
                  nodeType: 'Hash',
                  startupCost: 186.4,
                  totalCost: 186.4,
                  planRows: 10000,
                  actualRows: 10000,
                  actualTotalTime: 4.2,
                  loops: 1,
                  hashBatches: 1,
                  peakMemoryUsage: 516,
                  children: [
                    {
                      id: '0.0.0.0.1.0',
                      plan: 'Index Scan using customers_pkey on customers c',
                      nodeType: 'Index Scan',
                      schema: 'analytics',
                      relation:
                        'customers_with_a_long_relation_name_for_preview',
                      alias: 'c',
                      index:
                        'customers_primary_region_account_activity_index_long_name',
                      startupCost: 0.29,
                      totalCost: 186.4,
                      planRows: 10000,
                      actualRows: 10000,
                      actualTotalTime: 2.5,
                      loops: 10,
                      indexCond: '(active = true)',
                      sharedHitBlocks: 183,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

app.whenReady().then(async () => {
  try {
    ipcMain.handle('connections:list', () => [])
    ipcMain.handle('connections:live', () => [])
    ipcMain.handle('ai:settings:get', () => ({
      ok: true,
      value: {
        provider: 'openrouter',
        model: aiConfigured ? 'preview/model' : '',
        hasApiKey: aiConfigured,
      },
    }))
    ipcMain.handle('ai:analyze-plan', (_event, request) => {
      planAnalysisCalls += 1
      capturedPlanRequest = request
      const response = {
        ok: true,
        value: {
          summary:
            'The plan contains a material row estimate mismatch and a filtered sequential scan worth reviewing.',
          hints: [
            {
              title: 'Join cardinality is underestimated',
              action: 'Review statistics for the join key and filtered rows.',
              detail:
                'The planner estimated far fewer rows than PostgreSQL returned, which may affect downstream choices.',
              severity: 'warning',
              nodeIds: ['0.0.0.0', '0.0.0.0.0'],
              evidence:
                'The Hash Join estimated 120 rows and returned 84,000; the orders scan reports 12,500 rows removed by its filter.',
            },
            {
              title: 'Review the date filter selectivity',
              action: null,
              detail:
                'The scan removed a noticeable number of rows after applying the captured date predicate.',
              severity: 'info',
              nodeIds: ['0.0.0.0.0'],
              evidence:
                'The orders Seq Scan filter uses created_at and reports 12,500 rows removed.',
            },
          ],
        },
      }
      if (delayPlanResponse)
        return new Promise((resolve) => {
          pendingPlanResponse = () => resolve(response)
        })
      return response
    })
    ipcMain.handle('ai:cancel', () => {
      cancelledPlanRequests += 1
      return { ok: true, value: undefined }
    })

    const win = new BrowserWindow({
      width: 1440,
      height: 1000,
      show: true,
      backgroundColor: '#0f1115',
      webPreferences: {
        preload: resolve(root, 'out/preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    })
    win.webContents.on(
      'console-message',
      (_event, level, message, line, source) => {
        if (level >= 2)
          console.error(
            `Renderer console (${level}): ${message} (${source}:${line})`,
          )
      },
    )

    previewStep = 'load renderer'
    await win.loadFile(resolve(root, 'out/renderer/index.html'))
    previewStep = 'wait for renderer store'
    await wait(
      win,
      `document.getElementById('root')?.children.length && window.__datakoalaStore`,
      'renderer store',
    )
    await win.webContents.executeJavaScript(`(() => {
      window.addEventListener('error', (event) => {
        console.error('Window error stack:', event.error?.stack ?? event.message)
      })
      window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled rejection:', event.reason?.stack ?? event.reason)
      })
    })()`)

    previewStep = 'seed EXPLAIN plan'
    await win.webContents.executeJavaScript(`(() => {
      const store = window.__datakoalaStore
      const state = store.getState()
      const profile = {
        id: 'explain-preview',
        name: 'Analytics warehouse',
        kind: 'postgres',
        version: 2,
        host: 'localhost',
        port: 5432,
        database: 'analytics',
        user: 'preview',
        password: '',
        tlsMode: 'disable',
        readonly: true
      }
      const sql =
        "SELECT c.country, sum(o.amount) AS revenue\\nFROM analytics.orders o\\nJOIN analytics.customers c ON c.id = o.customer_id\\nWHERE o.created_at >= now() - interval '30 days'\\nGROUP BY c.country\\nORDER BY revenue DESC\\nLIMIT 100;"
      store.setState({
        profiles: [profile],
        activeProfileId: profile.id,
        connected: true,
        connecting: false,
        connectionStatus: 'connected',
        connectionError: null,
        serverVersion: '17',
        tabs: state.tabs.map((tab) =>
          tab.id === state.activeTabId
            ? {
                ...tab,
                title: 'Revenue by country',
                connectionProfileId: profile.id,
                queryMode: 'sql',
                sql,
                explainTree: ${JSON.stringify(tree)},
                explainText:
                  'Limit  (cost=1284.42..1284.67 rows=100) (actual time=24.800..24.800 rows=101 loops=1)',
                explainSnapshot: {
                  query: sql,
                  mode: 'analyze',
                  planningTimeMs: 1.42,
                  executionTimeMs: 25.31
                },
                showExplain: true,
                activeExplainRequest: null
              }
            : tab
        )
      })
    })()`)

    previewStep = 'wait for JointJS graph'
    await wait(
      win,
      `(() => {
        const diagram = document.querySelector('[aria-label="Execution plan diagram"]')
        const nodeCount = Number(diagram?.dataset.nodeCount ?? 0)
        const edgeCount = Number(diagram?.dataset.edgeCount ?? 0)
        return nodeCount >= 7 && edgeCount === nodeCount - 1 && document.body.innerText.includes('EXPLAIN ANALYZE')
      })()`,
      'JointJS execution-plan graph and Explain summary',
    )

    previewStep = 'configure and run AI analysis'
    await sleep(250)
    previewStep = 'inspect unconfigured Explain state'
    const unconfiguredReport = await win.webContents.executeJavaScript(`({
      plan: Boolean(document.querySelector('[aria-label="Execution plan diagram"]')),
      headerAnalyzeAction: [...document.querySelector('[aria-label="Explain results"] header')?.querySelectorAll('button') ?? []].some((button) => button.textContent?.trim() === 'Analyze performance')
    })`)
    if (!unconfiguredReport.plan || unconfiguredReport.headerAnalyzeAction)
      throw new Error(
        `Unconfigured EXPLAIN preview assertion failed: ${JSON.stringify(unconfiguredReport)}`,
      )
    aiConfigured = true
    previewStep = 'dispatch AI settings changed event'
    await win.webContents.executeJavaScript(
      `window.dispatchEvent(new Event('datakoala:ai-settings-changed'))`,
    )
    previewStep = 'wait for configured AI action'
    await wait(
      win,
      `[...document.querySelectorAll('[aria-label="Performance hints"] button')].some((button) => button.textContent?.trim() === 'Run analysis')`,
      'configured AI performance action',
    )
    if (planAnalysisCalls !== 0)
      throw new Error(
        'Opening the plan triggered AI analysis without an explicit action',
      )
    previewStep = 'change editor SQL'
    await win.webContents.executeJavaScript(
      `window.__datakoalaStore.getState().setSql('select * from analytics.other_table;')`,
    )
    previewStep = 'click Run analysis'
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('[aria-label="Performance hints"] button')].find((button) => button.textContent?.trim() === 'Run analysis')?.click()`,
    )
    previewStep = 'wait for mocked AI response'
    await wait(
      win,
      `document.body.innerText.includes('Join cardinality is underestimated') && document.body.innerText.includes('Review the date filter selectivity')`,
      'mocked AI performance hints',
    )
    previewStep = 'select first AI hint'
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Join cardinality is underestimated'))?.click()\n//# sourceURL=datakoala-ai-hint-click.js`,
    )
    await sleep(100)
    previewStep = 'validate initial AI selection'
    const aiReportScript = `({
      calls: ${planAnalysisCalls},
      sql: ${JSON.stringify(capturedPlanRequest?.sql ?? null)},
      mode: ${JSON.stringify(capturedPlanRequest?.mode ?? null)},
      planNodeCount: ${capturedPlanRequest?.plan?.nodes?.length ?? 0},
      selectedNodeId: document.querySelector('[aria-label="Execution plan diagram"]')?.dataset.selectedNodeId,
      focusNodeId: document.querySelector('[aria-label="Execution plan diagram"]')?.dataset.focusNodeId,
      highlights: document.querySelector('[aria-label="Execution plan diagram"]')?.dataset.highlightedNodeIds?.split(',').filter(Boolean) ?? [],
      inspectorSignals: [...(document.querySelector('[aria-label="Plan node details"] [aria-label="Plan signals"]')?.querySelectorAll('li') ?? [])].map((item) => item.innerText),
      capturedQueryNotice: document.body.innerText.includes('This plan belongs to the SQL captured when Explain was run.')
    })\n//# sourceURL=datakoala-ai-hint-report.js`
    let aiReport
    try {
      aiReport = await win.webContents.executeJavaScript(aiReportScript)
    } catch (error) {
      console.error(`Initial AI report script: ${aiReportScript}`)
      throw error
    }
    if (
      aiReport.calls !== 1 ||
      !String(aiReport.sql).startsWith('SELECT c.country') ||
      aiReport.mode !== 'analyze' ||
      aiReport.planNodeCount < 7 ||
      aiReport.selectedNodeId !== '0.0.0.0' ||
      aiReport.focusNodeId !== '0.0.0.0' ||
      aiReport.highlights.length !== 2 ||
      !aiReport.inspectorSignals.some((signal) =>
        signal.includes('Material row estimate mismatch'),
      ) ||
      !aiReport.capturedQueryNotice
    )
      throw new Error(
        `EXPLAIN AI preview assertion failed: ${JSON.stringify(aiReport)}`,
      )

    await win.webContents.executeJavaScript(`(() => {
      const node = document.querySelector('[data-node-id="0.0"]')
      node?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    })()`)
    await sleep(100)
    previewStep = 'build Explain preview report'
    const report = await win.webContents.executeJavaScript(`(() => {
      const diagram = document.querySelector('[aria-label="Execution plan diagram"]')
      const surface = document.querySelector('[data-testid="execution-plan-joint-surface"]')
      const explainRoot = document.querySelector('[aria-label="Explain results"]')
      const summary = document.querySelector('[aria-label="Plan summary"]')
      const inspector = document.querySelector('[aria-label="Plan node details"]')
      const signals = inspector?.querySelector('[aria-label="Plan signals"]')
      const signalSections = document.querySelectorAll('[aria-label="Plan signals"]')
      const hints = document.querySelector('[aria-label="Performance hints"]')
      const header = explainRoot?.querySelector('header')
      const toolbar = diagram?.querySelector('[aria-label="Plan diagram navigation"]')
      const canvas = diagram?.querySelector('[data-testid="execution-plan-joint-surface"]')
      const text = document.body.innerText + (diagram?.textContent ?? '')
      const layout = document.querySelector('[class*="planLayout"]')
      const nodeElement = (id) => document.querySelector('[data-node-id="' + id + '"]')
      const nodeBounds = (id) => nodeElement(id)?.getBoundingClientRect()
      const rootElement = nodeElement('0')
      const firstChildElement = nodeElement('0.0')
      const rootNode = rootElement?.getBoundingClientRect()
      const firstChild = firstChildElement?.getBoundingClientRect()
      const sortNode = firstChild
      const join = nodeBounds('0.0.0.0')
      const joinLeftChild = nodeBounds('0.0.0.0.0')
      const joinRightChild = nodeBounds('0.0.0.0.1')
      const longTargetNode = document.querySelector('[data-node-id="0.0.0.0.1.0"]')
      const svgTexts = [...(longTargetNode?.querySelectorAll('text') ?? [])]
      const rootBackground = getComputedStyle(explainRoot).backgroundColor
      const surfaceBackground = getComputedStyle(surface).backgroundColor
      const paper = surface?.firstElementChild
      const paperBackground = paper ? getComputedStyle(paper).backgroundColor : ''
      const opaque = (color) => Boolean(color && color !== 'transparent' && !/[,/]\\s*0\\s*\\)?$/.test(color))
      const rootRect = rootElement?.querySelector('rect')
      const selectedRect = firstChildElement?.querySelector('rect')
      const rootStroke = rootRect ? getComputedStyle(rootRect).stroke : ''
      const selectedStroke = selectedRect ? getComputedStyle(selectedRect).stroke : ''
      const toolbarBounds = toolbar?.getBoundingClientRect()
      const canvasBounds = canvas?.getBoundingClientRect()
      const performanceStyle = hints ? getComputedStyle(hints) : null
      return {
        nodeCount: Number(diagram?.dataset.nodeCount ?? 0),
        edgeCount: Number(diagram?.dataset.edgeCount ?? 0),
        selectedNodeId: diagram?.dataset.selectedNodeId,
        highlightedNodeIds: diagram?.dataset.highlightedNodeIds?.split(',').filter(Boolean),
        categories: ['Limit', 'Sort', 'Aggregate', 'Join', 'Scan', 'Hash'].filter(
          (label) => text.includes(label),
        ),
        hasSummary: summary?.innerText.includes('Planning') && summary?.innerText.includes('Execution'),
        hasSignalsLabel: summary?.innerText.includes('Signals'),
        hasMeasuredTime: text.includes('Measured time'),
        hasPlannerMsConfusion: /Planner cost\\s*:\\s*[\\d.]+\\s*ms/i.test(text),
        width: diagram?.getBoundingClientRect().width,
        height: diagram?.getBoundingClientRect().height,
        signalsInInspector: Boolean(signals && inspector?.contains(signals) && signalSections.length === 1),
        signalCount: signals?.querySelectorAll('li').length ?? 0,
        signalButtons: signals?.querySelectorAll('button').length ?? 0,
        noRepeatedMeasuredSignals: !text.includes('High measured work'),
        opaqueSurfaces: opaque(rootBackground) && opaque(surfaceBackground) && opaque(paperBackground),
        surfaceColors: { rootBackground, surfaceBackground, paperBackground },
        noPlanNote: !explainRoot?.querySelector('[class*="planNote"]'),
        noHeaderAnalyzeAction: ![...(header?.querySelectorAll('button') ?? [])].some((button) => button.textContent?.trim() === 'Analyze performance'),
        runAgainInHints: Boolean(hints && [...hints.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Run again')),
        aiDetailsInHints: Boolean(hints?.querySelector('[aria-label="Inspect Analyze performance request"]')),
        hintsFlat: Boolean(performanceStyle && performanceStyle.borderTopWidth === '0px' && performanceStyle.backgroundColor === 'rgba(0, 0, 0, 0)'),
        controlsOverlay: Boolean(toolbar && toolbar.parentElement === diagram && getComputedStyle(toolbar).position === 'absolute'),
        canvasFillsGraph: Boolean(toolbarBounds && canvasBounds && canvasBounds.top <= toolbarBounds.top && canvasBounds.height >= diagram.getBoundingClientRect().height - 4),
        normalNodeBorder: Boolean(rootStroke && rootStroke !== 'none' && rootStroke !== surfaceBackground),
        selectedNodeOutlineStrong: Boolean(selectedStroke && rootStroke !== selectedStroke),
        rootAboveChild: Boolean(rootNode && firstChild && rootNode.y < firstChild.y),
        joinAboveChildren: Boolean(join && joinLeftChild && joinRightChild && join.y < joinLeftChild.y && join.y < joinRightChild.y),
        siblingOrder: Boolean(joinLeftChild && joinRightChild && joinLeftChild.x < joinRightChild.x),
        separateNodeText: svgTexts.length >= 6,
        truncatedTarget: svgTexts[2]?.textContent?.endsWith('…') ?? false,
        fullTargetAccessible: longTargetNode?.getAttribute('aria-label')?.includes('customers_with_a_long_relation_name_for_preview') ?? false,
        actionableSubtitle: text.includes('Review statistics for the join key and filtered rows.'),
        layoutDirection: layout ? getComputedStyle(layout).flexDirection : null,
      }
    })()`)
    previewStep = 'validate Explain preview report'
    if (
      report.nodeCount < 7 ||
      report.edgeCount !== report.nodeCount - 1 ||
      report.categories.length < 6 ||
      !report.hasSummary ||
      !report.hasSignalsLabel ||
      !report.hasMeasuredTime ||
      report.hasPlannerMsConfusion ||
      report.selectedNodeId !== '0.0' ||
      report.highlightedNodeIds?.length !== 2 ||
      !report.signalsInInspector ||
      report.signalCount !== 2 ||
      report.signalButtons !== 0 ||
      !report.noRepeatedMeasuredSignals ||
      !report.opaqueSurfaces ||
      !report.noPlanNote ||
      !report.noHeaderAnalyzeAction ||
      !report.runAgainInHints ||
      !report.aiDetailsInHints ||
      !report.hintsFlat ||
      !report.controlsOverlay ||
      !report.canvasFillsGraph ||
      !report.normalNodeBorder ||
      !report.selectedNodeOutlineStrong ||
      !report.rootAboveChild ||
      !report.joinAboveChildren ||
      !report.siblingOrder ||
      !report.separateNodeText ||
      !report.truncatedTarget ||
      !report.fullTargetAccessible ||
      !report.actionableSubtitle ||
      report.width < 700 ||
      report.height < 300
    ) {
      throw new Error(
        `EXPLAIN preview semantic/layout assertion failed: ${JSON.stringify(report)}`,
      )
    }

    win.setSize(900, 900)
    await sleep(180)
    const narrowExplain = await win.webContents.executeJavaScript(`({
      direction: getComputedStyle(document.querySelector('[class*="planLayout"]')).flexDirection,
      graphWidth: document.querySelector('[aria-label="Execution plan diagram"]').getBoundingClientRect().width,
      inspectorWidth: document.querySelector('[aria-label="Plan node details"]').getBoundingClientRect().width
    })`)
    if (
      narrowExplain.direction !== 'column' ||
      narrowExplain.graphWidth < 300 ||
      narrowExplain.inspectorWidth < 250
    )
      throw new Error(
        `Narrow EXPLAIN layout assertion failed: ${JSON.stringify(narrowExplain)}`,
      )
    win.setSize(1440, 1000)
    await sleep(180)

    await win.webContents.executeJavaScript(
      `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
    )
    await sleep(150)
    await mkdir(output, { recursive: true })
    await writeFile(
      resolve(output, 'explain-plan.png'),
      (await win.webContents.capturePage()).toPNG(),
    )

    previewStep = 'manual graph selection'
    const manualNodeSelected = await win.webContents.executeJavaScript(`(() => {
      const element = document.querySelector('[data-node-id="0"]')
      if (!element) return false
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return true
    })()`)
    if (!manualNodeSelected)
      throw new Error('Plan node was not rendered by JointJS')
    await sleep(100)
    const manualSelection = await win.webContents.executeJavaScript(`({
      selectedNodeId: document.querySelector('[aria-label="Execution plan diagram"]').dataset.selectedNodeId,
      highlightedNodeIds: document.querySelector('[aria-label="Execution plan diagram"]').dataset.highlightedNodeIds,
      activeHint: [...document.querySelectorAll('[aria-label="Performance hints"] button')].some((button) => button.textContent?.includes('Join cardinality is underestimated') && button.getAttribute('aria-pressed') === 'true'),
      hasSignals: Boolean(document.querySelector('[aria-label="Plan node details"] [aria-label="Plan signals"]'))
    })`)
    if (
      manualSelection.selectedNodeId !== '0.2' ||
      !manualSelection.activeHint ||
      manualSelection.highlightedNodeIds.split(',').length !== 2 ||
      manualSelection.hasSignals
    )
      throw new Error(
        `Manual graph selection did not update the inspector while preserving the AI hint: ${JSON.stringify(manualSelection)}`,
      )

    previewStep = 'second AI hint selection'
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('[aria-label="Performance hints"] button')].find((button) => button.textContent?.includes('Review the date filter selectivity'))?.click()`,
    )
    const secondHintSelection = await win.webContents.executeJavaScript(`({
      selectedNodeId: document.querySelector('[aria-label="Execution plan diagram"]').dataset.selectedNodeId,
      highlightedNodeIds: document.querySelector('[aria-label="Execution plan diagram"]').dataset.highlightedNodeIds,
      selectedHint: [...document.querySelectorAll('[aria-label="Performance hints"] button')].some((button) => button.textContent?.includes('Review the date filter selectivity') && button.getAttribute('aria-pressed') === 'true'),
      hasSignals: Boolean(document.querySelector('[aria-label="Plan node details"] [aria-label="Plan signals"]'))
    })`)
    if (
      secondHintSelection.selectedNodeId !== '0.0.0.0.0' ||
      secondHintSelection.highlightedNodeIds !== '0.0.0.0.0' ||
      !secondHintSelection.selectedHint ||
      secondHintSelection.hasSignals
    )
      throw new Error(
        `AI hint selection did not focus its plan node: ${JSON.stringify(secondHintSelection)}`,
      )

    previewStep = 'plan replacement cancellation'
    delayPlanResponse = true
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('[aria-label="Performance hints"] button')].find((button) => button.textContent?.trim() === 'Run again')?.click()`,
    )
    for (let attempt = 0; attempt < 50 && !pendingPlanResponse; attempt += 1)
      await sleep(50)
    if (!pendingPlanResponse)
      throw new Error(
        'Plan replacement preview did not start the delayed request',
      )
    await win.webContents.executeJavaScript(`(() => {
      const store = window.__datakoalaStore
      const session = store.getState().tabs.find((tab) => tab.id === store.getState().activeTabId)
      const nextTree = { id: '0', nodeType: 'Seq Scan', plan: 'replacement plan', relation: 'replacement', children: [] }
      store.getState().setExplain('replacement plan', session.id, {
        query: 'select * from replacement', mode: 'analyze', planningTimeMs: 0.2, executionTimeMs: 1
      }, nextTree)
    })()`)
    await wait(
      win,
      `[...document.querySelectorAll('[aria-label="Performance hints"] button')].some((button) => button.textContent?.trim() === 'Run analysis')`,
      'replacement plan state reset',
    )
    pendingPlanResponse()
    await sleep(200)
    const replacementReport = await win.webContents.executeJavaScript(`({
      oldHintVisible: document.body.innerText.includes('Join cardinality is underestimated'),
      replacementVisible: document.body.innerText.includes('replacement plan'),
      cancelCalls: ${cancelledPlanRequests}
    })`)
    if (
      replacementReport.oldHintVisible ||
      !replacementReport.replacementVisible ||
      replacementReport.cancelCalls < 1
    )
      throw new Error(
        `Late EXPLAIN analysis response was not isolated from the replacement plan: ${JSON.stringify(replacementReport)}`,
      )
    app.exit(0)
  } catch (error) {
    console.error(`EXPLAIN preview failed during: ${previewStep}`)
    console.error(error)
    app.exit(1)
  }
})
