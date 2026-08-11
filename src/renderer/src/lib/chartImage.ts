export const CHART_BACKGROUND = '#161922'

export interface ChartImageInstance {
  dispatchAction(action: { type: string }): void
  getDataURL(options: { type: 'png'; pixelRatio: number; backgroundColor: string }): string
}

const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/** Keep exports sharp on standard displays without creating unbounded images. */
export function chartCapturePixelRatio(devicePixelRatio: number | undefined): number {
  return Math.min(3, Math.max(2, devicePixelRatio || 1))
}

/** Capture the canvas after clearing pointer-only ECharts display state. */
export async function captureChartPng(chart: ChartImageInstance, pixelRatio: number): Promise<string> {
  chart.dispatchAction({ type: 'hideTip' })
  chart.dispatchAction({ type: 'downplay' })
  await nextPaint()
  const image = chart.getDataURL({ type: 'png', pixelRatio, backgroundColor: CHART_BACKGROUND })
  if (!image.startsWith('data:image/png;base64,')) throw new Error('ECharts returned an invalid PNG')
  return image
}

export async function copyChartPng(
  image: string,
  bridge: { writePng(dataUrl: string): Promise<{ ok: true } | { ok: false }> }
): Promise<boolean> {
  const result = await bridge.writePng(image)
  return result.ok
}

export function isCopyChartDisabled(chartRendered: boolean, copying: boolean): boolean {
  return !chartRendered || copying
}

export function isChartActionDisabled(chartRendered: boolean, capturing: boolean): boolean {
  return !chartRendered || capturing
}

export async function exportChartPng(
  capture: () => Promise<string>,
  saveBinary: (options: { defaultName: string; base64: string; extensions: string[] }) => Promise<string | null>
): Promise<'saved' | 'cancelled'> {
  const url = await capture()
  const path = await saveBinary({
    defaultName: 'datakoala_chart.png',
    base64: url.slice(url.indexOf(',') + 1),
    extensions: ['png']
  })
  return path === null ? 'cancelled' : 'saved'
}
