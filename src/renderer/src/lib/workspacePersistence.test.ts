import compatibilityFixtures from './fixtures/workspace-compatibility.json'
import { legacyPromqlFilters } from './workspaceMigrations.ts'
import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'
import { workspaceRestorePatch } from './workspaceRestoration.ts'
import type { ResultFilter } from './resultFilters.ts'
import { defaultTempoBuilder } from './tempoQueryState.ts'
import { buildLokiQuery } from '@shared/loki-builder'
import { buildLokiTrendExpressions } from '@shared/loki-trend'
import {
  LEGACY_WORKSPACE_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
  parseWorkspaceDraft,
  readWorkspaceDraft,
  restoreWorkspaceDraft,
  serializeWorkspaceDraft,
  startWorkspacePersistence,
  workspaceDraftFromState,
  type QuerySessionDraft,
  type WorkspacePersistableState,
  type WorkspaceRestorePatch,
  type WorkspaceStorage,
} from './workspacePersistence.ts'

class MemoryStorage implements WorkspaceStorage {
  values = new Map<string, string>()
  writes = 0
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.writes++
    this.values.set(key, value)
  }
}

class FakeEventTarget {
  listeners = new Map<'beforeunload' | 'pagehide', Set<() => void>>()
  addEventListener(
    type: 'beforeunload' | 'pagehide',
    listener: () => void,
  ): void {
    const listeners = this.listeners.get(type) ?? new Set<() => void>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }
  removeEventListener(
    type: 'beforeunload' | 'pagehide',
    listener: () => void,
  ): void {
    this.listeners.get(type)?.delete(listener)
  }
  dispatch(type: 'beforeunload' | 'pagehide'): void {
    for (const listener of this.listeners.get(type) ?? []) listener()
  }
}

const promotedFilter = (): ResultFilter => ({
  id: 'promoted-country',
  column: 'country',
  operator: 'equals',
  value: 'FR',
  execution: 'query',
  provenance: {
    mode: 'builder',
    resultAlias: 'series',
    table: { schema: 'analytics', name: 'events' },
    sourceColumns: ['country'],
    sourceColumn: 'country',
    timeColumn: 'created_at',
    timeBucket: 'hour',
    sourceKind: 'single-column',
    targetKind: 'source-column',
    displayLabel: 'country',
  },
})
const clientFilter = (): ResultFilter => ({
  id: 'client-device',
  column: 'device',
  operator: 'equals',
  value: 'mobile',
  execution: 'client',
})

const tab = (
  id: string,
  title: string,
  connectionProfileId: string | null,
  sql: string,
) => ({
  id,
  title,
  connectionProfileId,
  sql,
  prometheusTimeRange: {
    kind: 'rolling' as const,
    amount: 1 as const,
    unit: 'hour' as const,
  },
  prometheusStep: '30s' as const,
  promqlBuilder: {
    metric: '',
    filterBy: [],
    groupBy: [],
    labelValues: {},
    calculation: 'raw' as const,
    aggregation: 'none' as const,
    window: '5m' as const,
    percentile: 0.95 as const,
  },
  lokiTimeRange:
    id === 'tab-b'
      ? {
          kind: 'rolling' as const,
          amount: 15 as const,
          unit: 'minute' as const,
        }
      : { kind: 'rolling' as const, amount: 3 as const, unit: 'hour' as const },
  lokiBuilder: {
    labelMatchers: [
      { label: 'service_name', operator: '=' as const, value: id },
    ],
    lineFilters: [{ operator: '|=' as const, value: 'error' }],
    parsers: [{ kind: 'json' as const }],
    fieldFilters: [],
  },
  lokiResultLimit: id === 'tab-b' ? 250 : 1000,
  lokiResultView: id === 'tab-b' ? ('line' as const) : ('list' as const),
  lokiGroupBy: ['service_name'],
  tempoBuilder: {
    ...defaultTempoBuilder(),
    service: id,
    advancedFilters: [
      {
        attribute: 'resource.cluster',
        scope: 'resource' as const,
        mode: 'include' as const,
        values: [id],
      },
    ],
  },
  tempoTimeRange:
    id === 'tab-b'
      ? {
          kind: 'rolling' as const,
          amount: 30 as const,
          unit: 'minute' as const,
        }
      : { kind: 'rolling' as const, amount: 6 as const, unit: 'hour' as const },
  tempoSampleSize: id === 'tab-b' ? ('500' as const) : ('100' as const),
  tempoResultView:
    id === 'tab-b' ? ('scatter' as const) : ('service-map' as const),
  running: true,
  queryError: 'runtime-error-secret',
  repairableQueryError: {
    query: 'SELECT repair-runtime-secret',
    error: 'repair-error-runtime-secret',
  },
  result: {
    columns: [],
    rows: [{ token: 'result-secret' }],
    rowCount: 1,
    durationMs: 1,
  },
  pendingResult: {
    columns: [],
    rows: [{ token: 'pending-secret' }],
    rowCount: 1,
    durationMs: 1,
  },
  resultRevision: 8,
  lastSuccessfulResultRevision: 7,
  isResultStale: true,
  queryMode: id === 'tab-b' ? ('sql' as const) : ('builder' as const),
  builder: {
    table: { schema: 'analytics', name: 'events' },
    timeColumn: 'created_at',
    timeBucket: 'hour' as const,
    seriesColumns: ['country', 'device'],
    timeRange: {
      kind: 'custom' as const,
      startDate: '2026-08-01',
      startTime: '08:00',
      endDate: '2026-08-02',
      endTime: '18:00',
      recurringWindows: [{ id: 'workday', from: '09:00', to: '17:00' }],
    },
  },
  builderHasRun: true,
  sqlVisualization: {
    view: 'bar' as const,
    xColumn: 'created_at',
    valueColumn: 'amount',
    aggregation: 'sum' as const,
    seriesColumn: null,
    seriesColumns: ['country', 'device'],
    valueAxisScale: 'log' as const,
  },
  builderVisualization: {
    view: 'line' as const,
    xColumn: 'created_at',
    valueColumn: null,
    aggregation: 'count' as const,
    seriesColumn: null,
    seriesColumns: ['country', 'device'],
    hierarchyDimensions: ['device', 'country'],
    valueAxisScale: 'linear' as const,
  },
  sqlResultFilters: [clientFilter()],
  builderResultFilters: [promotedFilter(), clientFilter()],
  queryFilterRevision: { sql: 3, builder: 4 },
  builderFilterNotice: { id: 4, message: 'runtime-notice-secret' },
  explainSnapshot: { query: 'snapshot-secret', mode: 'explain' as const },
  explainText: 'explain-secret',
  explainTree: {
    id: '0',
    plan: 'Seq Scan · public.secret_orders',
    nodeType: 'Seq Scan',
    relation: 'secret_orders',
    schema: 'public',
  },
  showExplain: true,
  activeExplainRequest: 'analyze' as const,
  seriesVisibility: { FR: false },
})

