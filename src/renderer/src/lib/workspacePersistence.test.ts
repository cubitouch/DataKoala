import assert from 'node:assert/strict'
import test from 'node:test'
import type { ResultFilter } from './resultFilters.ts'
import {
  LEGACY_WORKSPACE_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
  parseWorkspaceDraft,
  readWorkspaceDraft,
  restoreWorkspaceDraft,
  serializeWorkspaceDraft,
  startWorkspacePersistence,
  type WorkspacePersistableState,
  type WorkspaceRestorePatch,
  type WorkspaceStorage
} from './workspacePersistence.ts'

class MemoryStorage implements WorkspaceStorage {
  values = new Map<string, string>()
  writes = 0
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.writes++; this.values.set(key, value) }
}

class FakeEventTarget {
  listeners = new Map<'beforeunload' | 'pagehide', Set<() => void>>()
  addEventListener(type: 'beforeunload' | 'pagehide', listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set<() => void>(); listeners.add(listener); this.listeners.set(type, listeners)
  }
  removeEventListener(type: 'beforeunload' | 'pagehide', listener: () => void): void { this.listeners.get(type)?.delete(listener) }
  dispatch(type: 'beforeunload' | 'pagehide'): void { for (const listener of this.listeners.get(type) ?? []) listener() }
}

const promotedFilter = (): ResultFilter => ({
  id: 'promoted-country', column: 'country', operator: 'equals', value: 'FR', execution: 'query',
  provenance: {
    mode: 'builder', resultAlias: 'series', table: { schema: 'analytics', name: 'events' },
    sourceColumns: ['country'], sourceColumn: 'country', timeColumn: 'created_at', timeBucket: 'hour',
    sourceKind: 'single-column', targetKind: 'source-column', displayLabel: 'country'
  }
})
const clientFilter = (): ResultFilter => ({ id: 'client-device', column: 'device', operator: 'equals', value: 'mobile', execution: 'client' })

const tab = (id: string, title: string, connectionProfileId: string | null, sql: string) => ({
  id, title, connectionProfileId,
  sql,
  prometheusTimeRange: { kind: 'rolling' as const, amount: 1 as const, unit: 'hour' as const },
  prometheusStep: '30s' as const,
  promqlBuilder: { metric: '', filters: [], groupBy: [], calculation: 'raw' as const, aggregation: 'none' as const, window: '5m' as const, percentile: 0.95 as const },
  running: true,
  queryError: 'runtime-error-secret',
  result: { columns: [], rows: [{ token: 'result-secret' }], rowCount: 1, durationMs: 1 },
  pendingResult: { columns: [], rows: [{ token: 'pending-secret' }], rowCount: 1, durationMs: 1 },
  resultRevision: 8,
  lastSuccessfulResultRevision: 7,
  isResultStale: true,
  queryMode: id === 'tab-b' ? 'sql' as const : 'builder' as const,
  builder: {
    table: { schema: 'analytics', name: 'events' }, timeColumn: 'created_at', timeBucket: 'hour' as const,
    seriesColumns: ['country', 'device'],
    timeRange: { kind: 'custom' as const, startDate: '2026-08-01', startTime: '08:00', endDate: '2026-08-02', endTime: '18:00', recurringWindows: [{ id: 'workday', from: '09:00', to: '17:00' }] }
  },
  builderHasRun: true,
  sqlVisualization: { view: 'bar' as const, xColumn: 'created_at', valueColumn: 'amount', aggregation: 'sum' as const, seriesColumn: null, seriesColumns: ['country', 'device'], valueAxisScale: 'log' as const },
  builderVisualization: { view: 'line' as const, xColumn: 'created_at', valueColumn: null, aggregation: 'count' as const, seriesColumn: null, seriesColumns: ['country', 'device'], hierarchyDimensions: ['device', 'country'], valueAxisScale: 'linear' as const },
  sqlResultFilters: [clientFilter()],
  builderResultFilters: [promotedFilter(), clientFilter()],
  queryFilterRevision: { sql: 3, builder: 4 },
  builderFilterNotice: { id: 4, message: 'runtime-notice-secret' },
  explainText: 'explain-secret',
  showExplain: true,
  activeExplainRequest: 'analyze' as const,
  seriesVisibility: { FR: false }
})

const state = (): WorkspacePersistableState => ({
  activeTabId: 'tab-b',
  tabs: [
    tab('tab-a', 'Orders by country', 'prod', 'select * from orders;'),
    tab('tab-b', 'Scratch', 'analytics', 'select 42;')
  ]
})

