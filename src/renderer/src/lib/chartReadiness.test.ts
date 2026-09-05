import assert from 'node:assert/strict'
import test from 'node:test'
import { ChartReadinessController, createChartRevision, finishChartRevisionAfterPaint, type ChartRevision } from './chartReadiness.ts'

function frames() {
  const callbacks: FrameRequestCallback[] = []
  return {
    callbacks,
    schedule: (callback: FrameRequestCallback) => (callbacks.push(callback), callbacks.length),
    cancel: () => {},
    run: () => callbacks.shift()?.(0)
  }
}

test('an applied current revision becomes ready after two render frames without a finished event', () => {
  const readiness = new ChartReadinessController()
  const revision = createChartRevision()
  const scheduler = frames()
  let finished: ChartRevision | null = null
  readiness.commitRevision(revision)
  finishChartRevisionAfterPaint(readiness, revision, () => true, (value) => { finished = value }, scheduler.schedule, scheduler.cancel)
  scheduler.run()
  assert.equal(finished, null)
  scheduler.run()
  assert.equal(finished, revision)
})

test('post-paint readiness rejects stale revisions and options not yet applied', () => {
  const readiness = new ChartReadinessController()
  const revisionA = createChartRevision()
  const revisionB = createChartRevision()
  const scheduler = frames()
  let finishes = 0
  readiness.commitRevision(revisionA)
  finishChartRevisionAfterPaint(readiness, revisionA, () => true, () => { finishes += 1 }, scheduler.schedule, scheduler.cancel)
  readiness.commitRevision(revisionB)
  scheduler.run(); scheduler.run()
  finishChartRevisionAfterPaint(readiness, revisionB, () => false, () => { finishes += 1 }, scheduler.schedule, scheduler.cancel)
  scheduler.run(); scheduler.run()
  assert.equal(finishes, 0)
})

test('a stale finished event cannot complete a newer chart revision', () => {
  const readiness = new ChartReadinessController()
  const revisionA = createChartRevision()
  const revisionB = createChartRevision()
  readiness.commitRevision(revisionA)
  readiness.commitRevision(revisionB)

  assert.equal(readiness.finishRevision(revisionA), false)
  assert.equal(readiness.isCurrentRevision(revisionB), true)
  assert.equal(readiness.finishRevision(revisionB), true)
})

test('a chart changing during capture invalidates the captured revision', () => {
  const readiness = new ChartReadinessController()
  const capturedRevision = createChartRevision()
  const newerRevision = createChartRevision()
  readiness.commitRevision(capturedRevision)
  readiness.commitRevision(newerRevision)

  assert.equal(readiness.isCurrentRevision(capturedRevision), false)
  assert.equal(readiness.finishRevision(capturedRevision), false)
  assert.equal(readiness.finishRevision(newerRevision), true)
})

test('an abandoned candidate does not invalidate the committed ready chart', () => {
  const readiness = new ChartReadinessController()
  const revisionA = createChartRevision()
  readiness.commitRevision(revisionA)
  assert.equal(readiness.finishRevision(revisionA), true)

  const abandonedRevisionB = createChartRevision()
  assert.equal(readiness.isCurrentRevision(revisionA), true)
  assert.equal(readiness.finishRevision(abandonedRevisionB), false)

  const committedRevisionB = createChartRevision()
  readiness.commitRevision(committedRevisionB)
  assert.equal(readiness.finishRevision(revisionA), false)
  assert.equal(readiness.finishRevision(committedRevisionB), true)
})
