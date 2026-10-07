import { describe, expect, it } from 'vitest'
import { formatCompactNumber } from './compactNumber'

describe('compact numeric labels', () => {
  it.each([
    [0, '0'],
    [12.345, '12.35'],
    [999, '999'],
    [1000, '1k'],
    [1250, '1.25k'],
    [12500, '12.5k'],
    [125000, '125k'],
    [1e6, '1M'],
    [2.5e6, '2.5M'],
    [1e9, '1B'],
    [1e12, '1T'],
    [-1250, '-1.25k'],
    [999999, '1M'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatCompactNumber(value)).toBe(expected)
  })
})
