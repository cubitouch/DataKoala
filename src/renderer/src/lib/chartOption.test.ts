import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEChartsOption } from './chartOption.ts'
import type { QueryResult } from '../../../shared/types.ts'
import type { ChartConfig } from '../store/useStore.ts'

function mk(rows: Record<string, unknown>[], cols: [string, string][]): QueryResult {
  return {
    columns: cols.map(([name, dataTypeName]) => ({ name, dataTypeName, dataTypeID: 0 })),
    rows,
    rowCount: rows.length,
    durationMs: 1
  }
}

const cfg = (over: Partial<ChartConfig> = {}): ChartConfig => ({
  type: 'bar',
  xField: 'day',
  yField: 'total',
  aggregation: 'sum',
  seriesField: undefined,
  timeBucket: undefined,
  ...over
})

/** The user's real query shape: date_trunc'd month plus a count. */
const monthly = mk(
  [
    { day: new Date('2023-06-01T00:00:00Z'), total: 720 },
    { day: new Date('2023-07-01T00:00:00Z'), total: 744 },
    { day: new Date('2023-08-01T00:00:00Z'), total: 744 }
  ],
  [
    ['day', 'timestamptz'],
    ['total', 'int8']
  ]
)

test('a timestamptz X axis produces a time axis', () => {
  const b = buildEChartsOption(monthly, cfg({ type: 'line' }))!
  assert.equal(b.meta.isTimeAxis, true)
  assert.equal((b.option.xAxis as { type: string }).type, 'time')
})

test('a time axis carries [x, y] pairs, not bare values', () => {
  // Regression: bare y values on a time axis make ECharts position points by
  // array index, drawing dates near the epoch instead of the real timestamps.
  const b = buildEChartsOption(monthly, cfg({ type: 'line' }))!
  const series = (b.option.series as { data: unknown[] }[])[0]
  for (const point of series.data) {
    assert.ok(Array.isArray(point), `expected an [x, y] pair, got ${JSON.stringify(point)}`)
    assert.equal((point as unknown[]).length, 2)
  }
  const first = series.data[0] as [string, number]
  assert.match(first[0], /^2023-06-01/, 'x should be the real timestamp')
  assert.equal(first[1], 720)
})

test('a time axis does not set xAxis.data, which it would ignore', () => {
  const b = buildEChartsOption(monthly, cfg({ type: 'line' }))!
  assert.equal((b.option.xAxis as { data?: unknown }).data, undefined)
})

test('timestamps stay in chronological order', () => {
  const shuffled = mk(
    [
      { day: new Date('2023-08-01T00:00:00Z'), total: 3 },
      { day: new Date('2023-06-01T00:00:00Z'), total: 1 },
      { day: new Date('2023-07-01T00:00:00Z'), total: 2 }
    ],
    [
      ['day', 'timestamptz'],
      ['total', 'int8']
    ]
  )
  const b = buildEChartsOption(shuffled, cfg({ type: 'line' }))!
  const ys = (b.option.series as { data: [string, number][] }[])[0].data.map((p) => p[1])
  assert.deepEqual(ys, [1, 2, 3])
})

test('a text X axis produces a category axis with data', () => {
  const r = mk(
    [
      { region: 'eu', total: 5 },
      { region: 'us', total: 7 }
    ],
    [
      ['region', 'text'],
      ['total', 'numeric']
    ]
  )
  const b = buildEChartsOption(r, cfg({ xField: 'region' }))!
  assert.equal(b.meta.isTimeAxis, false)
  const x = b.option.xAxis as { type: string; data: string[] }
  assert.equal(x.type, 'category')
  assert.deepEqual(x.data, ['eu', 'us'])
  assert.deepEqual((b.option.series as { data: unknown[] }[])[0].data, [5, 7])
})

test('a series field yields one series per distinct value', () => {
  // Regression: buildChartData used to drop the series column, so every series
  // collapsed into a single "(null)" series.
  const r = mk(
    [
      { region: 'eu', total: 1, day: '2024-01-01' },
      { region: 'us', total: 2, day: '2024-01-01' },
      { region: 'eu', total: 4, day: '2024-01-02' }
    ],
    [
      ['day', 'text'],
      ['region', 'text'],
      ['total', 'numeric']
    ]
  )
  const b = buildEChartsOption(r, cfg({ seriesField: 'region' }))!
  assert.deepEqual(b.meta.seriesNames.sort(), ['eu', 'us'])
  assert.ok(!b.meta.seriesNames.includes('(null)'), 'series names should not collapse to (null)')
})