const state = (): WorkspacePersistableState => ({
  activeTabId: 'tab-b',
  tabs: [
    tab('tab-a', 'Orders by country', 'prod', 'select * from orders;'),
    tab('tab-b', 'Scratch', 'analytics', 'select 42;'),
  ],
})

for (const label of ['level', 'severity', 'log_level'])
  test(`workspace preserves indexed ${label} grouping and independent filtering`, () => {
    for (const levels of [[], ['ERROR', 'WARN']]) {
      const current = state()
      current.tabs[0].lokiGroupBy = [
        label,
        'service_name',
        'missing_saved_label',
      ]
      current.tabs[0].lokiBuilder = {
        labelMatchers: [
          { label: 'service_name', operator: '=', value: 'checkout' },
          ...(levels.length
            ? [{ label, operator: '=~' as const, value: '', values: levels }]
            : []),
        ],
        lineFilters: [],
        parsers: [],
        fieldFilters: [],
      }
      const restored = parseWorkspaceDraft(serializeWorkspaceDraft(current))
      assert.ok(restored)
      const result = restored.tabs[0]
      assert.deepEqual(result.lokiGroupBy, current.tabs[0].lokiGroupBy)
      assert.deepEqual(result.lokiBuilder, current.tabs[0].lokiBuilder)
      const expression = levels.length
        ? `{service_name="checkout", ${label}=~"(?i)^(?:ERROR|WARN)$"}`
        : '{service_name="checkout"}'
      assert.equal(
        buildLokiTrendExpressions(
          buildLokiQuery(result.lokiBuilder),
          '30s',
          result.lokiGroupBy,
          'logs',
        )?.trend,
        `sum by (${label}, service_name, missing_saved_label) (count_over_time((${expression})[30s]))`,
      )
    }
  })

const categoricalState = (): WorkspacePersistableState => {
  const current = tab('tab-category', 'Count by status', 'prod', 'select 1;')
  return {
    activeTabId: current.id,
    tabs: [
      {
        ...current,
        builder: {
          table: { schema: 'analytics', name: 'events' },
          timeColumn: 'created_at',
          timeBucket: 'minute' as const,
          timeRange: {
            kind: 'rolling' as const,
            amount: 7,
            unit: 'day' as const,
          },
          seriesColumns: ['region'],
        },
        builderVisualization: {
          view: 'bar' as const,
          xColumn: 'status',
          valueColumn: null,
          aggregation: 'count' as const,
          seriesColumn: null,
          seriesColumns: ['region'],
          valueAxisScale: 'linear' as const,
        },
        builderResultFilters: [],
      },
    ],
  }
}

test('workspace persistence keeps an exact ten-day rolling Builder range', () => {
  const current = state()
  current.tabs[0].builder.timeRange = {
    kind: 'rolling',
    amount: 10,
    unit: 'day',
  }
  const restored = parseWorkspaceDraft(serializeWorkspaceDraft(current))
  assert.ok(restored)
  assert.deepEqual(restored.tabs[0].builder.timeRange, {
    kind: 'rolling',
    amount: 10,
    unit: 'day',
  })
})

