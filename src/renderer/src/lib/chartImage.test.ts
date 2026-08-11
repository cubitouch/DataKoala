import assert from 'node:assert/strict'
import test from 'node:test'
import { captureChartPng, chartCapturePixelRatio, copyChartPng, exportChartPng, isChartActionDisabled, isCopyChartDisabled, CHART_BACKGROUND } from './chartImage.ts'

test('capture neutralizes tooltip and hover before requesting a DPR PNG', async () => {
  const actions: string[] = []
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => { callback(0); return 1 })
  const png = await captureChartPng({
    dispatchAction(action) { actions.push(action.type) },
    getDataURL(options) {
      assert.deepEqual(options, { type: 'png', pixelRatio: 2, backgroundColor: CHART_BACKGROUND })
      return 'data:image/png;base64,AAAA'
    }
  }, 2)
  assert.equal(png, 'data:image/png;base64,AAAA')
  assert.deepEqual(actions, ['hideTip', 'downplay'])
})

test('copy passes PNG only through the narrow bridge and returns confirmed success', async () => {
  let passed = ''
  assert.equal(await copyChartPng('data:image/png;base64,AAAA', { async writePng(image) { passed = image; return { ok: true } } }), true)
  assert.equal(passed, 'data:image/png;base64,AAAA')
})

test('copy failure remains a failure for user feedback', async () => {
  assert.equal(await copyChartPng('data:image/png;base64,AAAA', { async writePng() { return { ok: false } } }), false)
})

test('copy is disabled without a rendered chart and during an active copy', () => {
  assert.equal(isCopyChartDisabled(false, false), true)
  assert.equal(isCopyChartDisabled(true, true), true)
  assert.equal(isCopyChartDisabled(true, false), false)
})

test('both chart actions are disabled before rendering and during either capture', () => {
  assert.equal(isChartActionDisabled(false, false), true)
  assert.equal(isChartActionDisabled(true, true), true)
  assert.equal(isChartActionDisabled(true, false), false)
})

test('capture ratio is at least two and capped at three', () => {
  assert.equal(chartCapturePixelRatio(undefined), 2)
  assert.equal(chartCapturePixelRatio(1), 2)
  assert.equal(chartCapturePixelRatio(2.5), 2.5)
  assert.equal(chartCapturePixelRatio(4), 3)
})

test('neutral capture only clears current transient state so later pointer events remain enabled', async () => {
  const actions: Array<{ type: string }> = []
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => { callback(0); return 1 })
  await captureChartPng({
    dispatchAction(action) { actions.push(action) },
    getDataURL() { return 'data:image/png;base64,AAAA' }
  }, 2)
  assert.deepEqual(actions, [{ type: 'hideTip' }, { type: 'downplay' }])
  // No persistent select/disable action or rerender is performed. ECharts can
  // therefore create its normal tooltip/emphasis again on the next mouse move.
})

test('export reports cancellation without treating it as success', async () => {
  assert.equal(await exportChartPng(
    async () => 'data:image/png;base64,AAAA',
    async () => null
  ), 'cancelled')
})

test('export surfaces capture and save failures and confirms a successful save', async () => {
  await assert.rejects(() => exportChartPng(async () => { throw new Error('capture') }, async () => '/unused'))
  await assert.rejects(() => exportChartPng(async () => 'data:image/png;base64,AAAA', async () => { throw new Error('save') }))
  let savedBase64 = ''
  assert.equal(await exportChartPng(async () => 'data:image/png;base64,AAAA', async (options) => {
    savedBase64 = options.base64
    return '/chart.png'
  }), 'saved')
  assert.equal(savedBase64, 'AAAA')
})
