import test from 'node:test'
import assert from 'node:assert/strict'
import type { BuilderQueryState } from '../store/useStore'
import { canLoadRelationColumns, relationIdentity, relationsForSchema, selectBuilderRelationState, selectionPatchForColumns } from './builderRelations.ts'

const isTime = (column: { dataTypeName: string }) => column.dataTypeName === 'date'

test('relation identity is stable and cannot collide on dotted names', () => {
  assert.equal(relationIdentity({ schema: 'public', name: 'events' }), relationIdentity({ schema: 'public', name: 'events' }))
  assert.notEqual(relationIdentity({ schema: 'a.b', name: 'c' }), relationIdentity({ schema: 'a', name: 'b.c' }))
})

test('returns relations only for the selected schema and preserves normalized ordering', () => {
  const relation = (name: string, kind: 'r' | 'v') => ({ schema: 'app', name, kind, qualifiedName: `app.${name}`, columnsStatus: 'idle' as const })
  const schemas = [{ name: 'app', isSystem: false, relations: [relation('table_first', 'r'), relation('view_second', 'v')] }]
  assert.deepEqual(relationsForSchema(schemas, 'app').map((item) => item.name), ['table_first', 'view_second'])
  assert.deepEqual(relationsForSchema(schemas, 'missing'), [])
})

test('column validation clears a missing time-filter source instead of silently choosing another one', () => {
  const builder: BuilderQueryState = { table: { schema: 'app', name: 'a' }, timeColumn: 'removed_time', timeBucket: 'day', seriesColumns: ['kept', 'removed'] }
  assert.deepEqual(selectionPatchForColumns(builder.table!, builder.table, builder, [
    { name: 'kept', dataTypeName: 'text' }, { name: 'new_time', dataTypeName: 'date' }
  ], isTime), { timeColumn: null, timeRange: undefined, seriesColumns: ['kept'] })
})

test('column validation keeps no time filter until the user chooses a temporal column', () => {
  const builder: BuilderQueryState = { table: { schema: 'app', name: 'a' }, timeColumn: null, timeBucket: 'day', timeRange: undefined, seriesColumns: ['region'] }
  assert.deepEqual(selectionPatchForColumns(builder.table!, builder.table, builder, [
    { name: 'created_at', dataTypeName: 'date' }, { name: 'region', dataTypeName: 'text' }
  ], isTime), { timeColumn: null, timeRange: undefined, seriesColumns: ['region'] })
})

test('column validation preserves a valid explicit time-filter source and range', () => {
  const builder: BuilderQueryState = { table: { schema: 'app', name: 'a' }, timeColumn: 'created_at', timeBucket: 'day', timeRange: { kind: 'all' }, seriesColumns: [] }
  assert.deepEqual(selectionPatchForColumns(builder.table!, builder.table, builder, [
    { name: 'created_at', dataTypeName: 'date' }
  ], isTime), { timeColumn: 'created_at', timeRange: { kind: 'all' }, seriesColumns: [] })
})

test('a stale column response can be cached without clearing the current selection', () => {
  const builder: BuilderQueryState = { table: { schema: 'app', name: 'b' }, timeColumn: 'b_time', timeBucket: 'day', seriesColumns: ['b_series'] }
  assert.equal(selectionPatchForColumns({ schema: 'app', name: 'a' }, builder.table, builder, [
    { name: 'a_time', dataTypeName: 'date' }
  ], isTime), null)
})

test('selecting a relation in SQL mode records it without changing SQL mode, text, or results', () => {
  const result = { columns: [], rows: [], rowCount: 0, durationMs: 1 }
  const state = selectBuilderRelationState({ queryMode: 'sql', sql: 'select 42;', result, builder: { table: null, timeColumn: null, timeBucket: 'day' as const, seriesColumns: [] }, builderHasRun: false }, { schema: 'app', name: 'events' })
  assert.equal(state.queryMode, 'sql')
  assert.equal(state.sql, 'select 42;')
  assert.equal(state.result, result)
  assert.deepEqual(state.builder.table, { schema: 'app', name: 'events' })
})

test('selecting the same relation preserves dependent selections and run state', () => {
  const original = { builder: { table: { schema: 'app', name: 'events' }, timeColumn: 'created_at', timeBucket: 'day' as const, seriesColumns: ['kind'] }, builderHasRun: true }
  const state = selectBuilderRelationState(original, { schema: 'app', name: 'events' })
  assert.equal(state, original)
  assert.equal(state.builderHasRun, true)
})

test('selecting a different relation clears time-filter and Series state', () => {
  const state = selectBuilderRelationState({ builder: { table: { schema: 'app', name: 'events' }, timeColumn: 'created_at', timeBucket: 'week' as const, timeRange: { kind: 'rolling' as const, amount: 7, unit: 'day' as const }, seriesColumns: ['kind'] }, builderHasRun: true }, { schema: 'app', name: 'users' })
  assert.deepEqual(state.builder, { table: { schema: 'app', name: 'users' }, timeColumn: null, timeBucket: 'day', timeRange: undefined, seriesColumns: [] })
  assert.equal(state.builderHasRun, false)
})

test('selecting a different relation clears source visualization selections when present', () => {
  const state = selectBuilderRelationState({
    builder: { table: { schema: 'app', name: 'events' }, timeColumn: 'created_at', timeBucket: 'day' as const, seriesColumns: ['region'] },
    builderHasRun: true,
    builderVisualization: { view: 'bar' as const, xColumn: 'status', valueColumn: 'revenue', aggregation: 'sum' as const, seriesColumn: null, seriesColumns: ['region'], valueAxisScale: 'linear' as const }
  }, { schema: 'app', name: 'users' })
  assert.equal(state.builderVisualization.xColumn, null)
  assert.equal(state.builderVisualization.valueColumn, null)
  assert.equal(state.builderVisualization.aggregation, 'count')
  assert.deepEqual(state.builderVisualization.seriesColumns, [])
})

test('errored column metadata only reloads after an explicit retry', () => {
  assert.equal(canLoadRelationColumns('error'), false)
  assert.equal(canLoadRelationColumns('error', true), true)
  assert.equal(canLoadRelationColumns('loading', true), false)
  assert.equal(canLoadRelationColumns('idle'), true)
})

test('a stale retry for A cannot alter the selected relation B', () => {
  const builder: BuilderQueryState = { table: { schema: 'app', name: 'b' }, timeColumn: 'b_time', timeBucket: 'day', seriesColumns: ['b_series'] }
  assert.equal(selectionPatchForColumns({ schema: 'app', name: 'a' }, builder.table, builder, [
    { name: 'a_time', dataTypeName: 'date' }
  ], isTime), null)
})
