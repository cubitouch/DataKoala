import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  createResultFilter,
  createResultRangeFilter,
  type BuilderFilterProvenance,
  type ResultFilter,
} from './resultFilters.ts'
import { encodeBuilderSeriesTuple } from './resultVisualization.ts'
import {
  transitionBuilderState,
  builderRelationSelectionPatch,
  builderTimeSourcePatch,
  builderAxisFilterIds,
} from './builderTransitions.ts'
import { generateBuilderQuery } from './builderSql.ts'
import { SEVEN_DAYS, type BuilderTimeRange } from './builderTimeRange.ts'

const ALL_TIME: BuilderTimeRange = { kind: 'all' }
const baseBuilder = {
  table: { schema: 'public', name: 'events' },
  timeColumn: 'created_at',
  timeBucket: 'day' as const,
  timeRange: SEVEN_DAYS,
  seriesColumns: ['country'],
}
const state = (filters: ResultFilter[]) => ({
  builder: baseBuilder,
  builderResultFilters: filters,
})
const tupleFilter = (
  columns = ['country'],
  values: Record<string, unknown> = { country: 'France' },
) => {
  const provenance: BuilderFilterProvenance = {
    mode: 'builder',
    resultAlias: 'series',
    table: baseBuilder.table,
    sourceColumns: columns,
    timeColumn: baseBuilder.timeColumn,
    timeBucket: baseBuilder.timeBucket,
    sourceKind: columns.length === 1 ? 'single-column' : 'series-tuple',
    targetKind: columns.length === 1 ? 'source-column' : 'series-tuple',
    ...(columns.length === 1 ? { sourceColumn: columns[0] } : {}),
    displayLabel: columns.join(' + '),
  }
  return {
    ...createResultFilter(
      'series',
      'equals',
      encodeBuilderSeriesTuple(values, columns),
    ),
    provenance,
  }
}

test('single-Series source filters survive harmless changes and are removed when their source is replaced', () => {
  const filter = tupleFilter()
  assert.deepEqual(
    transitionBuilderState(state([filter]), {}).builderResultFilters,
    [filter],
  )
  assert.deepEqual(
    transitionBuilderState(state([filter]), { timeBucket: 'month' })
      .builderResultFilters,
    [filter],
  )
  const changed = transitionBuilderState(state([filter]), {
    seriesColumns: ['device'],
  })
  assert.deepEqual(changed.builderResultFilters, [])
  assert.match(changed.removedDescriptions[0], /country.*no longer selected/)
})

test('ordered multiple-Series dimensions define tuple compatibility', () => {
  const filter = tupleFilter(['country', 'device'], {
    country: 'France',
    device: 'mobile',
  })
  const multiple = {
    ...state([filter]),
    builder: { ...baseBuilder, seriesColumns: ['country', 'device'] },
  }
  assert.deepEqual(
    transitionBuilderState(multiple, { seriesColumns: ['country', 'device'] })
      .builderResultFilters,
    [filter],
  )
  assert.deepEqual(
    transitionBuilderState(multiple, { seriesColumns: ['device', 'country'] })
      .builderResultFilters,
    [],
  )
})

test('filters on independent Series result columns follow their selected source', () => {
  const filter = createResultFilter('country', 'equals', 'France')
  assert.deepEqual(
    transitionBuilderState(state([filter]), {}).builderResultFilters,
    [filter],
  )
  assert.deepEqual(
    transitionBuilderState(state([filter]), { seriesColumns: ['device'] })
      .builderResultFilters,
    [],
  )
})

test('table changes remove every result-derived filter and clear time-filter state', () => {
  const filters = [
    tupleFilter(),
    createResultRangeFilter('time_bucket', '2026-01-01', '2026-01-02'),
    createResultFilter('count', 'equals', 4),
  ]
  const result = transitionBuilderState(state(filters), {
    table: { schema: 'public', name: 'sessions' },
  })
  assert.deepEqual(result.builderResultFilters, [])
  assert.equal(result.removedDescriptions.length, 3)
  assert.equal(result.builder.timeColumn, null)
  assert.equal(result.builder.timeRange, undefined)
  assert.equal(result.builder.timeBucket, 'day')
})

