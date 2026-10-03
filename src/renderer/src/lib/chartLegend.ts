/** One palette for chart series, the HTML legend, and exported images. */
export const CHART_COLORS = [
  '#f5cf33',
  '#62b8c5',
  '#ef8a62',
  '#8c9be8',
  '#70c486',
  '#df74a8',
  '#5fa7e0',
  '#d3a557',
  '#a783d5',
  '#48b5a2',
  '#c4c95c',
  '#e27b76',
]

export interface ChartLegendEntry {
  identity: string
  label: string
  color: string
}

export function chartSeriesColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length]
}

export function chartLegendEntries(
  identities: readonly string[],
): ChartLegendEntry[] {
  return identities.map((identity, index) => ({
    identity,
    label: identity,
    color: chartSeriesColor(index),
  }))
}
