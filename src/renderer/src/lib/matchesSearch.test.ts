import { describe, expect, it } from 'vitest'
import { matchesSearch, normalizeSearchText } from './matchesSearch'

describe('matchesSearch', () => {
  const candidate = 'payment-service-worker'

  it.each([
    ['payment-serv', true],
    ['pay worker', true],
    ['worker pay', true],
    ['PAY WORKER', true],
    ['  pay   worker  ', true],
    ['pay missing', false],
    ['', true]
  ])('matches %j as %s', (query, expected) => {
    expect(matchesSearch(candidate, query)).toBe(expected)
  })

  it('matches tokens across normalized searchable text', () => {
    expect(matchesSearch('orders table · demo_shop sales_fact', 'ord demo fact')).toBe(true)
  })

  it('normalizes surrounding, repeated, and mixed whitespace', () => {
    expect(normalizeSearchText('  Payment\t Service\nWorker ')).toBe('payment service worker')
  })
})
