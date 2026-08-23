import { describe, expect, it } from 'vitest'
import { selectedLokiTrendRange } from './LokiTrendChart'

describe('Loki trend brushing', () => {
  it('extracts a bounded horizontal brush range', () => {
    expect(selectedLokiTrendRange({ areas: [{ coordRange: [100, 200] }] })).toEqual({ startMs: 100, endMs: 200 })
    expect(selectedLokiTrendRange({ areas: [{ coordRange: [200, 100] }] })).toBeNull()
  })
})
