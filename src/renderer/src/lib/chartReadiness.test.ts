import assert from 'node:assert/strict'
import test from 'node:test'
import { ChartReadinessController, createChartRevision } from './chartReadiness.ts'

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
