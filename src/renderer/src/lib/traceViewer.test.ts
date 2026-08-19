import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildVisibleTraceTree,
  canonicalTraceId,
  traceSpanKind,
  traceSpanKindLabel,
  traceSpanKinds,
  visibleSpanCount
} from './traceViewer.ts'

const row = (spanId: string, parentSpanId: string, kind: string, startTimeMs: number) => ({
  spanId,
  parentSpanId,
  kind,
  startTimeMs
})

test('trace IDs accept Tempo search IDs without leading zero padding', () => {
  assert.equal(canonicalTraceId('abc123'), '00000000000000000000000000abc123')
  assert.equal(canonicalTraceId('0123456789abcdef0123456789abcdef'), '0123456789abcdef0123456789abcdef')
  assert.equal(canonicalTraceId('ABCDEF'), '00000000000000000000000000abcdef')
  assert.equal(canonicalTraceId(''), null)
  assert.equal(canonicalTraceId('not-a-trace'), null)
  assert.equal(canonicalTraceId('123456789012345678901234567890123'), null)
})

test('span kind helpers normalize OpenTelemetry kinds and provide useful labels', () => {
  const rows = [
    row('1', '', 'SPAN_KIND_INTERNAL', 0),
    row('2', '1', 'CLIENT', 1),
    row('3', '1', 'SERVER', 2),
    row('4', '1', '', 3)
  ]
  assert.equal(traceSpanKind(rows[0]), 'INTERNAL')
  assert.equal(traceSpanKindLabel('INTERNAL'), 'Internal / code')
  assert.deepEqual(traceSpanKinds(rows), ['SERVER', 'CLIENT', 'INTERNAL', 'UNSPECIFIED'])
})

test('hiding a span kind promotes visible descendants to the nearest visible ancestor', () => {
  const rows = [
    row('root', '', 'SERVER', 0),
    row('code', 'root', 'INTERNAL', 10),
    row('db', 'code', 'CLIENT', 20),
    row('other-code', 'root', 'INTERNAL', 30)
  ]
  const hidden = new Set(['INTERNAL'])
  const tree = buildVisibleTraceTree(rows, new Set(), hidden)

  assert.deepEqual(tree.map(({ id, depth, hasChildren }) => ({ id, depth, hasChildren })), [
    { id: 'root', depth: 0, hasChildren: true },
    { id: 'db', depth: 1, hasChildren: false }
  ])
  assert.equal(visibleSpanCount(rows, hidden), 2)
})

test('collapsing a visible span still hides descendants through filtered-out intermediates', () => {
  const rows = [
    row('root', '', 'SERVER', 0),
    row('code', 'root', 'INTERNAL', 10),
    row('db', 'code', 'CLIENT', 20)
  ]
  const tree = buildVisibleTraceTree(rows, new Set(['root']), new Set(['INTERNAL']))
  assert.deepEqual(tree.map(({ id }) => id), ['root'])
})