test('Time bucket changes invalidate time-bucket filters while changing only the dataset time source does not', () => {
  const filter = createResultRangeFilter(
    'time_bucket',
    '2026-01-01',
    '2026-01-02',
  )
  assert.deepEqual(
    transitionBuilderState(state([filter]), { timeColumn: 'received_at' })
      .builderResultFilters,
    [filter],
  )
  assert.deepEqual(
    transitionBuilderState(state([filter]), { timeBucket: 'month' })
      .builderResultFilters,
    [],
  )
})

test('same-relation time-filter source changes preserve the explicit range while relation changes clear it', () => {
  const allTimeState = {
    ...state([]),
    builder: { ...baseBuilder, timeRange: ALL_TIME },
  }
  const relationChanged = transitionBuilderState(allTimeState, {
    table: { schema: 'public', name: 'sessions' },
  })
  assert.equal(relationChanged.builder.timeRange, undefined)
  assert.equal(relationChanged.builder.timeBucket, 'day')
  assert.deepEqual(
    transitionBuilderState(allTimeState, { timeColumn: 'received_at' }).builder
      .timeRange,
    ALL_TIME,
  )
})

test('time-bucket filters survive Series and dataset time-source changes but not bucket or relation changes', () => {
  const filter = createResultRangeFilter(
    'time_bucket',
    '2026-01-01',
    '2026-01-02',
  )
  assert.deepEqual(
    transitionBuilderState(state([filter]), { seriesColumns: ['device'] })
      .builderResultFilters,
    [filter],
  )
  assert.deepEqual(
    transitionBuilderState(state([filter]), { timeColumn: 'updated_at' })
      .builderResultFilters,
    [filter],
  )
  assert.deepEqual(
    transitionBuilderState(state([filter]), { timeBucket: 'week' })
      .builderResultFilters,
    [],
  )
  assert.deepEqual(
    transitionBuilderState(state([filter]), {
      table: { schema: 'archive', name: 'events' },
    }).builderResultFilters,
    [],
  )
})

test('promoted minute filters survive harmless and dataset-filter changes, and are removed on bucket/relation changes', () => {
  const minuteBuilder = {
    ...baseBuilder,
    timeBucket: 'minute' as const,
    timeRange: { kind: 'rolling', amount: 24, unit: 'hour' } as const,
  }
  const filter = {
    ...createResultFilter('time_bucket', 'equals', '2026-08-02T14:37:00Z'),
    execution: 'query' as const,
    provenance: {
      mode: 'builder' as const,
      resultAlias: 'time_bucket' as const,
      table: minuteBuilder.table,
      sourceColumns: [],
      timeColumn: minuteBuilder.timeColumn,
      timeBucket: 'minute',
      sourceKind: 'time-bucket' as const,
      targetKind: 'time-bucket' as const,
      displayLabel: 'minute created_at',
    },
  }
  const minuteState = { builder: minuteBuilder, builderResultFilters: [filter] }
  assert.deepEqual(
    transitionBuilderState(minuteState, {}).builderResultFilters,
    [filter],
  )
  assert.deepEqual(
    transitionBuilderState(minuteState, { seriesColumns: ['device'] })
      .builderResultFilters,
    [filter],
  )
  assert.deepEqual(
    transitionBuilderState(minuteState, { timeColumn: 'updated_at' })
      .builderResultFilters,
    [filter],
  )
  const changedBucket = transitionBuilderState(minuteState, {
    timeBucket: 'hour',
  })
  assert.deepEqual(changedBucket.builderResultFilters, [])
  assert.equal(changedBucket.removedDescriptions.length, 1)
  const tableChanged = transitionBuilderState(minuteState, {
    table: { schema: 'archive', name: 'events' },
  })
  assert.deepEqual(tableChanged.builderResultFilters, [])
  assert.equal(tableChanged.builder.timeBucket, 'day')
  assert.equal(tableChanged.builder.timeRange, undefined)
  assert.equal(tableChanged.removedDescriptions.length, 1)
  assert.match(tableChanged.removedDescriptions[0], /Removed filter/)
})

