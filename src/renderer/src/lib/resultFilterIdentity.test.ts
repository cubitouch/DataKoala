import assert from 'node:assert/strict'
import test from 'node:test'
import { applyResultFilters, createResultFilter, deduplicateResultFilters, deserializeResultFilters, resultFilterDemotion, resultFilterLabel, serializeResultFilters, stableResultFilterId, type BuilderFilterProvenance, type ResultFilter } from './resultFilters.ts'
import { resolveBuilderPromotedFilters } from './builderPromotedFilters.ts'
import { encodeBuilderSeriesTuple } from './resultVisualization.ts'

const provenance = (sourceColumn: string): BuilderFilterProvenance => ({ mode: 'builder', targetKind: 'source-column', resultAlias: 'series', table: { schema: 'public', name: 'events' }, sourceKind: 'single-column', sourceColumn, sourceColumns: [sourceColumn], displayLabel: sourceColumn, timeColumn: 'created_at', timeBucket: 'day' })
const promoted = (source: string): ResultFilter => { const value = { ...createResultFilter(source, 'equals', 'PUBSUB'), execution: 'query' as const, provenance: provenance(source) }; return { ...value, id: stableResultFilterId(value) } }

test('same-value source filters have distinct semantic identities and coexist', () => {
  const status = promoted('status'); const provider = promoted('provider')
  assert.notEqual(status.id, provider.id)
  assert.deepEqual(deduplicateResultFilters([status, provider]), [status, provider])
})

test('execution state does not create a second semantic identity', () => {
  const query = promoted('status'); const client = { ...query, execution: 'client' as const }
  assert.equal(stableResultFilterId(query), stableResultFilterId(client))
  assert.equal(deduplicateResultFilters([query, client]).length, 1)
})

test('single-column and tuple targets with the same value do not collide', () => {
  const single = promoted('status')
  const tupleValue = { ...createResultFilter('series', 'equals', encodeBuilderSeriesTuple({ status: 'PUBSUB', provider: 'PUBSUB' }, ['status', 'provider'])), execution: 'query' as const, provenance: { ...provenance('status'), targetKind: 'series-tuple' as const, sourceKind: 'series-tuple' as const, sourceColumn: undefined, sourceColumns: ['status', 'provider'], displayLabel: 'status + provider' } }
  const tuple = { ...tupleValue, id: stableResultFilterId(tupleValue) }
  assert.notEqual(single.id, tuple.id)
  assert.equal(deduplicateResultFilters([single, tuple]).length, 2)
})

test('serialization preserves semantic identity and safely normalizes legacy IDs', () => {
  const filters = [promoted('status'), promoted('provider')]
  assert.deepEqual(deserializeResultFilters(serializeResultFilters(filters)), filters)
  const legacy = { ...filters[0], id: 'old', provenance: { ...filters[0].provenance!, targetKind: undefined, sourceColumn: undefined, displayLabel: undefined } }
  const [normalized] = deserializeResultFilters(JSON.stringify([legacy]))
  assert.equal(normalized.provenance?.targetKind, 'source-column')
  assert.equal(normalized.provenance?.sourceColumn, 'status')
  assert.equal(normalized.id, filters[0].id)
})

test('chip label identifies the source and unsafe demotion cannot become a series alias filter', () => {
  const status = promoted('status')
  assert.equal(resultFilterLabel(status), 'status = “PUBSUB”')
  assert.deepEqual(resultFilterDemotion(status, ['time_bucket', 'series', 'count']), { allowed: false, reason: 'Cannot move to client because the result does not contain source column status.' })
  assert.deepEqual(applyResultFilters([{ series: 'PUBSUB' }], [status]), [{ series: 'PUBSUB' }])
})

test('safe demotion uses the actual returned source column', () => {
  const status = promoted('status')
  assert.deepEqual(resultFilterDemotion(status, ['status', 'series']), { allowed: true, column: 'status' })
  const demoted = { ...status, execution: 'client' as const, provenance: { ...status.provenance!, clientResultColumn: 'status' } }
  assert.deepEqual(applyResultFilters([{ status: 'PUBSUB', series: 'other' }, { status: 'other', series: 'PUBSUB' }], [demoted]), [{ status: 'PUBSUB', series: 'other' }])
})

test('removing either identity affects only its corresponding SQL predicate', () => {
  const status = promoted('status'); const provider = promoted('provider')
  const context = { table: { schema: 'public', name: 'events' }, xColumn: 'created_at', timeColumn: 'created_at', timeBucket: 'day' as const, seriesColumns: ['status', 'provider'] }
  const both = resolveBuilderPromotedFilters([status, provider], context)!
  assert.match(both.sql, /"status" = \$1 AND "provider" = \$2/)
  assert.deepEqual(both.parameters, ['PUBSUB', 'PUBSUB'])
  assert.equal(resolveBuilderPromotedFilters([provider], context)?.sql, '"provider" = $1')
  assert.equal(resolveBuilderPromotedFilters([status], context)?.sql, '"status" = $1')
})
