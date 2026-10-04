import { describe, expect, it } from 'vitest'
import { representativeLogSeverity } from './logSeverity'

describe('representativeLogSeverity', () => {
  const priorityCases: Array<[Record<string, number>, string]> = [
    [{ ERROR: 1, INFO: 20 }, 'ERROR'],
    [{ WARN: 1, INFO: 20 }, 'WARN'],
    [{ INFO: 1, DEBUG: 20 }, 'INFO'],
    [{ DEBUG: 4 }, 'DEBUG'],
  ]

  it.each(priorityCases)(
    'chooses the most severe known level from %o',
    (severities, expected) => {
      expect(representativeLogSeverity(severities)).toBe(expected)
    },
  )

  it('falls back deterministically for unknown levels', () => {
    expect(representativeLogSeverity({ TRACE: 2, NOTICE: 3 })).toBe('NOTICE')
    expect(representativeLogSeverity({})).toBeNull()
  })
})
