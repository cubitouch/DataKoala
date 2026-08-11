import assert from 'node:assert/strict'
import test from 'node:test'
import { ChartApplicationController } from './chartApplication.ts'
import { createChartRevision } from './chartReadiness.ts'

const candidate = (fingerprint: string) => ({ revision: createChartRevision(), fingerprint, option: { fingerprint }, origin: 'configuration' as const })

test('a newer revision applies without waiting for the animating revision', () => {
  const controller = new ChartApplicationController<{ fingerprint: string }>()
  const a = candidate('A'); controller.request(a); const appliedA = controller.applyPending()!
  const b = candidate('B'); controller.request(b); const appliedB = controller.applyPending()!
  assert.equal(controller.isSuperseded(a.revision), true)
  assert.equal(appliedB.fingerprint, 'B'); assert.notEqual(appliedB.token, appliedA.token)
  assert.equal(controller.finish(appliedA.token), null)
  assert.equal(controller.getCompleted(), null)
  assert.equal(controller.finish(appliedB.token)?.fingerprint, 'B')
})

test('five rapid candidates coalesce to one application of the final revision', () => {
  const controller = new ChartApplicationController<{ fingerprint: string }>()
  for (const value of ['A', 'B', 'C', 'D', 'E']) controller.request(candidate(value))
  assert.equal(controller.getPending()?.fingerprint, 'E')
  const applied = controller.applyPending()!
  assert.equal(applied.fingerprint, 'E'); assert.equal(applied.token, 1)
  assert.equal(controller.finish(applied.token)?.fingerprint, 'E')
})
