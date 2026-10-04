import assert from 'node:assert/strict'
import test from 'node:test'
import { derivePatternLineContainsCandidate } from './log-pattern-filter.ts'
import type { LogPatternCluster } from './log-patterns.ts'

function cluster(
  segments: LogPatternCluster['segments'],
  memberIds = ['one', 'two'],
): Pick<LogPatternCluster, 'segments' | 'memberIds'> {
  return { segments, memberIds }
}

test('derives the longest useful literal run shared by every cluster member', () => {
  const candidate = derivePatternLineContainsCandidate(
    cluster([
      { text: 'Request', variable: false, values: [] },
      { text: '<uuid>', variable: true, values: ['a', 'b'] },
      { text: 'failed', variable: false, values: [] },
      { text: 'after', variable: false, values: [] },
      { text: '<duration>', variable: true, values: ['10ms', '20ms'] },
    ]),
    new Map([
      ['one', 'Request a failed after 10ms'],
      ['two', 'Request b failed after 20ms'],
    ]),
  )

  assert.equal(candidate, 'failed after')
})

test('never emits placeholders literally', () => {
  const candidate = derivePatternLineContainsCandidate(
    cluster([
      { text: 'Request', variable: false, values: [] },
      { text: '<uuid>', variable: true, values: ['a', 'b'] },
      { text: 'failed', variable: false, values: [] },
    ]),
    new Map([
      ['one', 'Request a failed'],
      ['two', 'Request b failed'],
    ]),
  )

  assert.ok(candidate)
  assert.doesNotMatch(candidate, /<uuid>/)
})

test('falls back to a shorter literal run when the longest rendering is not common', () => {
  const candidate = derivePatternLineContainsCandidate(
    cluster([
      { text: 'checkout', variable: false, values: [] },
      { text: 'failed', variable: false, values: [] },
      { text: '<value>', variable: true, values: ['a', 'b'] },
    ]),
    new Map([
      ['one', 'checkout failed a'],
      ['two', 'prefix checkout ... failed b'],
    ]),
  )

  assert.equal(candidate, 'checkout')
})

test('returns null when no useful common literal exists or a member is missing', () => {
  const variableOnly = cluster([
    { text: '<uuid>', variable: true, values: ['a', 'b'] },
    { text: '---', variable: false, values: [] },
  ])
  assert.equal(
    derivePatternLineContainsCandidate(
      variableOnly,
      new Map([
        ['one', 'a ---'],
        ['two', 'b ---'],
      ]),
    ),
    null,
  )

  const literal = cluster([{ text: 'failed', variable: false, values: [] }])
  assert.equal(
    derivePatternLineContainsCandidate(literal, new Map([['one', 'failed']])),
    null,
  )
})