const categoricalState = (): WorkspacePersistableState => {
  const current = tab('tab-category', 'Count by status', 'prod', 'select 1;')
  return {
    activeTabId: current.id,
    tabs: [{
      ...current,
      builder: { table: { schema: 'analytics', name: 'events' }, timeColumn: 'created_at', timeBucket: 'minute' as const, timeRange: { kind: 'rolling' as const, amount: 7, unit: 'day' as const }, seriesColumns: ['region'] },
      builderVisualization: { view: 'bar' as const, xColumn: 'status', valueColumn: null, aggregation: 'count' as const, seriesColumn: null, seriesColumns: ['region'], valueAxisScale: 'linear' as const },
      builderResultFilters: []
    }]
  }
}

test('workspace v2 round-trips ordered tabs, names, connection references and axis-first drafts', () => {
  const restored = parseWorkspaceDraft(serializeWorkspaceDraft(state()))
  assert.ok(restored)
  assert.equal(restored.activeTabId, 'tab-b')
  assert.deepEqual(restored.tabs.map(({ id, title, connectionProfileId, sql, queryMode }) => ({ id, title, connectionProfileId, sql, queryMode })), [
    { id: 'tab-a', title: 'Orders by country', connectionProfileId: 'prod', sql: 'select * from orders;', queryMode: 'builder' },
    { id: 'tab-b', title: 'Scratch', connectionProfileId: 'analytics', sql: 'select 42;', queryMode: 'sql' }
  ])
  assert.equal(restored.tabs[0].builderVisualization.xColumn, 'created_at')
  assert.equal(restored.tabs[0].builderVisualization.aggregation, 'count')
  assert.equal(restored.tabs[0].builderVisualization.valueColumn, null)
  assert.deepEqual(restored.tabs[0].builder.seriesColumns, ['country', 'device'])
  assert.deepEqual(restored.tabs[0].builderVisualization.hierarchyDimensions, ['device', 'country'])
  assert.equal(restored.tabs[0].builderQueryFilters.length, 1)
  assert.equal(restored.tabs[0].builderQueryFilters[0].execution, 'query')
})

test('categorical X persists its independent time filter but no hidden Time bucket', () => {
  const serialized = serializeWorkspaceDraft(categoricalState())
  const envelope = JSON.parse(serialized) as { tabs: Array<{ builder: Record<string, unknown> }> }
  const persistedBuilder = envelope.tabs[0].builder
  assert.equal(persistedBuilder.xColumn, 'status')
  assert.equal(persistedBuilder.timeColumn, 'created_at')
  assert.equal('timeBucket' in persistedBuilder, false)
  assert.deepEqual(persistedBuilder.timeRange, { kind: 'rolling', amount: 7, unit: 'day' })

  const restored = parseWorkspaceDraft(serialized)
  assert.ok(restored)
  assert.equal(restored.tabs[0].builder.timeColumn, 'created_at')
  assert.equal(restored.tabs[0].builder.timeBucket, 'day')
  assert.deepEqual(restored.tabs[0].builder.timeRange, { kind: 'rolling', amount: 7, unit: 'day' })
  assert.equal(restored.tabs[0].builderVisualization.xColumn, 'status')
})

test('temporal X persists explicit axis, time-filter source, range, and bucket', () => {
  const envelope = JSON.parse(serializeWorkspaceDraft(state())) as { tabs: Array<{ builder: Record<string, unknown> }> }
  const persistedBuilder = envelope.tabs[0].builder
  assert.equal(persistedBuilder.xColumn, 'created_at')
  assert.equal(persistedBuilder.timeColumn, 'created_at')
  assert.equal(persistedBuilder.timeBucket, 'hour')
  assert.deepEqual(persistedBuilder.timeRange, state().tabs[0].builder.timeRange)
})

