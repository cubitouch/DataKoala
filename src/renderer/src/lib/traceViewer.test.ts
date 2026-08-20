import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTraceTimelineScale,
  buildVisibleTraceTree,
  canonicalTraceId,
  openedTraceStatus,
  traceSpanKind,
  traceSpanKindLabel,
  traceSpanKinds,
  visibleSpanCount,
  withoutAsyncTraceBranches
} from './traceViewer.ts'

const row = (spanId: string, parentSpanId: string, kind: string, startTimeMs: number, status = '', durationMs = 1) => ({
  spanId,
  parentSpanId,
  kind,
  startTimeMs,
  status,
  durationMs
})

test('trace IDs accept Tempo search IDs without leading zero padding', () => {
  assert.equal(canonicalTraceId('abc123'), '00000000000000000000000000abc123')
  assert.equal(canonicalTraceId('0123456789abcdef0123456789abcdef'), '0123456789abcdef0123456789abcdef')
  assert.equal(canonicalTraceId('ABCDEF'), '00000000000000000000000000abcdef')
  assert.equal(canonicalTraceId(''), null)
  assert.equal(canonicalTraceId('not-a-trace'), null)
  assert.equal(canonicalTraceId('123456789012345678901234567890123'), null)
})

test('opened trace status prefers the actual root span and keeps unknown success conservative', () => {
  assert.equal(openedTraceStatus([
    row('root', '', 'SERVER', 0, 'OK'),
    row('child', 'root', 'CLIENT', 10, 'ERROR')
  ]), 'ok')
  assert.equal(openedTraceStatus([
    row('root', '', 'SERVER', 0, 'ERROR'),
    row('child', 'root', 'CLIENT', 10, 'OK')
  ]), 'error')
  assert.equal(openedTraceStatus([
    row('root', '', 'SERVER', 0, 'UNSET'),
    row('child', 'root', 'CLIENT', 10, 'ERROR')
  ]), 'error')
  assert.equal(openedTraceStatus([
    row('root', '', 'SERVER', 0, 'UNSET'),
    row('child', 'root', 'CLIENT', 10, 'OK')
  ]), 'unknown')
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

test('async branch filtering removes producer/consumer descendants without deleting an async root trace', () => {
  const rows = [
    row('root', '', 'SERVER', 0),
    row('http', 'root', 'CLIENT', 10),
    row('producer', 'root', 'PRODUCER', 20),
    row('producer-code', 'producer', 'INTERNAL', 21),
    row('consumer', 'root', 'CONSUMER', 1_000),
    row('consumer-db', 'consumer', 'CLIENT', 1_010)
  ]
  assert.deepEqual(withoutAsyncTraceBranches(rows).map((item) => item.spanId), ['root', 'http'])

  const consumerRoot = [
    row('consumer-root', '', 'CONSUMER', 0),
    row('work', 'consumer-root', 'CLIENT', 10)
  ]
  assert.deepEqual(withoutAsyncTraceBranches(consumerRoot).map((item) => item.spanId), ['consumer-root', 'work'])
})

test('trace timeline compression preserves order while shrinking long idle gaps', () => {
  const rows = [
    row('root', '', 'SERVER', 0, 'OK', 300_100),
    row('http', 'root', 'CLIENT', 10, 'OK', 400),
    row('db', 'root', 'CLIENT', 420, 'OK', 300),
    row('consumer', 'root', 'CONSUMER', 300_000, 'OK', 100)
  ]
  const scale = buildTraceTimelineScale(rows, true)

  assert.equal(scale.wallDurationMs, 300_100)
  assert.equal(scale.gaps.length, 1)
  assert.ok(scale.gaps[0].durationMs > 299_000)
  assert.ok(scale.displayDurationMs < 10_000)
  assert.ok(scale.offsetPercent(10) < scale.offsetPercent(420))
  assert.ok(scale.offsetPercent(420) < scale.offsetPercent(300_000))
  assert.ok(scale.widthPercent(10, 400) > 0)

  const wallClock = buildTraceTimelineScale(rows, false)
  assert.equal(wallClock.gaps.length, 0)
  assert.equal(wallClock.displayDurationMs, wallClock.wallDurationMs)
  assert.ok(wallClock.offsetPercent(420) < 1)
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
