import { describe, expect, it } from 'vitest'
import { buildVisibleTraceTree, type TraceRow } from './traceViewer'
import { filterTraceSearch, traceSearchText } from './traceTextSearch'

const root = { spanId: 'root', name: 'request', service: 'api' }
const child = {
  spanId: 'child',
  parentSpanId: 'root',
  name: 'charge',
  service: 'billing',
  resourceAttributes: JSON.stringify({ 'service.namespace': 'Production' }),
  attributes: { 'db.statement': 'SELECT "a word"', attempts: 3 },
  events: [{ name: 'retry failed' }],
}
const other = { spanId: 'other', parentSpanId: 'root', name: 'unrelated' }
function search(
  rows: TraceRow[],
  query: string,
  hiddenKinds = new Set<string>(),
) {
  return filterTraceSearch(
    buildVisibleTraceTree(rows, new Set(), hiddenKinds),
    rows,
    new Map(rows.map((row) => [row, traceSearchText(row)])),
    query,
  )
}

describe('trace text search', () => {
  it.each([
    'CHARGE',
    'billing',
    'production',
    'db.statement',
    'SELECT "a word"',
    'retry failed',
    '3',
  ])('finds %s and preserves ancestors without unrelated siblings', (query) => {
    const result = search([root, child, other], query)
    expect([...result.matches]).toEqual(['child'])
    expect(result.tree.map(({ id }) => id)).toEqual(['root', 'child'])
  })
  it('honors hidden span kinds and returns an empty tree for no matches', () => {
    expect(
      search(
        [root, { ...child, kind: 'CLIENT' }],
        'billing',
        new Set(['CLIENT']),
      ).tree,
    ).toEqual([])
    expect(search([root, child], 'not found').tree).toEqual([])
  })
  it('handles missing parents, cycles, and malformed attribute JSON', () => {
    const rows = [
      { spanId: 'a', parentSpanId: 'b', name: 'needle', attributes: '{broken' },
      { spanId: 'b', parentSpanId: 'a' },
      { spanId: 'orphan', parentSpanId: 'missing', name: 'needle' },
    ]
    expect(search(rows, 'needle').tree).toHaveLength(3)
    expect(search(rows, '{broken').matches.has('a')).toBe(true)
  })
  it('finds a late match in a 5000-span trace without mutating rows', () => {
    const rows = [
      root,
      ...Array.from({ length: 4999 }, (_, i) => ({
        spanId: String(i),
        parentSpanId: 'root',
        name: `operation ${i}`,
      })),
    ]
    const result = search(rows, 'operation 4998')
    expect(result.tree.map(({ id }) => id)).toEqual(['root', '4998'])
    expect(rows).toHaveLength(5000)
  })
})
