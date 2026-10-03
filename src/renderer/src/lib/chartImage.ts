import type { ChartLegendEntry } from './chartLegend.ts'
import type { SeriesVisibility } from './chartVisibility.ts'

export const CHART_BACKGROUND = '#161922'

export interface ChartImageInstance {
  dispatchAction(action: { type: string }): void
  getDataURL(options: {
    type: 'png'
    pixelRatio: number
    backgroundColor: string
  }): string
}

const nextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/** Keep exports sharp on standard displays without creating unbounded images. */
export function chartCapturePixelRatio(
  devicePixelRatio: number | undefined,
): number {
  return Math.min(3, Math.max(2, devicePixelRatio || 1))
}

/** Capture the canvas after clearing pointer-only ECharts display state. */
export async function captureChartPng(
  chart: ChartImageInstance,
  pixelRatio: number,
  legend: readonly ChartLegendEntry[] = [],
  visibility: SeriesVisibility = {},
): Promise<string> {
  chart.dispatchAction({ type: 'hideTip' })
  chart.dispatchAction({ type: 'downplay' })
  await nextPaint()
  const image = chart.getDataURL({
    type: 'png',
    pixelRatio,
    backgroundColor: CHART_BACKGROUND,
  })
  if (!image.startsWith('data:image/png;base64,'))
    throw new Error('ECharts returned an invalid PNG')
  return legend.length > 1
    ? composeChartLegend(image, pixelRatio, legend, visibility)
    : image
}

export async function copyChartPng(
  image: string,
  bridge: { writePng(dataUrl: string): Promise<{ ok: true } | { ok: false }> },
): Promise<boolean> {
  const result = await bridge.writePng(image)
  return result.ok
}

export function isCopyChartDisabled(
  chartRendered: boolean,
  copying: boolean,
): boolean {
  return !chartRendered || copying
}

export function isChartActionDisabled(
  chartRendered: boolean,
  capturing: boolean,
): boolean {
  return !chartRendered || capturing
}

export async function exportChartPng(
  capture: () => Promise<string>,
  saveBinary: (options: {
    defaultName: string
    base64: string
    extensions: string[]
  }) => Promise<string | null>,
): Promise<'saved' | 'cancelled'> {
  const url = await capture()
  const path = await saveBinary({
    defaultName: 'datakoala_chart.png',
    base64: url.slice(url.indexOf(',') + 1),
    extensions: ['png'],
  })
  return path === null ? 'cancelled' : 'saved'
}

/** Compose every label, independent of the live scroll position, without touching the chart. */
async function composeChartLegend(
  image: string,
  pixelRatio: number,
  legend: readonly ChartLegendEntry[],
  visibility: SeriesVisibility,
): Promise<string> {
  const bitmap = new Image()
  bitmap.src = image
  await bitmap.decode()
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is not available')
  const font = '12px sans-serif'
  context.font = font
  // Wrap even unbroken label values so exports retain the full series identity.
  const rows = legend.map((entry) => {
    const lines: string[] = []
    let line = ''
    for (const character of entry.label) {
      if (line && context.measureText(line + character).width > 236) {
        lines.push(line)
        line = ''
      }
      line += character
    }
    lines.push(line)
    return { ...entry, lines, height: Math.max(28, lines.length * 16 + 12) }
  })
  const width = bitmap.width / pixelRatio + 292
  const height = Math.max(
    bitmap.height / pixelRatio,
    24 + rows.reduce((sum, row) => sum + row.height, 0),
  )
  // Keep exceptionally long legends within browser canvas limits and a 32MP budget.
  const ratio = Math.min(
    pixelRatio,
    16000 / width,
    16000 / height,
    Math.sqrt(32_000_000 / (width * height)),
  )
  canvas.width = Math.ceil(width * ratio)
  canvas.height = Math.ceil(height * ratio)
  context.scale(ratio, ratio)
  context.fillStyle = CHART_BACKGROUND
  context.fillRect(0, 0, width, height)
  context.drawImage(
    bitmap,
    0,
    0,
    bitmap.width / pixelRatio,
    bitmap.height / pixelRatio,
  )
  context.font = font
  context.textBaseline = 'top'
  const x = bitmap.width / pixelRatio + 16
  let y = 12
  for (const row of rows) {
    const visible = visibility[row.identity] !== false
    context.globalAlpha = visible ? 1 : 0.35
    context.fillStyle = row.color
    context.beginPath()
    context.arc(x + 5, y + 7, 5, 0, Math.PI * 2)
    context.fill()
    context.globalAlpha = 1
    context.fillStyle = visible ? '#f2f4f8' : '#9aa0b0'
    for (const [index, line] of row.lines.entries()) {
      context.fillText(line, x + 20, y + index * 16)
      if (!visible)
        context.fillRect(
          x + 20,
          y + index * 16 + 6,
          context.measureText(line).width,
          1,
        )
    }
    y += row.height
  }
  return canvas.toDataURL('image/png')
}
