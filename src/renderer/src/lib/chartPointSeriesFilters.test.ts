import assert from 'node:assert/strict'
import test from 'node:test'
import { chartSeriesResultFilters, type ChartPointContext } from './chartPointFilters.ts'
import { applyResultFilters } from './resultFilters.ts'
import { encodeBuilderSeriesTuple } from './resultVisualization.ts'
import { transitionBuilderState } from './builderTransitions.ts'
import { isBuilderFilterPromotable } from './builderSql.ts'
import { resolveBuilderPromotedFilters } from './builderPromotedFilters.ts'

const table = { schema: 'public', name: 'events' }
const builder = { table, xColumn: 'created_at', timeColumn: 'created_at', timeBucket: 'day' as const, seriesColumns: ['country', 'device'] }
const encoded = encodeBuilderSeriesTuple({ country: 'FR', device: 'mobile' }, builder.seriesColumns)
const context: ChartPointContext = {
  xColumn: 'time_bucket',
  xValue: '2026-08-01T00:00:00Z',
  seriesColumn: 'series',
  seriesValue: encoded,
  seriesFilters: [
    { column: 'country', value: 'FR' },
    { column: 'device', value: 'mobile' }
  ],
  timeBucket: 'day'
}

test('including a composite chart series creates one independent filter per source column', () => {
  const filters = chartSeriesResultFilters(context, true)
  assert.deepEqual(filters.map(({ column, operator, ...rest }) => ({ column, operator, value: 'value' in rest ? rest.value : undefined })), [
    { column: 'country', operator: 'equals', value: 'FR' },
    { column: 'device', operator: 'equals', value: 'mobile' }
  ])
  const rows = [
    { country: 'FR', device: 'mobile' },
    { country: 'FR', device: 'desktop' },
    { country: 'DE', device: 'mobile' }
  ]
  assert.deepEqual(applyResultFilters(rows, filters), [rows[0]])
})

test('excluding a composite chart series remains one exact tuple filter', () => {
  const filters = chartSeriesResultFilters(context, false)
  assert.equal(filters.length, 1)
  assert.equal(filters[0].column, 'series')
  assert.equal(filters[0].operator, 'notEquals')
  const rows = [
    { country: 'FR', device: 'mobile' },
    { country: 'FR', device: 'desktop' },
    { country: 'DE', device: 'mobile' }
  ]
  assert.deepEqual(applyResultFilters(rows, filters), [rows[1], rows[2]])
})

test('Builder source filters promote independently and survive unrelated Series removal', () => {
  const [country, device] = chartSeriesResultFilters(context, true)
  assert.equal(isBuilderFilterPromotable(country, builder), true)
  assert.equal(isBuilderFilterPromotable(device, builder), true)

  const promotedCountry = { ...country, execution: 'query' as const }
  const promotedDevice = { ...device, execution: 'query' as const }
  assert.equal(resolveBuilderPromotedFilters([promotedCountry], builder)?.sql, '"country" = $1')
  assert.equal(resolveBuilderPromotedFilters([promotedDevice], builder)?.sql, '"device" = $1')

  const transitioned = transitionBuilderState(
    { builder, builderResultFilters: [promotedCountry, promotedDevice], queryFilterRevision: { builder: 4, sql: 0 } },
    { seriesColumns: ['country'] }
  )
  assert.deepEqual(transitioned.builderResultFilters, [promotedCountry])
  assert.match(transitioned.removedDescriptions[0], /device.*no longer selected/)
  assert.equal(transitioned.queryFilterRevision?.builder, 5)
})
