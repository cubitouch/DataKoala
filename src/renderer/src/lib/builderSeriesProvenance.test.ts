import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveBuilderPromotedFilters, type BuilderFilterContext } from './builderPromotedFilters.ts'
import { transitionBuilderState } from './builderTransitions.ts'
import { createResultFilter, type BuilderFilterProvenance, type ResultFilter } from './resultFilters.ts'
import { encodeBuilderSeriesTuple } from './resultVisualization.ts'

const builder = { table: { schema: 'public', name: 'events' }, timeColumn: 'created_at', timeBucket: 'day' as const, seriesColumns: ['status'] }
const provenance = (sourceKind: 'single-column' | 'series-tuple', sourceColumns: string[]): BuilderFilterProvenance => ({ mode: 'builder', resultAlias: 'series', table: builder.table, sourceColumns, timeColumn: builder.timeColumn, timeBucket: builder.timeBucket, sourceKind, targetKind: sourceKind === 'single-column' ? 'source-column' : 'series-tuple', ...(sourceKind === 'single-column' ? { sourceColumn: sourceColumns[0] } : {}), displayLabel: sourceColumns.join(' + ') })
const filter = (kind: 'single-column' | 'series-tuple', columns: string[], values: Record<string, unknown>): ResultFilter => ({ ...createResultFilter('series', 'equals', encodeBuilderSeriesTuple(values, columns)), execution: 'query', provenance: provenance(kind, columns) })
const transition = (value: ResultFilter, seriesColumns: string[]) => transitionBuilderState({ builder, builderResultFilters: [value] }, { seriesColumns })
const resolve = (value: ResultFilter, seriesColumns: string[]) => resolveBuilderPromotedFilters([value], { ...builder, seriesColumns } as BuilderFilterContext)

test('single-column provenance survives additions, unrelated removals, and order changes', () => {
  const value = filter('single-column', ['status'], { status: 'ready' })
  assert.deepEqual(transition(value, ['status', 'provider']).builderResultFilters, [value])
  assert.deepEqual(transitionBuilderState({ builder: { ...builder, seriesColumns: ['provider', 'status'] }, builderResultFilters: [value] }, { seriesColumns: ['status'] }).builderResultFilters, [value])
  assert.equal(resolve(value, ['provider', 'status'])?.sql, '("status" IS NOT DISTINCT FROM $1)')
})

test('single-column provenance is removed with explanation when its source is replaced', () => {
  const result = transition(filter('single-column', ['status'], { status: 'ready' }), ['provider'])
  assert.deepEqual(result.builderResultFilters, [])
  assert.match(result.removedDescriptions[0], /status.*no longer selected/)
})

test('tuple provenance requires the identical full ordered tuple', () => {
  const value = filter('series-tuple', ['status', 'provider'], { status: 'ready', provider: 'aws' })
  assert.match(resolve(value, ['status', 'provider'])!.sql, /"status" IS NOT DISTINCT FROM \$1 AND "provider" IS NOT DISTINCT FROM \$2/)
  assert.equal(resolve(value, ['provider', 'status']), null)
  assert.equal(resolve(value, ['status']), null)
  const tupleBuilder = { ...builder, seriesColumns: ['status', 'provider'] }
  assert.deepEqual(transitionBuilderState({ builder: tupleBuilder, builderResultFilters: [value] }, { seriesColumns: ['status', 'provider'] }).builderResultFilters, [value])
  assert.deepEqual(transitionBuilderState({ builder: tupleBuilder, builderResultFilters: [value] }, { seriesColumns: ['provider', 'status'] }).builderResultFilters, [])
})
