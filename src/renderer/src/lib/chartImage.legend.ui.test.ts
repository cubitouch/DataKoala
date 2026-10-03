// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { captureChartPng, copyChartPng, exportChartPng } from './chartImage'
import { chartLegendEntries } from './chartLegend'

afterEach(() => vi.unstubAllGlobals())

test('copy and export compose the complete legend including hidden/offscreen labels with matching colors', async () => {
  const context = {
    font: '',
    fillStyle: '',
    globalAlpha: 1,
    textBaseline: '',
    measureText: (s: string) => ({ width: s.length * 6 }),
    scale: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
  }
  const colors: string[] = []
  context.fill.mockImplementation(() => {
    colors.push(context.fillStyle)
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/png;base64,COMPOSED',
  )
  vi.stubGlobal(
    'Image',
    class {
      width = 1200
      height = 600
      src = ''
      decode = async () => {}
    },
  )
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  const names = Array.from({ length: 25 }, (_, i) => `service-${i}`)
  const legend = chartLegendEntries(names)
  const chart = {
    dispatchAction: vi.fn(),
    getDataURL: () => 'data:image/png;base64,CHART',
  }
  const capture = () =>
    captureChartPng(chart, 2, legend, { 'service-0': false })
  const png = await capture()
  expect(context.fillText.mock.calls.map((args) => args[0])).toEqual(names)
  expect(colors).toEqual(legend.map((entry) => entry.color))
  expect(context.drawImage).toHaveBeenCalledWith(
    expect.anything(),
    0,
    0,
    600,
    300,
  )
  const writePng = vi.fn(async () => ({ ok: true as const }))
  await copyChartPng(png, { writePng })
  expect(writePng).toHaveBeenCalledWith('data:image/png;base64,COMPOSED')
  const save = vi.fn(async () => '/chart.png')
  await exportChartPng(capture, save)
  expect(save).toHaveBeenCalledWith({
    defaultName: 'datakoala_chart.png',
    base64: 'COMPOSED',
    extensions: ['png'],
  })
  expect(await captureChartPng(chart, 2, legend.slice(0, 1))).toBe(
    'data:image/png;base64,CHART',
  )
})
