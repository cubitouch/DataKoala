import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveBuilderPromotedFilters, type BuilderFilterContext } from './builderPromotedFilters.ts'
import { createResultFilter, createResultRangeFilter, type BuilderFilterProvenance, type ResultFilter } from './resultFilters.ts'
import { generateBuilderQuery } from './builderSql.ts'

const context = { table: { schema: 'public', name: 'events' }, xColumn: 'created_at', timeColumn: 'created_at', timeBucket: 'day' as const, seriesColumns: ['status'] } satisfies BuilderFilterContext
const provenance = (patch: Partial<BuilderFilterProvenance> = {}): BuilderFilterProvenance => ({ mode: 'builder', resultAlias: 'time_bucket', table: context.table, sourceColumns: [], timeColumn: context.timeColumn, timeBucket: context.timeBucket, sourceKind: 'time-bucket', targetKind: 'time-bucket', displayLabel: 'day created_at', ...patch })
const promoted = (filter: ResultFilter, value = provenance()): ResultFilter => ({ ...filter, execution: 'query', provenance: value })

test('day-bucket equality becomes a parameterized UTC half-open source interval', () => {
  const result = resolveBuilderPromotedFilters([promoted(createResultFilter('time_bucket', 'equals', '2026-03-08T00:00:00.000Z'))], context)
  assert.deepEqual(result, { sql: '("created_at" >= $1 AND "created_at" < $2)', parameters: ['2026-03-08T00:00:00.000Z', '2026-03-09T00:00:00.000Z'] })
})

test('hour equality and month equality derive exact exclusive calendar ends', () => {
  const hour = { ...context, timeBucket: 'hour' as const }
  assert.deepEqual(resolveBuilderPromotedFilters([promoted(createResultFilter('time_bucket', 'equals', '2026-01-31T23:45:00Z'), provenance({ timeBucket: 'hour' }))], hour)?.parameters, ['2026-01-31T23:00:00.000Z', '2026-02-01T00:00:00.000Z'])
  const month = { ...context, timeBucket: 'month' as const }
  assert.deepEqual(resolveBuilderPromotedFilters([promoted(createResultFilter('time_bucket', 'equals', '2024-02-18T12:00:00Z'), provenance({ timeBucket: 'month' }))], month)?.parameters, ['2024-02-01T00:00:00.000Z', '2024-03-01T00:00:00.000Z'])
})

test('minute provenance produces minute boundaries and keeps range parameters first', () => {
  const minute = { ...context, timeBucket: 'minute' as const }
  const filter = promoted(createResultFilter('time_bucket', 'equals', '2026-08-02T14:37:42Z'), provenance({ timeBucket: 'minute', displayLabel: 'minute created_at' }))
  const query = generateBuilderQuery({ ...minute, xColumnDataType: 'timestamptz', timeRange: { kind: 'custom', startDate: '2026-08-02', startTime: '00:00', endDate: '2026-08-03', endTime: '00:00', recurringWindows: [{ id: 'morning', from: '14:00', to: '15:00' }] }, filters: [filter] })
  assert.deepEqual(query.parameters, ['2026-08-02T00:00', '2026-08-03T00:00', '14:00', '15:00', '2026-08-02T14:37:00.000Z', '2026-08-02T14:38:00.000Z'])
  assert.match(query.sql, /date_trunc\('minute'/)
  assert.match(query.sql, /"created_at" >= \$5 AND "created_at" < \$6/)
})

test('not-equals deliberately includes NULL and excludes exactly the bucket interval', () => {
  const result = resolveBuilderPromotedFilters([promoted(createResultFilter('time_bucket', 'notEquals', '2026-01-01T00:00:00Z'))], context)!
  assert.equal(result.sql, '("created_at" IS NULL OR "created_at" < $1 OR "created_at" >= $2)')
  assert.deepEqual(result.parameters, ['2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'])
})

test('range filters require proven displayed bucket boundaries and preserve exclusive end', () => {
  const range = createResultRangeFilter('time_bucket', '2026-01-01T00:00:00Z', '2026-01-08T00:00:00Z')
  assert.equal(resolveBuilderPromotedFilters([promoted(range)], context), null)
  assert.deepEqual(resolveBuilderPromotedFilters([promoted(range, provenance({ rangeKind: 'bucket-boundaries' }))], context), { sql: '("created_at" >= $1 AND "created_at" < $2)', parameters: ['2026-01-01T00:00:00Z', '2026-01-08T00:00:00Z'] })
})

test('UTC interpretation is deterministic across offset-bearing displayed values', () => {
  const result = resolveBuilderPromotedFilters([promoted(createResultFilter('time_bucket', 'equals', '2026-01-01T02:00:00+02:00'))], context)!
  assert.deepEqual(result.parameters, ['2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'])
})

test('UTC day buckets stay 24 hours across a daylight-saving transition', () => {
  const result = resolveBuilderPromotedFilters([promoted(createResultFilter('time_bucket', 'equals', '2026-03-08T05:00:00-05:00'))], context)!
  assert.deepEqual(result.parameters, ['2026-03-08T00:00:00.000Z', '2026-03-09T00:00:00.000Z'])
})

test('bucket and time-column provenance must still match', () => {
  const filter = promoted(createResultFilter('time_bucket', 'equals', '2026-01-01Z'))
  assert.equal(resolveBuilderPromotedFilters([filter], { ...context, timeBucket: 'hour' }), null)
  assert.equal(resolveBuilderPromotedFilters([filter], { ...context, xColumn: 'updated_at', timeColumn: 'updated_at' }), null)
})

test('Builder time range parameters precede promoted bucket parameters deterministically', () => {
  const query = generateBuilderQuery({ ...context, xColumnDataType: 'timestamptz', timeRange: { kind: 'custom', startDate: '2025-01-01', startTime: '00:00', endDate: '2027-01-01', endTime: '00:00' }, filters: [promoted(createResultFilter('time_bucket', 'equals', '2026-06-02T00:00:00Z'))] })
  assert.deepEqual(query.parameters, ['2025-01-01T00:00', '2027-01-01T00:00', '2026-06-02T00:00:00.000Z', '2026-06-03T00:00:00.000Z'])
  assert.match(query.sql, /"created_at" >= \$3 AND "created_at" < \$4/)
})

test('categorical X filters resolve without any temporal context', () => {
  const categorical: BuilderFilterContext = { table: context.table, xColumn: 'status', timeColumn: null, timeBucket: null, seriesColumns: [] }
  const filter = { ...createResultFilter('status', 'equals', 'paid'), execution: 'query' as const }
  assert.deepEqual(resolveBuilderPromotedFilters([filter], categorical), { sql: '"status" = $1', parameters: ['paid'] })
})
