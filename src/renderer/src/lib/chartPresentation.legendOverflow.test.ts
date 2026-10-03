import { expect, test } from 'vitest'
import { chartLegendEntries } from './chartLegend'
import { buildChartPresentationOptions } from './chartPresentation'

test('HTML/export colors match explicit chart colors including hidden series and palette cycling', () => {
  const identities = Array.from({ length: 25 }, (_, i) => `service-${i}`)
  const legend = chartLegendEntries(identities)
  for (const mode of ['sql', 'builder'] as const) {
    const options = buildChartPresentationOptions({
      labels: ['x'],
      series: identities.map((name) => ({ name, data: [2] })),
      view: 'line',
      hasSeriesColumn: true,
      mode,
      visibility: { 'service-0': false },
    })
    const series = options.series as Array<{
      itemStyle: { color: string }
      lineStyle: { color: string }
    }>
    expect(series.map((s) => s.itemStyle.color)).toEqual(
      legend.map((s) => s.color),
    )
    expect(series.map((s) => s.lineStyle.color)).toEqual(
      legend.map((s) => s.color),
    )
  }
})