test('workspace v2 round-trips ordered tabs, names, connection references and axis-first drafts', () => {
  const restored = parseWorkspaceDraft(serializeWorkspaceDraft(state()))
  assert.ok(restored)
  assert.equal(restored.activeTabId, 'tab-b')
  assert.deepEqual(
    restored.tabs.map(({ id, title, connectionProfileId, sql, queryMode }) => ({
      id,
      title,
      connectionProfileId,
      sql,
      queryMode,
    })),
    [
      {
        id: 'tab-a',
        title: 'Orders by country',
        connectionProfileId: 'prod',
        sql: 'select * from orders;',
        queryMode: 'builder',
      },
      {
        id: 'tab-b',
        title: 'Scratch',
        connectionProfileId: 'analytics',
        sql: 'select 42;',
        queryMode: 'sql',
      },
    ],
  )
  assert.equal(restored.tabs[0].builderVisualization.xColumn, 'created_at')
  assert.equal(restored.tabs[0].builderVisualization.aggregation, 'count')
  assert.equal(restored.tabs[0].builderVisualization.valueColumn, null)
  assert.deepEqual(restored.tabs[0].builder.seriesColumns, [
    'country',
    'device',
  ])
  assert.deepEqual(restored.tabs[0].builderVisualization.hierarchyDimensions, [
    'device',
    'country',
  ])
  assert.equal(restored.tabs[0].builderQueryFilters.length, 1)
  assert.equal(restored.tabs[0].builderQueryFilters[0].execution, 'query')
  assert.deepEqual(restored.tabs[0].lokiTimeRange, {
    kind: 'rolling',
    amount: 3,
    unit: 'hour',
  })
  assert.equal(restored.tabs[1].lokiResultLimit, 250)
  assert.equal(restored.tabs[1].lokiBuilder.labelMatchers[0].value, 'tab-b')
  assert.deepEqual(restored.tabs[1].lokiGroupBy, ['service_name'])
  assert.equal(restored.tabs[0].tempoBuilder.service, 'tab-a')
  assert.deepEqual(restored.tabs[0].tempoBuilder.advancedFilters[0], {
    attribute: 'resource.cluster',
    scope: 'resource',
    mode: 'include',
    values: ['tab-a'],
  })
  assert.deepEqual(restored.tabs[1].tempoTimeRange, {
    kind: 'rolling',
    amount: 30,
    unit: 'minute',
  })
  assert.equal(restored.tabs[1].tempoSampleSize, '500')
  assert.equal(restored.tabs[1].tempoResultView, 'scatter')
})

test('older and malformed Tempo drafts restore independent standard defaults', () => {
  const raw = JSON.parse(serializeWorkspaceDraft(state())) as {
    tabs: Record<string, unknown>[]
  }
  delete raw.tabs[0].tempoBuilder
  delete raw.tabs[0].tempoTimeRange
  delete raw.tabs[0].tempoSampleSize
  delete raw.tabs[0].tempoResultView
  raw.tabs[1].tempoBuilder = { service: 42 }
  raw.tabs[1].tempoTimeRange = { kind: 'rolling', amount: 17, unit: 'minutes' }
  raw.tabs[1].tempoSampleSize = 'unlimited'
  raw.tabs[1].tempoResultView = 'chart'

  const restored = parseWorkspaceDraft(JSON.stringify(raw))
  assert.ok(restored)
  for (const restoredTab of restored.tabs) {
    assert.deepEqual(restoredTab.tempoBuilder, defaultTempoBuilder())
    assert.deepEqual(restoredTab.tempoTimeRange, {
      kind: 'rolling',
      amount: 1,
      unit: 'hour',
    })
    assert.equal(restoredTab.tempoSampleSize, '250')
    assert.equal(restoredTab.tempoResultView, 'list')
  }
  assert.notEqual(restored.tabs[0].tempoBuilder, restored.tabs[1].tempoBuilder)
  assert.notEqual(
    restored.tabs[0].tempoBuilder.advancedFilters,
    restored.tabs[1].tempoBuilder.advancedFilters,
  )
})

test('categorical X persists its independent time filter but no hidden Time bucket', () => {
  const serialized = serializeWorkspaceDraft(categoricalState())
  const envelope = JSON.parse(serialized) as {
    tabs: Array<{ builder: Record<string, unknown> }>
  }
  const persistedBuilder = envelope.tabs[0].builder
  assert.equal(persistedBuilder.xColumn, 'status')
  assert.equal(persistedBuilder.timeColumn, 'created_at')
  assert.equal('timeBucket' in persistedBuilder, false)
  assert.deepEqual(persistedBuilder.timeRange, {
    kind: 'rolling',
    amount: 7,
    unit: 'day',
  })

  const restored = parseWorkspaceDraft(serialized)
  assert.ok(restored)
  assert.equal(restored.tabs[0].builder.timeColumn, 'created_at')
  assert.equal(restored.tabs[0].builder.timeBucket, 'day')
  assert.deepEqual(restored.tabs[0].builder.timeRange, {
    kind: 'rolling',
    amount: 7,
    unit: 'day',
  })
  assert.equal(restored.tabs[0].builderVisualization.xColumn, 'status')
})

test('temporal X persists explicit axis, time-filter source, range, and bucket', () => {
  const envelope = JSON.parse(serializeWorkspaceDraft(state())) as {
    tabs: Array<{ builder: Record<string, unknown> }>
  }
  const persistedBuilder = envelope.tabs[0].builder
  assert.equal(persistedBuilder.xColumn, 'created_at')
  assert.equal(persistedBuilder.timeColumn, 'created_at')
  assert.equal(persistedBuilder.timeBucket, 'hour')
  assert.deepEqual(
    persistedBuilder.timeRange,
    state().tabs[0].builder.timeRange,
  )
})

