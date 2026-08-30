import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildChartPresentationOptions,
  CHART_LEGEND_GAP,
  CHART_LEGEND_TEXT_WIDTH,
  CHART_LEGEND_WIDTH
} from './chartPresentation.ts'

test('multi-series legend labels stay inside the reserved right-side footprint', () => {
  const options = buildChartPresentationOptions({
    labels: ['2026-08-30T00:00:00Z'],
    series: [
      { name: 'currency="EUR" · country_code="FR" · deliberately_long_series_label', data: [120] },
      { name: 'currency="GBP" · country_code="GB" · deliberately_long_series_label', data: [80] }
    ],
    view: 'line',
    hasSeriesColumn: true,
    mode: 'sql'
  })

  const legend = options.legend as { width: number; right: number; itemWidth: number; textStyle: { width: number; overflow: string; ellipsis: string } }
  const grid = options.grid as { right: number }

  assert.equal(legend.width, CHART_LEGEND_WIDTH)
  assert.equal(legend.textStyle.width, CHART_LEGEND_TEXT_WIDTH)
  assert.equal(legend.textStyle.overflow, 'truncate')
  assert.equal(legend.textStyle.ellipsis, '…')
  assert.ok(legend.itemWidth + legend.textStyle.width < legend.width, 'marker and truncated text must fit inside the legend box')
  assert.ok(grid.right >= legend.right + legend.width + CHART_LEGEND_GAP, 'plot grid must end before the legend starts')
})
