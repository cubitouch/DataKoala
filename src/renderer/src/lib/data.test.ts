import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildChartData, resultToCsv } from './data.ts'
import type { QueryResult } from '../../../shared/types.ts'
import type { ChartConfig } from '../store/useStore.ts'

function mkResult(rows: Record<string, unknown>[], cols: [string, string][]): QueryResult {
  return {
    columns: cols.map(([name, dataTypeName]) => ({ name, dataTypeID: 0, dataTypeName })),
    rows,
    rowCount: rows.length,
    durationMs: 1
  }
}

const baseCfg: ChartConfig = {
  type: 'bar',
  xField: 'region',
  yField: 'amount',
  aggregation: 'sum',
  seriesField: undefined,
  timeBucket: undefined
}

test('sum aggregation groups rows by the x field', () => {
  const r = mkResult(
    [
      { region: 'eu', amount: 10 },
      { region: 'eu', amount: 5 },
      { region: 'us', amount: 3 }
    ],
    [['region', 'text'], ['amount', 'numeric']]
  )
  const out = buildChartData(r, baseCfg)
  assert.equal(out.length, 2)
  const eu = out.find((x) => x.region === 'eu')!
  assert.equal(eu.amount, 15)
  const us = out.find((x) => x.region === 'us')!
  assert.equal(us.amount, 3)
})

test('avg / min / max / count aggregations compute correctly', () => {
  const r = mkResult(
    [
      { region: 'eu', amount: 10 },
      { region: 'eu', amount: 20 },
      { region: 'eu', amount: 30 }
    ],
    [['region', 'text'], ['amount', 'numeric']]
  )
  assert.equal(buildChartData(r, { ...baseCfg, aggregation: 'avg' })[0].amount, 20)
  assert.equal(buildChartData(r, { ...baseCfg, aggregation: 'min' })[0].amount, 10)
  assert.equal(buildChartData(r, { ...baseCfg, aggregation: 'max' })[0].amount, 30)
  assert.equal(buildChartData(r, { ...baseCfg, aggregation: 'count' })[0].amount, 3)
})

test('numeric strings from Postgres are coerced, not concatenated', () => {
  // pg returns numeric/bigint as strings; naive code would produce "10" + "5" = "105".
  const r = mkResult(
    [
      { region: 'eu', amount: '10' },
      { region: 'eu', amount: '5' }
    ],
    [['region', 'text'], ['amount', 'numeric']]
  )
  assert.equal(buildChartData(r, baseCfg)[0].amount, 15)
})

test('rows with non-numeric y values are skipped rather than poisoning the total', () => {
  const r = mkResult(
    [
      { region: 'eu', amount: 10 },
      { region: 'eu', amount: null },
      { region: 'eu', amount: 'not-a-number' },
      { region: 'eu', amount: 5 }
    ],
    [['region', 'text'], ['amount', 'numeric']]
  )
  assert.equal(buildChartData(r, baseCfg)[0].amount, 15)
})

test('a series field splits rows into separate series AND is preserved on each row', () => {
  const r = mkResult(
    [
      { day: '2024-01-01', region: 'eu', amount: 1 },
      { day: '2024-01-01', region: 'us', amount: 2 },
      { day: '2024-01-02', region: 'eu', amount: 4 }
    ],
    [['day', 'timestamptz'], ['region', 'text'], ['amount', 'numeric']]
  )
  const out = buildChartData(r, { ...baseCfg, xField: 'day', seriesField: 'region' })
  // eu/2024-01-01, us/2024-01-01, eu/2024-01-02 must stay distinct.
  assert.equal(out.length, 3)
  // Regression: asserting only on length let a real bug through — the series column
  // was dropped from the output, so the chart layer collapsed every series into one.
  assert.deepEqual(
    out.map((x) => x.region).sort(),
    ['eu', 'eu', 'us'],
    'the series field must be carried onto each aggregated row'
  )
  for (const row of out) {
    assert.ok(row.region !== undefined, 'series value missing from an output row')
  }
})

test('the series field is not written over the x or y column', () => {
  const r = mkResult(
    [{ region: 'eu', amount: 5 }],
    [['region', 'text'], ['amount', 'numeric']]
  )
  // seriesField === yField would otherwise clobber the aggregate.
  const out = buildChartData(r, { ...baseCfg, xField: 'region', yField: 'amount', seriesField: 'amount' })
  assert.equal(out[0].amount, 5, 'aggregate value was overwritten by the series value')
})

test('internal accumulator fields do not leak into the output', () => {
  const r = mkResult([{ region: 'eu', amount: 1 }], [['region', 'text'], ['amount', 'numeric']])
  const out = buildChartData(r, baseCfg)
  for (const k of ['_count', '_sum', '_min', '_max']) {
    assert.ok(!(k in out[0]), `internal field ${k} leaked into chart data`)
  }
})

test('x values sort naturally (10 after 9, not after 1)', () => {
  const r = mkResult(
    [
      { region: '10', amount: 1 },
      { region: '9', amount: 1 },
      { region: '1', amount: 1 }
    ],
    [['region', 'text'], ['amount', 'numeric']]
  )
  const out = buildChartData(r, baseCfg)
  assert.deepEqual(out.map((x) => x.region), ['1', '9', '10'])
})

test('missing x or y config yields no data instead of throwing', () => {
  const r = mkResult([{ region: 'eu', amount: 1 }], [['region', 'text'], ['amount', 'numeric']])
  assert.deepEqual(buildChartData(r, { ...baseCfg, xField: '' }), [])
  assert.deepEqual(buildChartData(r, { ...baseCfg, yField: '' }), [])
})

test('CSV export quotes commas, quotes and newlines correctly', () => {
  const r = mkResult(
    [{ a: 'has,comma', b: 'has"quote', c: 'has\nnewline' }],
    [['a', 'text'], ['b', 'text'], ['c', 'text']]
  )
  const csv = resultToCsv(r)
  const [header, body] = csv.split('\n')
  assert.equal(header, 'a,b,c')
  // RFC4180: wrap in quotes, and double any embedded quote.
  assert.ok(body.startsWith('"has,comma","has""quote"'), `unexpected CSV body: ${body}`)
  assert.ok(csv.includes('"has\nnewline"'))
})

test('CSV export renders nulls as empty and dates as ISO', () => {
  const r = mkResult(
    [{ a: null, b: undefined, c: new Date('2024-01-02T03:04:05Z') }],
    [['a', 'text'], ['b', 'text'], ['c', 'timestamptz']]
  )
  const csv = resultToCsv(r)
  assert.equal(csv.split('\n')[1], ',,2024-01-02T03:04:05.000Z')
})