test('workspace serialization is allow-listed: no credentials, results, client filters or runtime state', () => {
  const unsafe = {
    ...state(),
    profiles: [
      { id: 'prod', host: 'db', user: 'alice', password: 'do-not-persist' },
    ],
  }
  const serialized = serializeWorkspaceDraft(unsafe)
  const envelope = JSON.parse(serialized) as Record<string, unknown>
  assert.deepEqual(Object.keys(envelope).sort(), [
    'activeTabId',
    'tabs',
    'version',
  ])
  for (const forbidden of [
    'do-not-persist',
    'result-secret',
    'pending-secret',
    'runtime-error-secret',
    'repair-runtime-secret',
    'repair-error-runtime-secret',
    'client-device',
    'mobile',
    'explain-secret',
    'runtime-notice-secret',
    'seriesVisibility',
    'lokiDisplayDirection',
    'profiles',
  ]) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `workspace blob must not contain ${forbidden}`,
    )
  }
  assert.equal(serialized.includes('"execution":"query"'), true)
})

test('restore rebuilds every tab cold without reconnecting or replaying results', () => {
  const storage = new MemoryStorage()
  storage.setItem(WORKSPACE_STORAGE_KEY, serializeWorkspaceDraft(state()))
  const patches: WorkspaceRestorePatch[] = []
  const restored = restoreWorkspaceDraft((next) => patches.push(next), storage)
  const patch = patches[0]
  assert.ok(restored && patch)
  assert.equal(patch.activeTabId, 'tab-b')
  assert.deepEqual(
    Object.keys(patch).sort(),
    ['activeTabId', 'tabs'],
    'saved profile IDs stay on tabs; no connection becomes live during restore',
  )
  assert.equal(patch.tabs.length, 2)
  for (const restoredTab of patch.tabs) {
    assert.equal(restoredTab.running, false)
    assert.equal(restoredTab.result, null)
    assert.equal(restoredTab.pendingResult, null)
    assert.equal(restoredTab.queryError, null)
    assert.equal(restoredTab.repairableQueryError, null)
    assert.equal(restoredTab.builderHasRun, false)
    assert.deepEqual(restoredTab.sqlResultFilters, [])
    assert.equal(
      restoredTab.builderResultFilters.every(
        (filter) => filter.execution === 'query',
      ),
      true,
    )
    assert.equal(restoredTab.explainText, null)
    assert.equal(restoredTab.explainTree, null)
    assert.deepEqual(restoredTab.seriesVisibility, {})
  }
})

test('legacy v1 time-first workspace migrates into one canonical source-axis tab', () => {
  const storage = new MemoryStorage()
  const legacyTab = state().tabs[0]
  const legacy = {
    version: 1,
    draft: {
      queryMode: 'sql',
      sql: 'select legacy;',
      builder: legacyTab.builder,
      sqlVisualization: legacyTab.sqlVisualization,
      builderVisualization: {
        ...legacyTab.builderVisualization,
        xColumn: 'time_bucket',
        valueColumn: 'count',
        aggregation: 'sum',
        seriesColumn: 'series',
      },
    },
  }
  storage.setItem(LEGACY_WORKSPACE_STORAGE_KEY, JSON.stringify(legacy))
  const restored = readWorkspaceDraft(storage)
  assert.ok(restored)
  assert.equal(restored.tabs.length, 1)
  assert.equal(restored.tabs[0].title, 'Query 1')
  assert.equal(restored.tabs[0].connectionProfileId, null)
  assert.equal(restored.tabs[0].sql, 'select legacy;')
  assert.equal(restored.tabs[0].builderVisualization.xColumn, 'created_at')
  assert.equal(restored.tabs[0].builderVisualization.valueColumn, null)
  assert.equal(restored.tabs[0].builderVisualization.aggregation, 'count')
  assert.deepEqual(
    restored.tabs[0].builder.timeRange,
    legacyTab.builder.timeRange,
  )
})

test('pre-axis-first v2 workspace with no Builder xColumn remains readable', () => {
  const envelope = JSON.parse(serializeWorkspaceDraft(state())) as {
    activeTabId: string
    tabs: any[]
    version: number
  }
  const legacy = envelope.tabs[0]
  legacy.builder = {
    table: { schema: 'analytics', name: 'events' },
    timeColumn: 'created_at',
    timeBucket: 'hour',
    seriesColumns: ['country', 'device'],
    timeRange: { kind: 'rolling', amount: 7, unit: 'day' },
  }
  legacy.builderVisualization = {
    view: 'line',
    xColumn: 'time_bucket',
    valueColumn: 'count',
    aggregation: 'sum',
    seriesColumn: 'series',
    seriesColumns: ['country', 'device'],
    valueAxisScale: 'linear',
  }
  envelope.tabs = [legacy]
  envelope.activeTabId = legacy.id
  const restored = parseWorkspaceDraft(JSON.stringify(envelope))
  assert.ok(restored)
  assert.equal(restored.tabs[0].builder.timeColumn, 'created_at')
  assert.equal(restored.tabs[0].builderVisualization.xColumn, 'created_at')
  assert.equal(restored.tabs[0].builderVisualization.aggregation, 'count')
  assert.equal(restored.tabs[0].builder.timeRange?.kind, 'rolling')
})

test('early axis-first v2 workspace infers temporal filter source when timeColumn was omitted', () => {
  const envelope = JSON.parse(serializeWorkspaceDraft(state())) as {
    activeTabId: string
    tabs: any[]
    version: number
  }
  const draft = envelope.tabs[0]
  draft.builder = {
    table: { schema: 'analytics', name: 'events' },
    xColumn: 'created_at',
    timeBucket: 'hour',
    seriesColumns: ['country'],
    timeRange: { kind: 'rolling', amount: 7, unit: 'day' },
  }
  draft.builderVisualization = {
    ...draft.builderVisualization,
    xColumn: 'created_at',
  }
  envelope.tabs = [draft]
  envelope.activeTabId = draft.id
  const restored = parseWorkspaceDraft(JSON.stringify(envelope))
  assert.ok(restored)
  assert.equal(restored.tabs[0].builder.timeColumn, 'created_at')
  assert.equal(restored.tabs[0].builderVisualization.xColumn, 'created_at')
  assert.equal(restored.tabs[0].builder.timeBucket, 'hour')
})

