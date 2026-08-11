import assert from 'node:assert/strict'
import test from 'node:test'
import { chartActionsReady, shouldKeepChartMounted } from './chartQueryLifecycle.ts'

test('a chart stays mounted for the complete false → true → false running transition', () => {
  assert.deepEqual([false, true, false].map(() => shouldKeepChartMounted('line', true)), [true, true, true])
  assert.equal(shouldKeepChartMounted('bar', true), true)
  assert.equal(shouldKeepChartMounted('table', true), false)
})

test('an initial query without a successful result keeps the loading/table surface', () => {
  assert.equal(shouldKeepChartMounted('line', false), false)
})

test('actions enable once only after a rerun result is rendered and no request is pending', () => {
  const sequence = [
    chartActionsReady(true, true, null),
    chartActionsReady(false, false, null),
    chartActionsReady(true, false, null)
  ]
  assert.deepEqual(sequence, [false, false, true])
  assert.equal(chartActionsReady(true, false, 'query failed'), false)
})