test('category series are padded so they cannot drift out of alignment', () => {
  // "us" has no value for 2024-01-02. Without padding its array would be shorter
  // and every later point would shift onto the wrong category.
  const r = mk(
    [
      { day: '2024-01-01', region: 'eu', total: 1 },
      { day: '2024-01-01', region: 'us', total: 10 },
      { day: '2024-01-02', region: 'eu', total: 2 },
      { day: '2024-01-03', region: 'eu', total: 3 },
      { day: '2024-01-03', region: 'us', total: 30 }
    ],
    [
      ['day', 'text'],
      ['region', 'text'],
      ['total', 'numeric']
    ]
  )
  const b = buildEChartsOption(r, cfg({ seriesField: 'region' }))!
  const x = (b.option.xAxis as { data: string[] }).data
  assert.deepEqual(x, ['2024-01-01', '2024-01-02', '2024-01-03'])

  const series = b.option.series as { name: string; data: (number | null)[] }[]
  for (const s of series) {
    assert.equal(s.data.length, x.length, `series ${s.name} is not aligned to the category axis`)
  }
  const us = series.find((s) => s.name === 'us')!
  // The gap must be an explicit null at the right index, not a missing element.
  assert.deepEqual(us.data, [10, null, 30])
  const eu = series.find((s) => s.name === 'eu')!
  assert.deepEqual(eu.data, [1, 2, 3])
})

test('scatter charts always use [x, y] pairs', () => {
  const r = mk(
    [
      { a: 1, b: 2 },
      { a: 3, b: 4 }
    ],
    [
      ['a', 'numeric'],
      ['b', 'numeric']
    ]
  )
  const b = buildEChartsOption(r, cfg({ type: 'scatter', xField: 'a', yField: 'b' }))!
  for (const p of (b.option.series as { data: unknown[] }[])[0].data) {
    assert.ok(Array.isArray(p))
  }
})

test('area charts render as a line with an areaStyle', () => {
  const b = buildEChartsOption(monthly, cfg({ type: 'area' }))!
  const s = (b.option.series as { type: string; areaStyle?: unknown }[])[0]
  assert.equal(s.type, 'line')
  assert.ok(s.areaStyle, 'area charts need an areaStyle')
})

test('the legend only appears when there is more than one series', () => {
  const single = buildEChartsOption(monthly, cfg())!
  assert.equal((single.option.legend as { show: boolean }).show, false)
  const singleGrid = single.option.grid as { right: number; top: number }
  assert.equal(singleGrid.right, 20)
  assert.equal(singleGrid.top, 20)
  assert.equal(single.option.media, undefined)

  const r = mk(
    [
      { day: '2024-01-01', region: 'eu', total: 1 },
      { day: '2024-01-01', region: 'us', total: 2 }
    ],
    [
      ['day', 'text'],
      ['region', 'text'],
      ['total', 'numeric']
    ]
  )
  const multi = buildEChartsOption(r, cfg({ seriesField: 'region' }))!
  const legend = multi.option.legend as Record<string, unknown>
  const grid = multi.option.grid as { right: number; top: number }
  assert.equal(legend.show, true)
  assert.equal(legend.orient, 'vertical')
  assert.equal(legend.type, 'scroll')
  assert.equal(typeof legend.right, 'number')
  assert.equal(typeof legend.top, 'number')
  assert.equal(typeof legend.bottom, 'number')
  assert.deepEqual(legend.textStyle, { color: '#809ca0', width: 180, overflow: 'truncate', ellipsis: '…' })
  assert.ok(grid.right >= 200)
  assert.equal(grid.top, 20)

  const media = multi.option.media as Array<{ query: { maxWidth: number }; option: { legend: Record<string, unknown>; grid: { right: number; top: number } } }>
  assert.equal(media[0].query.maxWidth, 620)
  assert.equal(media[0].option.legend.orient, 'horizontal')
  assert.equal(media[0].option.grid.right, 20)
  assert.ok(media[0].option.grid.top > grid.top)
})

test('a single series is named after the Y column rather than a placeholder', () => {
  const b = buildEChartsOption(monthly, cfg())!
  assert.equal((b.option.series as { name: string }[])[0].name, 'total')
})

test('returns null instead of an empty chart when there is nothing to plot', () => {
  assert.equal(buildEChartsOption(null, cfg()), null)
  assert.equal(buildEChartsOption(monthly, cfg({ xField: '' })), null)
  assert.equal(buildEChartsOption(monthly, cfg({ yField: '' })), null)
  // A Y column that is entirely non-numeric yields no plottable rows.
  const textY = mk([{ day: '2024-01-01', total: 'abc' }], [
    ['day', 'text'],
    ['total', 'text']
  ])
  assert.equal(buildEChartsOption(textY, cfg()), null)
})

test('aggregation is applied per series, not globally', () => {
  const r = mk(
    [
      { day: 'd1', region: 'eu', total: 10 },
      { day: 'd1', region: 'eu', total: 20 },
      { day: 'd1', region: 'us', total: 100 }
    ],
    [
      ['day', 'text'],
      ['region', 'text'],
      ['total', 'numeric']
    ]
  )
  const b = buildEChartsOption(r, cfg({ seriesField: 'region', aggregation: 'sum' }))!
  const series = b.option.series as { name: string; data: (number | null)[] }[]
  assert.deepEqual(series.find((s) => s.name === 'eu')!.data, [30])
  assert.deepEqual(series.find((s) => s.name === 'us')!.data, [100])
})