test('invalid, duplicate or incompatible persisted state fails closed and stale Minute semantics normalize', () => {
  assert.equal(parseWorkspaceDraft('{broken'), null)
  assert.equal(
    parseWorkspaceDraft(
      JSON.stringify({ version: 2, activeTabId: 'x', tabs: [] }),
    ),
    null,
  )
  const envelope = JSON.parse(serializeWorkspaceDraft(state())) as {
    activeTabId: string
    tabs: any[]
    version: number
  }
  envelope.tabs[1].id = envelope.tabs[0].id
  assert.equal(parseWorkspaceDraft(JSON.stringify(envelope)), null)

  const malformedLokiRange = JSON.parse(serializeWorkspaceDraft(state())) as {
    tabs: any[]
  }
  malformedLokiRange.tabs[0].lokiTimeRange = {
    kind: 'rolling',
    amount: 17,
    unit: 'minutes',
  }
  assert.equal(parseWorkspaceDraft(JSON.stringify(malformedLokiRange)), null)

  const minute = JSON.parse(serializeWorkspaceDraft(state())) as {
    activeTabId: string
    tabs: any[]
    version: number
  }
  minute.tabs[0].builder.timeRange = { kind: 'rolling', amount: 7, unit: 'day' }
  minute.tabs[0].builder.timeBucket = 'minute'
  assert.equal(
    parseWorkspaceDraft(JSON.stringify(minute))?.tabs[0].builder.timeBucket,
    'hour',
  )
})

test('automatic persistence debounces edits, ignores runtime-only churn and flushes on page hide', () => {
  vi.useFakeTimers()
  const storage = new MemoryStorage()
  const target = new FakeEventTarget()
  let current = state()
  storage.values.set(WORKSPACE_STORAGE_KEY, serializeWorkspaceDraft(current))
  const listeners = new Set<(next: WorkspacePersistableState) => void>()
  const stop = startWorkspacePersistence(
    () => current,
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    { storage, target, delayMs: 1 },
  )

  current = {
    ...current,
    tabs: current.tabs.map((item, index) =>
      index === 0 ? { ...item, resultRevision: item.resultRevision + 1 } : item,
    ),
  }
  for (const listener of listeners) listener(current)
  vi.advanceTimersByTime(1)
  assert.equal(storage.writes, 0)

  current = {
    ...current,
    tabs: current.tabs.map((item, index) =>
      index === 0 ? { ...item, sql: 'select changed;' } : item,
    ),
  }
  for (const listener of listeners) listener(current)
  vi.advanceTimersByTime(1)
  assert.equal(storage.writes, 1)
  assert.equal(readWorkspaceDraft(storage)?.tabs[0].sql, 'select changed;')

  current = {
    ...current,
    tabs: current.tabs.map((item, index) =>
      index === 1 ? { ...item, title: 'Renamed scratch' } : item,
    ),
  }
  for (const listener of listeners) listener(current)
  target.dispatch('pagehide')
  assert.equal(readWorkspaceDraft(storage)?.tabs[1].title, 'Renamed scratch')

  stop()
  assert.equal(listeners.size, 0)
})

test('Loki value selections persist and legacy chart view migrates to line', () => {
  const raw = JSON.parse(serializeWorkspaceDraft(state()))
  raw.tabs[0].lokiResultView = 'chart'
  raw.tabs[0].lokiBuilder.labelMatchers[0] = {
    label: 'level',
    operator: '=~',
    value: '',
    values: ['ERROR', 'WARN', 'ERROR'],
  }
  const restored = parseWorkspaceDraft(JSON.stringify(raw))
  assert.equal(restored?.tabs[0].lokiResultView, 'line')
  assert.deepEqual(restored?.tabs[0].lokiBuilder.labelMatchers[0], {
    label: 'level',
    operator: '=~',
    value: '',
    values: ['ERROR', 'WARN'],
  })
})

test('persists the Loki patterns view and rejects invalid legacy views', () => {
  const raw = JSON.parse(serializeWorkspaceDraft(state()))
  raw.tabs[0].lokiResultView = 'patterns'
  assert.equal(
    parseWorkspaceDraft(JSON.stringify(raw))?.tabs[0].lokiResultView,
    'patterns',
  )
  raw.tabs[0].lokiResultView = 'unknown-view'
  assert.equal(
    parseWorkspaceDraft(JSON.stringify(raw))?.tabs[0].lokiResultView,
    'list',
  )
})

test('migrates the legacy single Loki breakdown to ordered Group by state', () => {
  const raw = JSON.parse(serializeWorkspaceDraft(state()))
  delete raw.tabs[0].lokiGroupBy
  raw.tabs[0].lokiBreakdown = 'level'
  const restored = parseWorkspaceDraft(JSON.stringify(raw))
  assert.deepEqual(restored?.tabs[0].lokiGroupBy, ['level'])
})