test('workspace serialization is allow-listed: no credentials, results, client filters or runtime state', () => {
  const unsafe = {
    ...state(),
    profiles: [{ id: 'prod', host: 'db', user: 'alice', password: 'do-not-persist' }],
    connected: true
  }
  const serialized = serializeWorkspaceDraft(unsafe)
  const envelope = JSON.parse(serialized) as Record<string, unknown>
  assert.deepEqual(Object.keys(envelope).sort(), ['activeTabId', 'tabs', 'version'])
  for (const forbidden of ['do-not-persist', 'result-secret', 'pending-secret', 'runtime-error-secret', 'client-device', 'mobile', 'explain-secret', 'runtime-notice-secret', 'seriesVisibility', 'profiles']) {
    assert.equal(serialized.includes(forbidden), false, `workspace blob must not contain ${forbidden}`)
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
  assert.equal(patch.activeProfileId, null, 'saved profile IDs stay on tabs; no connection becomes live during restore')
  assert.equal(patch.tabs.length, 2)
  for (const restoredTab of patch.tabs) {
    assert.equal(restoredTab.running, false)
    assert.equal(restoredTab.result, null)
    assert.equal(restoredTab.pendingResult, null)
    assert.equal(restoredTab.queryError, null)
    assert.equal(restoredTab.builderHasRun, false)
    assert.deepEqual(restoredTab.sqlResultFilters, [])
    assert.equal(restoredTab.builderResultFilters.every((filter) => filter.execution === 'query'), true)
    assert.equal(restoredTab.explainText, null)
    assert.deepEqual(restoredTab.seriesVisibility, {})
  }
})

test('legacy v1 time-first workspace migrates into one canonical source-axis tab', () => {
  const storage = new MemoryStorage()
  const legacyTab = state().tabs[0]
  const legacy = {
    version: 1,
    draft: {
      queryMode: 'sql', sql: 'select legacy;',
      builder: legacyTab.builder,
      sqlVisualization: legacyTab.sqlVisualization,
      builderVisualization: { ...legacyTab.builderVisualization, xColumn: 'time_bucket', valueColumn: 'count', aggregation: 'sum', seriesColumn: 'series' }
    }
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
  assert.deepEqual(restored.tabs[0].builder.timeRange, legacyTab.builder.timeRange)
})

test('pre-axis-first v2 workspace with no Builder xColumn remains readable', () => {
  const envelope = JSON.parse(serializeWorkspaceDraft(state())) as { activeTabId: string; tabs: any[]; version: number }
  const legacy = envelope.tabs[0]
  legacy.builder = {
    table: { schema: 'analytics', name: 'events' },
    timeColumn: 'created_at',
    timeBucket: 'hour',
    seriesColumns: ['country', 'device'],
    timeRange: { kind: 'rolling', amount: 7, unit: 'day' }
  }
  legacy.builderVisualization = { view: 'line', xColumn: 'time_bucket', valueColumn: 'count', aggregation: 'sum', seriesColumn: 'series', seriesColumns: ['country', 'device'], valueAxisScale: 'linear' }
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
  const envelope = JSON.parse(serializeWorkspaceDraft(state())) as { activeTabId: string; tabs: any[]; version: number }
  const draft = envelope.tabs[0]
  draft.builder = {
    table: { schema: 'analytics', name: 'events' },
    xColumn: 'created_at',
    timeBucket: 'hour',
    seriesColumns: ['country'],
    timeRange: { kind: 'rolling', amount: 7, unit: 'day' }
  }
  draft.builderVisualization = { ...draft.builderVisualization, xColumn: 'created_at' }
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
  assert.equal(parseWorkspaceDraft(JSON.stringify({ version: 2, activeTabId: 'x', tabs: [] })), null)
  const envelope = JSON.parse(serializeWorkspaceDraft(state())) as { activeTabId: string; tabs: any[]; version: number }
  envelope.tabs[1].id = envelope.tabs[0].id
  assert.equal(parseWorkspaceDraft(JSON.stringify(envelope)), null)

  const minute = JSON.parse(serializeWorkspaceDraft(state())) as { activeTabId: string; tabs: any[]; version: number }
  minute.tabs[0].builder.timeRange = { kind: 'rolling', amount: 7, unit: 'day' }
  minute.tabs[0].builder.timeBucket = 'minute'
  assert.equal(parseWorkspaceDraft(JSON.stringify(minute))?.tabs[0].builder.timeBucket, 'hour')
})

test('automatic persistence debounces edits, ignores runtime-only churn and flushes on page hide', async () => {
  const storage = new MemoryStorage()
  const target = new FakeEventTarget()
  let current = state()
  storage.values.set(WORKSPACE_STORAGE_KEY, serializeWorkspaceDraft(current))
  const listeners = new Set<(next: WorkspacePersistableState) => void>()
  const stop = startWorkspacePersistence(
    () => current,
    (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    { storage, target, delayMs: 1 }
  )

  current = { ...current, tabs: current.tabs.map((item, index) => index === 0 ? { ...item, resultRevision: item.resultRevision + 1 } : item) }
  for (const listener of listeners) listener(current)
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(storage.writes, 0)

  current = { ...current, tabs: current.tabs.map((item, index) => index === 0 ? { ...item, sql: 'select changed;' } : item) }
  for (const listener of listeners) listener(current)
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(storage.writes, 1)
  assert.equal(readWorkspaceDraft(storage)?.tabs[0].sql, 'select changed;')

  current = { ...current, tabs: current.tabs.map((item, index) => index === 1 ? { ...item, title: 'Renamed scratch' } : item) }
  for (const listener of listeners) listener(current)
  target.dispatch('pagehide')
  assert.equal(readWorkspaceDraft(storage)?.tabs[1].title, 'Renamed scratch')

  stop()
  assert.equal(listeners.size, 0)
})
