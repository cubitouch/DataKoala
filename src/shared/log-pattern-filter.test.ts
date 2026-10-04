import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deriveLogPatternLineFilterCandidate } from './log-pattern-filter.ts'

describe('deriveLogPatternLineFilterCandidate', () => {
  it('prefers a useful common literal and never emits placeholders', () => {
    const candidate = deriveLogPatternLineFilterCandidate(
      {
        segments: [
          { text: 'Request', variable: false, values: [] },
          { text: '<uuid>', variable: true, values: ['a', 'b'] },
          { text: 'failed', variable: false, values: [] },
          { text: 'after', variable: false, values: [] },
          { text: '<duration>', variable: true, values: ['1ms', '2ms'] },
        ],
      },
      ['Request a failed after 1ms', 'Request b failed after 2ms'],
    )
    assert.equal(candidate, 'failed after')
    assert.doesNotMatch(candidate ?? '', /</)
  })

  it('validates candidates against every loaded cluster member', () => {
    assert.equal(
      deriveLogPatternLineFilterCandidate(
        {
          segments: [
            { text: 'Request', variable: false, values: [] },
            { text: '<number>', variable: true, values: [] },
            { text: 'completed', variable: false, values: [] },
          ],
        },
        ['Request 123 completed', 'Request 456 completed'],
      ),
      'completed',
    )
  })

  it('returns null when no useful common literal exists', () => {
    assert.equal(
      deriveLogPatternLineFilterCandidate(
        {
          segments: [
            { text: '-', variable: false, values: [] },
            { text: '<value>', variable: true, values: [] },
            { text: ':', variable: false, values: [] },
          ],
        },
        ['- one :', '- two :'],
      ),
      null,
    )
  })
})