test('display units round-trip through workspace persistence', () => {
  const input = state()
  input.tabs[0].sqlVisualization = {
    ...input.tabs[0].sqlVisualization,
    displayUnit: { family: 'time', unit: 'min' },
  }
  const restored = parseWorkspaceDraft(serializeWorkspaceDraft(input))
  assert.deepEqual(restored?.tabs[0].sqlVisualization.displayUnit, {
    family: 'time',
    unit: 'min',
  })
  assert.equal(restored?.tabs[1].sqlVisualization.displayUnit, undefined)
})

test('obsolete Loki range history is ignored without changing the saved query range', () => {
  const raw = JSON.parse(serializeWorkspaceDraft(state()))
  raw.tabs[0].lokiRangeHistory = [{ kind: 'all' }]
  raw.tabs[1].lokiRangeHistory = { malformed: true }
  const restored = parseWorkspaceDraft(JSON.stringify(raw))
  assert.ok(restored)
  assert.deepEqual(restored.tabs[0].lokiTimeRange, raw.tabs[0].lokiTimeRange)
  for (const tab of restored.tabs)
    assert.equal('lokiRangeHistory' in tab, false)
  assert.equal(
    serializeWorkspaceDraft(state()).includes('lokiRangeHistory'),
    false,
  )
})

// #371: renderer promises/progress subscriptions cannot be reattached on reload.
test('restoration clears unobservable pending work for every datasource kind', () => {
  for (const kind of [
    'postgres',
    'bigquery',
    'local-files',
    'sqlite-file',
    'prometheus',
    'loki',
    'tempo',
  ]) {
    const raw = JSON.parse(serializeWorkspaceDraft(state())) as {
      tabs: Record<string, unknown>[]
    }
    raw.tabs[0].connectionProfileId = `audit-${kind}`
    raw.tabs[0].queryOperation = {
      tabId: raw.tabs[0].id,
      profileId: 'loki',
      generation: 1,
      token: 'unobservable',
    }
    raw.tabs[0].explainOperation = {
      ...(raw.tabs[0].queryOperation as object),
      slot: 'explain',
      token: 'explain-unobservable',
    }
    raw.tabs[0].pendingQueryOperations = [
      'unobservable',
      'explain-unobservable',
    ]
    raw.tabs[0].queryContextId = 'old-runtime-context'
    raw.tabs[0].running = true
    raw.tabs[0].activeExplainRequest = 'analyze'
    raw.tabs[0].pendingResult = { rows: [{ obsolete: true }] }
    const storage = new MemoryStorage()
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(raw))
    const patches: WorkspaceRestorePatch[] = []
    restoreWorkspaceDraft((patch) => patches.push(patch), storage)
    const restored = patches[0]
    assert.ok(restored)
    assert.equal(restored.tabs[0].connectionProfileId, `audit-${kind}`)
    assert.equal(restored.tabs[0].queryOperation ?? null, null)
    assert.equal(restored.tabs[0].explainOperation ?? null, null)
    assert.deepEqual(restored.tabs[0].pendingQueryOperations ?? [], [])
    assert.notEqual(restored.tabs[0].queryContextId, 'old-runtime-context')
    assert.equal(restored.tabs[0].running, false)
    assert.equal(restored.tabs[0].activeExplainRequest, null)
    assert.equal(restored.tabs[0].pendingResult, null)
  }
})

// Captured from main c5fc56b before extraction, using the existing state fixture.
for (const fixture of compatibilityFixtures) {
  test(`baseline compatibility: ${fixture.name}`, () => {
    const storage = new MemoryStorage()
    const key = fixture.name.endsWith('v1')
      ? LEGACY_WORKSPACE_STORAGE_KEY
      : WORKSPACE_STORAGE_KEY
    storage.values.set(key, fixture.raw)
    const draft = readWorkspaceDraft(storage)
    assert.deepEqual(JSON.parse(JSON.stringify(draft)), fixture.expected)
    const patches: WorkspaceRestorePatch[] = []
    restoreWorkspaceDraft((patch) => patches.push(patch), storage)
    const patch = patches[0]
    if (patch) {
      for (const tab of patch.tabs) tab.queryContextId = 'fresh-context'
      assert.deepEqual(JSON.parse(JSON.stringify(patch)), fixture.restored)
      assert.equal(serializeWorkspaceDraft(patch), fixture.serialized)
      const restoredAgain = parseWorkspaceDraft(serializeWorkspaceDraft(patch))
      assert.deepEqual(
        JSON.parse(JSON.stringify(restoredAgain)),
        fixture.reparsed,
      )
    } else assert.equal(fixture.restored, null)
    assert.equal(storage.values.get(key), fixture.raw)
  })
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child)
    Object.freeze(value)
  }
  return value
}

test('serialization and historical normalization do not mutate frozen inputs', () => {
  const input = freezeDeep(state())
  const before = JSON.stringify(input)
  serializeWorkspaceDraft(input)
  const drafts: QuerySessionDraft[] = workspaceDraftFromState(input).tabs
  assert.equal(drafts[0].id, input.tabs[0].id)
  assert.equal(JSON.stringify(input), before)
  const filters = freezeDeep([
    { label: 'env', values: ['prod', 'prod'] },
    { label: 'service', operator: '=', value: 'api' },
  ])
  const filtersBefore = JSON.stringify(filters)
  assert.deepEqual(legacyPromqlFilters(filters), [
    { label: 'env', values: ['prod'] },
    { label: 'service', values: ['api'] },
  ])
  assert.equal(JSON.stringify(filters), filtersBefore)
})

