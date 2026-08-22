import assert from 'node:assert/strict'
import test from 'node:test'
import { parser } from '@grafana/lezer-traceql'
import { formatTraceql, traceqlHasErrors } from './formatTraceql.ts'

const validQueries = [
  '{resource.service.name="checkout-api"}',
  '{ .service.name = "api" && duration>300ms || status=error }',
  '{ span.http.route =~ ".*checkout|payment.*" }',
  '{ .message = "foo && bar {not syntax}" }',
  '{ .message = `foo && bar` }',
  '{ true } | count() > 1',
  '{ true } >> { status = error }',
  '{ (duration > 1s && duration < 2s) || status = error }',
  '{ true } | by(resource.service.name)',
  '{} | rate()',
  '{ true } // line comment\n| count() > 1',
  '{ true /* block comment */ }'
]

test('formats TraceQL tokens conservatively and preserves literal contents', () => {
  const result = formatTraceql('{resource.service.name="checkout-api"&&duration>300ms}')
  assert.deepEqual(result, { ok: true, query: '{ resource.service.name = "checkout-api" && duration > 300ms }' })
  for (const query of validQueries) {
    const first = formatTraceql(query)
    assert.equal(first.ok, true, query)
    if (!first.ok) continue
    assert.equal(traceqlHasErrors(parser.parse(first.query)), false, first.query)
    const second = formatTraceql(first.query)
    assert.deepEqual(second, first, `formatter must be idempotent for ${query}`)
  }
})

test('preserves regexes, strings, backticks, durations, and comments exactly', () => {
  for (const [query, fragment] of [
    ['{ .route =~ ".*api|worker.*" }', '".*api|worker.*"'],
    ['{ .message = "foo && bar" }', '"foo && bar"'],
    ['{ .message = `a { b } && c` }', '`a { b } && c`'],
    ['{ duration > 300ms }', '300ms'],
    ['{ true } /* a && b */', '/* a && b */'],
    ['{ true } // a && b\n| count() > 1', '// a && b']
  ]) {
    const result = formatTraceql(query)
    assert.equal(result.ok, true, query)
    if (result.ok) assert.ok(result.query.includes(fragment), result.query)
  }
})

test('rejects invalid TraceQL without returning replacement text', () => {
  const result = formatTraceql('{ resource.service.name = }')
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /invalid syntax/)
})

test('keeps operators outside adjacent line comments and remains idempotent', () => {
  const queries = [
    '{\n  resource.service.name = "api" // service filter\n  && duration > 300ms\n}',
    '{\n  resource.service.name = "api" &&\n  // latency filter\n  duration > 300ms\n}'
  ]
  for (const query of queries) {
    const result = formatTraceql(query)
    assert.equal(result.ok, true, query)
    if (!result.ok) continue
    const lines = result.query.split('\n')
    const commentLine = lines.find((line) => line.includes('//'))
    assert.ok(commentLine)
    assert.equal(commentLine.includes('duration'), false, result.query)
    assert.equal(commentLine.includes('&&'), false, result.query)
    assert.ok(lines.some((line) => !line.includes('//') && line.includes('&&')), result.query)
    assert.deepEqual(formatTraceql(result.query), result)
  }
})