// Selection patches are deliberately applied through the existing store transition.
test('explicit relation reset clears dependencies and promoted filters without mutating input', () => {
  const original = state([tupleFilter()])
  const before = structuredClone(original)
  for (const table of [
    null,
    baseBuilder.table,
    { schema: 'archive', name: 'events' },
  ]) {
    const patch = builderRelationSelectionPatch(table)
    const result = transitionBuilderState(original, patch)
    assert.deepEqual(result.builder, {
      table,
      timeColumn: null,
      timeBucket: 'day',
      timeRange: undefined,
      seriesColumns: [],
    })
    assert.deepEqual(result.builderResultFilters, [])
    assert.deepEqual(original, before)
  }
  const first = builderRelationSelectionPatch(null)
  first.seriesColumns!.push('local')
  assert.deepEqual(builderRelationSelectionPatch(null).seriesColumns, [])
})

test('time-source selection preserves explicit ranges and unrelated ordered grouping', () => {
  const builder = {
    ...baseBuilder,
    seriesColumns: ['device', 'country'],
    timeRange: ALL_TIME,
  }
  const before = structuredClone(builder)
  const selected = transitionBuilderState(
    { builder, builderResultFilters: [] },
    builderTimeSourcePatch(builder, 'received_at'),
  ).builder
  assert.deepEqual(selected.timeRange, ALL_TIME)
  assert.deepEqual(selected.seriesColumns, ['device', 'country'])
  assert.deepEqual(selected.table, builder.table)
  assert.equal(selected.timeBucket, builder.timeBucket)
  const cleared = transitionBuilderState(
    { builder, builderResultFilters: [] },
    builderTimeSourcePatch(builder, null),
  ).builder
  assert.equal(cleared.timeRange, undefined)
  assert.deepEqual(
    builderTimeSourcePatch({ ...builder, timeRange: undefined }, 'created_at')
      .timeRange,
    SEVEN_DAYS,
  )
  assert.deepEqual(builder, before)
  assert.deepEqual(JSON.parse(JSON.stringify(selected)), { ...selected })
})

test('axis invalidation selects dependencies without changing surviving filter operators or values', () => {
  const filters = [
    createResultFilter('count', 'equals', 5),
    createResultRangeFilter('value', '10', '20'),
    createResultFilter('country', 'notEquals', 'France'),
    createResultRangeFilter('time_bucket', '2026-01-01', '2026-01-02'),
    tupleFilter(),
  ]
  const before = structuredClone(filters)
  assert.deepEqual(
    builderAxisFilterIds(filters, 'metric'),
    filters.slice(0, 2).map((f) => f.id),
  )
  assert.deepEqual(
    builderAxisFilterIds(filters, 'x', 'country'),
    filters.slice(2).map((f) => f.id),
  )
  assert.deepEqual(builderAxisFilterIds(filters, 'x'), [])
  assert.deepEqual(builderAxisFilterIds([], 'metric'), [])
  assert.deepEqual(filters, before)
})

test('time-source transition produces equivalent SQL and parameters to the former inline patch', () => {
  const patch = builderTimeSourcePatch(baseBuilder, 'received_at')
  const next = transitionBuilderState(state([]), patch).builder
  const expected = generateBuilderQuery({
    ...baseBuilder,
    timeColumn: 'received_at',
    timeRange: baseBuilder.timeRange,
    xColumn: 'country',
    xColumnDataType: 'text',
    aggregation: 'count',
  })
  const actual = generateBuilderQuery({
    ...next,
    table: next.table!,
    xColumn: 'country',
    xColumnDataType: 'text',
    aggregation: 'count',
  })
  assert.deepEqual(actual, expected)
  assert.match(actual.sql, /"received_at" >= CURRENT_TIMESTAMP/)
  const reset = transitionBuilderState(
    state([]),
    builderRelationSelectionPatch({ schema: 'archive', name: 'sessions' }),
  ).builder
  assert.throws(
    () =>
      generateBuilderQuery({
        ...reset,
        table: reset.table!,
        aggregation: 'count',
      }),
    /Choose an X axis/,
  )
})