test('empty serialization and storage fallback keep the existing recovery contract', () => {
  assert.equal(
    serializeWorkspaceDraft({ activeTabId: 'absent', tabs: [] }),
    '{"version":2,"activeTabId":"","tabs":[]}',
  )
  const storage = new MemoryStorage()
  storage.values.set(WORKSPACE_STORAGE_KEY, '{broken')
  const legacy = compatibilityFixtures.find(
    (fixture) => fixture.name === 'legacy-v1',
  )!
  storage.values.set(LEGACY_WORKSPACE_STORAGE_KEY, legacy.raw)
  assert.deepEqual(
    JSON.parse(JSON.stringify(readWorkspaceDraft(storage))),
    legacy.expected,
  )
  storage.values.set(
    WORKSPACE_STORAGE_KEY,
    compatibilityFixtures.find((fixture) => fixture.name === 'future')!.raw,
  )
  assert.deepEqual(
    JSON.parse(JSON.stringify(readWorkspaceDraft(storage))),
    legacy.expected,
  )
  storage.values.set(WORKSPACE_STORAGE_KEY, serializeWorkspaceDraft(state()))
  assert.equal(readWorkspaceDraft(storage)?.activeTabId, 'tab-b')
})

test('current live-session serialization matches pre-extraction bytes', () => {
  const current = compatibilityFixtures.find(
    (fixture) => fixture.name === 'current-v2',
  )!
  assert.equal(serializeWorkspaceDraft(state()), current.raw)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test('unavailable browser storage leaves startup cold and does not subscribe', () => {
  for (const browser of [
    undefined,
    Object.defineProperty({}, 'localStorage', {
      get() {
        throw new Error('disabled')
      },
    }),
  ]) {
    vi.stubGlobal('window', browser)
    const apply = vi.fn()
    const subscribe = vi.fn()
    const getState = vi.fn(state)
    assert.equal(readWorkspaceDraft(), null)
    assert.equal(restoreWorkspaceDraft(apply), null)
    startWorkspacePersistence(getState, subscribe)()
    assert.equal(apply.mock.calls.length, 0)
    assert.equal(subscribe.mock.calls.length, 0)
    assert.equal(getState.mock.calls.length, 0)
  }
  const subscribe = vi.fn()
  startWorkspacePersistence(state, subscribe, { storage: null })()
  assert.equal(subscribe.mock.calls.length, 0)
})

test('read failures preserve ordered fallback and never write during restoration', () => {
  const legacy = compatibilityFixtures.find((f) => f.name === 'legacy-v1')!
  const reads: string[] = []
  const storage = {
    getItem(key: string) {
      reads.push(key)
      if (key === WORKSPACE_STORAGE_KEY) throw new Error('read blocked')
      return legacy.raw
    },
    setItem: vi.fn(),
  }
  const apply = vi.fn()
  assert.deepEqual(
    JSON.parse(JSON.stringify(restoreWorkspaceDraft(apply, storage))),
    legacy.expected,
  )
  assert.deepEqual(reads, [
    WORKSPACE_STORAGE_KEY,
    WORKSPACE_STORAGE_KEY,
    LEGACY_WORKSPACE_STORAGE_KEY,
  ])
  assert.equal(apply.mock.calls.length, 1)
  assert.equal(storage.setItem.mock.calls.length, 0)
  storage.getItem = (key) => {
    reads.push(key)
    throw new Error('all reads blocked')
  }
  assert.equal(restoreWorkspaceDraft(apply, storage), null)
  assert.equal(apply.mock.calls.length, 1)
})

test('same-key retry and valid current snapshot retain precedence over v1', () => {
  const current = compatibilityFixtures.find((f) => f.name === 'current-v2')!
  const legacy = compatibilityFixtures.find((f) => f.name === 'legacy-v1')!
  const reads: string[] = []
  const storage = {
    getItem(key: string) {
      reads.push(key)
      if (reads.length === 1) return '{broken'
      return key === WORKSPACE_STORAGE_KEY ? current.raw : legacy.raw
    },
    setItem: vi.fn(),
  }
  assert.deepEqual(
    JSON.parse(JSON.stringify(readWorkspaceDraft(storage))),
    current.expected,
  )
  assert.deepEqual(reads, [WORKSPACE_STORAGE_KEY, WORKSPACE_STORAGE_KEY])
})

for (const failure of [
  new Error('write disabled'),
  new DOMException('quota', 'QuotaExceededError'),
]) {
  test(`failed write retries on subsequent edit or lifecycle flush: ${failure.name}`, () => {
    vi.useFakeTimers()
    let current = state()
    const values = new Map([
      [WORKSPACE_STORAGE_KEY, serializeWorkspaceDraft(current)],
    ])
    let failing = true
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => {
        if (failing) throw failure
        values.set(key, value)
      }),
    }
    const target = new FakeEventTarget()
    const listeners = new Set<(next: WorkspacePersistableState) => void>()
    const stop = startWorkspacePersistence(
      () => current,
      (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      { storage, target },
    )
    current = { ...current, activeTabId: 'tab-a' }
    const edit = () => {
      for (const listener of listeners) listener(current)
    }
    edit()
    vi.advanceTimersByTime(150)
    assert.equal(storage.setItem.mock.calls.length, 1)
    assert.equal(readWorkspaceDraft(storage)?.activeTabId, 'tab-b')
    vi.advanceTimersByTime(1000)
    assert.equal(storage.setItem.mock.calls.length, 1) // No autonomous retry.
    edit()
    vi.advanceTimersByTime(150)
    assert.equal(storage.setItem.mock.calls.length, 2)
    failing = false
    target.dispatch('beforeunload')
    assert.equal(storage.setItem.mock.calls.length, 3)
    assert.equal(readWorkspaceDraft(storage)?.activeTabId, 'tab-a')
    stop()
    assert.equal(storage.setItem.mock.calls.length, 3)
  })
}

test('default debounce coalesces latest state, flush cancels timers and disposal removes listeners', () => {
  vi.useFakeTimers()
  let current = state()
  const storage = new MemoryStorage()
  const target = new FakeEventTarget()
  const listeners = new Set<(next: WorkspacePersistableState) => void>()
  const stop = startWorkspacePersistence(
    () => current,
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    { storage, target },
  )
  const edit = (sql: string) => {
    current = {
      ...current,
      tabs: current.tabs.map((tab, index) =>
        index === 0 ? { ...tab, sql } : tab,
      ),
    }
    for (const listener of listeners) listener(current)
  }
  assert.equal(storage.writes, 0) // No startup rewrite.
  edit('first')
  vi.advanceTimersByTime(149)
  edit('latest')
  vi.advanceTimersByTime(149)
  assert.equal(storage.writes, 0)
  vi.advanceTimersByTime(1)
  assert.equal(storage.writes, 1)
  assert.equal(readWorkspaceDraft(storage)?.tabs[0].sql, 'latest')
  edit('flush')
  target.dispatch('beforeunload')
  assert.equal(storage.writes, 2)
  assert.equal(vi.getTimerCount(), 0)
  target.dispatch('pagehide')
  assert.equal(storage.writes, 2)
  edit('dispose')
  stop()
  assert.equal(storage.writes, 3)
  assert.equal(readWorkspaceDraft(storage)?.tabs[0].sql, 'dispose')
  assert.equal(listeners.size, 0)
  assert.equal(vi.getTimerCount(), 0)
  for (const handlers of target.listeners.values())
    assert.equal(handlers.size, 0)
  current = { ...current, activeTabId: 'tab-a' }
  target.dispatch('pagehide')
  vi.advanceTimersByTime(1000)
  assert.equal(storage.writes, 3)
})

test('future input stays intact until the existing edit/flush write policy applies', () => {
  vi.useFakeTimers()
  const storage = new MemoryStorage()
  const future = compatibilityFixtures.find((f) => f.name === 'future')!.raw
  storage.values.set(WORKSPACE_STORAGE_KEY, future)
  const apply = vi.fn()
  assert.equal(restoreWorkspaceDraft(apply, storage), null)
  assert.equal(apply.mock.calls.length, 0)
  const target = new FakeEventTarget()
  const stop = startWorkspacePersistence(state, () => () => undefined, {
    storage,
    target,
  })
  vi.advanceTimersByTime(1000)
  assert.equal(storage.values.get(WORKSPACE_STORAGE_KEY), future)
  assert.equal(storage.writes, 0)
  target.dispatch('pagehide')
  assert.equal(
    storage.values.get(WORKSPACE_STORAGE_KEY),
    serializeWorkspaceDraft(state()),
  )
  stop()
})

test('cold transformation preserves validated drafts with fresh runtime identities on each allocation', () => {
  const draft = freezeDeep(
    parseWorkspaceDraft(serializeWorkspaceDraft(state()))!,
  )
  const before = JSON.stringify(draft)
  const first = workspaceRestorePatch(draft)
  const second = workspaceRestorePatch(draft)
  assert.equal(JSON.stringify(draft), before)
  assert.deepEqual(
    first.tabs.map((tab) => tab.id),
    draft.tabs.map((tab) => tab.id),
  )
  assert.equal(first.activeTabId, 'tab-b')
  for (let i = 0; i < first.tabs.length; i++) {
    assert.notEqual(first.tabs[i].queryContextId, second.tabs[i].queryContextId)
    assert.equal(
      first.tabs[i].connectionProfileId,
      draft.tabs[i].connectionProfileId,
    )
    assert.equal(first.tabs[i].running, false)
    assert.equal(first.tabs[i].result, null)
    assert.equal(first.tabs[i].explainText, null)
    assert.equal(first.tabs[i].activeExplainRequest, null)
  }
  assert.equal(
    workspaceRestorePatch({ ...draft, activeTabId: 'missing' }).activeTabId,
    draft.tabs[0].id,
  )
})

test('histogram override parsing preserves explicit values and ignores unknown optional values compatibly', () => {
  for (const value of [
    'auto',
    'classic',
    'native',
    undefined,
    null,
    '',
    'invalid',
    42,
    {},
    [],
  ]) {
    const raw = JSON.parse(serializeWorkspaceDraft(state()))
    raw.tabs[0].promqlBuilder.histogramKindOverride = value
    const parsed = parseWorkspaceDraft(JSON.stringify(raw))
    assert.ok(parsed)
    assert.equal(
      parsed.tabs[0].promqlBuilder.histogramKindOverride,
      ['classic', 'native'].includes(value as string) ? value : undefined,
    )
    assert.equal(parsed.tabs[0].connectionProfileId, 'prod')
    assert.equal(parsed.tabs[1].connectionProfileId, 'analytics')
  }
})
