import { expect, test } from 'vitest'
import { queryDiff } from './queryDiff'

test('empty input is all additions and identical input is all context', () => {
  expect(queryDiff('', 'SELECT 1;')).toEqual([
    { kind: 'add', text: 'SELECT 1;' },
  ])
  expect(queryDiff('', '')).toEqual([])
  expect(
    queryDiff('SELECT 1;\n', 'SELECT 1;\n').every((l) => l.kind === 'context'),
  ).toBe(true)
})
test('SQL refinement retains context and shows removed and added lines', () => {
  expect(
    queryDiff(
      'SELECT id\nFROM orders\nLIMIT 10',
      'SELECT country, count(*)\nFROM orders\nGROUP BY country',
    ),
  ).toEqual([
    { kind: 'remove', text: 'SELECT id' },
    { kind: 'add', text: 'SELECT country, count(*)' },
    { kind: 'context', text: 'FROM orders' },
    { kind: 'remove', text: 'LIMIT 10' },
    { kind: 'add', text: 'GROUP BY country' },
  ])
})
test('diff reconstructs both inputs including repeated lines, trailing newlines and bounded large replacements', () => {
  for (const [a, b] of [
    ['a\nb\na\n', 'b\na\nb'],
    ['old', ''],
    [
      Array.from({ length: 700 }, (_, i) => `old_${i}`).join('\n'),
      Array.from({ length: 700 }, (_, i) => `new_${i}`).join('\n'),
    ],
  ]) {
    const diff = queryDiff(a, b)
    expect(
      diff
        .filter((l) => l.kind !== 'add')
        .map((l) => l.text)
        .join('\n'),
    ).toBe(a)
    expect(
      diff
        .filter((l) => l.kind !== 'remove')
        .map((l) => l.text)
        .join('\n'),
    ).toBe(b)
  }
})
