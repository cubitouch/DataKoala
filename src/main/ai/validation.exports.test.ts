import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as facade from './validation.ts'
import * as primitives from './validation/primitives.ts'
import * as query from './validation/query.ts'
import * as builder from './validation/builder.ts'
import * as anomaly from './validation/anomaly.ts'
import * as plan from './validation/plan.ts'

test('compatibility facade exposes the original API with the same function and error identities', () => {
  const implementations = {
    ...primitives,
    ...query,
    ...builder,
    ...anomaly,
    ...plan,
  }
  assert.deepEqual(
    Object.keys(facade).sort(),
    [
      'AiError',
      'record',
      'textValue',
      'requestId',
      'settingsInput',
      'proposalRequest',
      'queryStep',
      'planAnalysisRequest',
      'planAnalysis',
      'anomalyAnalysisRequest',
      'anomalyAnalysis',
      'builderProposalRequest',
      'builderStep',
    ].sort(),
  )
  for (const key of Object.keys(facade) as Array<keyof typeof facade>)
    assert.equal(facade[key], implementations[key])
})
