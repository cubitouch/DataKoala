import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aggregateTraceCohort,
  selectTraceRowsForCohort,
  summarizeTraceForCohort,
  tempoTraceLookupRequest,
  type TraceCohortTraceSummary
} from './traceCohort.ts'
import type { TraceRow } from './traceViewer.ts'

const ids = [
  '00000000000000000000000000000001',
  '00000000000000000000000000000002',
  '00000000000000000000000000000003',
  '00000000000000000000000000000004',
  '00000000000000000000000000000005',
  '00000000000000000000000000000006'
]

function span(patch: TraceRow & { spanId: string; service: string }): TraceRow {
  return {
    traceId: ids[0],
    parentSpanId: '',
    serviceNamespace: 'commerce',
    name: patch.service,
    startTimeMs: 1_000,
    durationMs: 10,
    status: 'OK',
    kind: 'INTERNAL',
    ...patch
  }
}

test('Tempo trace lookup bounds a known trace with a safety margin', () => {
  const request = tempoTraceLookupRequest({ startTimeMs: 1_000_000, durationMs: 20_000 })
  assert.deepEqual(request, {
    start: new Date(995_000).toISOString(),
    end: new Date(1_025_000).toISOString()
  })
  assert.equal(tempoTraceLookupRequest({ startTimeMs: 0, durationMs: 20_000 }), undefined)
})

test('representative cohort selection keeps duration spread and error traces', () => {
  const rows = ids.map((traceId, index) => ({ traceId, durationMs: (index + 1) * 100, status: index === 1 ? 'error' : 'ok' }))
  const selected = selectTraceRowsForCohort(rows, 3)
  assert.equal(selected.length, 3)
  assert.ok(selected.some((row) => row.traceId === ids[1]), 'error trace should be retained')
  assert.ok(selected.some((row) => row.traceId === ids[5]), 'slow tail should be represented')
  assert.ok(selected.some((row) => Number(row.durationMs) <= 300), 'baseline should be represented')
})

test('trace summarization collapses same-service spans and records cross-service async edges', () => {
  const rows: TraceRow[] = [
    span({ spanId: 'root', service: 'checkout-api', name: 'POST /checkout', durationMs: 900, kind: 'SERVER' }),
    span({ spanId: 'internal', parentSpanId: 'root', service: 'checkout-api', name: 'validate', durationMs: 40 }),
    span({ spanId: 'payment', parentSpanId: 'root', service: 'payment-service', name: 'charge', durationMs: 520, kind: 'CLIENT', status: 'ERROR' }),
    span({ spanId: 'payment-child', parentSpanId: 'payment', service: 'payment-service', name: 'gateway', durationMs: 480, kind: 'CLIENT', status: 'ERROR' }),
    span({ spanId: 'consumer', parentSpanId: 'root', service: 'fulfilment-worker', name: 'consume', durationMs: 120, kind: 'CONSUMER' })
  ]
  const summary = summarizeTraceForCohort(rows, { traceId: ids[0], durationMs: 900, status: 'error' })
  assert.equal(summary.services.length, 3)
  assert.equal(summary.edges.length, 2)
  const payment = summary.edges.find((edge) => edge.target.endsWith('/payment-service'))
  assert.equal(payment?.durationMs, 520)
  assert.equal(payment?.callCount, 1)
  assert.equal(payment?.errorCount, 1)
  const asyncEdge = summary.edges.find((edge) => edge.target.endsWith('/fulfilment-worker'))
  assert.equal(asyncEdge?.kind, 'async')
})

test('cohort aggregation ranks a service edge that expands in slow traces', () => {
  const make = (traceId: string, durationMs: number, paymentMs: number, error = false): TraceCohortTraceSummary => ({
    traceId,
    durationMs,
    status: error ? 'error' : 'ok',
    rootServiceId: 'commerce/checkout-api',
    rootServiceLabel: 'checkout-api',
    services: [
      { id: 'commerce/checkout-api', label: 'checkout-api', namespace: 'commerce', spanCount: 2, errorSpanCount: 0 },
      { id: 'commerce/payment-service', label: 'payment-service', namespace: 'commerce', spanCount: 1, errorSpanCount: error ? 1 : 0 },
      { id: 'commerce/inventory-service', label: 'inventory-service', namespace: 'commerce', spanCount: 1, errorSpanCount: 0 }
    ],
    edges: [
      { key: 'checkout-payment', source: 'commerce/checkout-api', target: 'commerce/payment-service', sourceLabel: 'checkout-api', targetLabel: 'payment-service', kind: 'sync', durationMs: paymentMs, callCount: 1, errorCount: error ? 1 : 0 },
      { key: 'checkout-inventory', source: 'commerce/checkout-api', target: 'commerce/inventory-service', sourceLabel: 'checkout-api', targetLabel: 'inventory-service', kind: 'sync', durationMs: 70, callCount: 1, errorCount: 0 }
    ]
  })

  const aggregate = aggregateTraceCohort([
    make(ids[0], 300, 90), make(ids[1], 330, 100), make(ids[2], 350, 110),
    make(ids[3], 390, 120), make(ids[4], 900, 620), make(ids[5], 1_400, 1_050, true)
  ])

  assert.equal(aggregate.traceCount, 6)
  assert.equal(aggregate.edges[0].targetLabel, 'payment-service')
  assert.ok(aggregate.edges[0].slowDeltaMs > 400)
  assert.ok(aggregate.edges[0].p95Ms > 600)
  assert.equal(aggregate.edges[0].latencyComparisonAvailable, true)
  assert.equal(aggregate.nodes[0].label, 'checkout-api')
  assert.equal(aggregate.nodes[0].rootTraceCount, 6)
})

test('edge absence is measured as presence change rather than zero latency', () => {
  const make = (traceId: string, durationMs: number, includePayment: boolean): TraceCohortTraceSummary => ({
    traceId,
    durationMs,
    status: 'ok',
    rootServiceId: 'checkout',
    rootServiceLabel: 'checkout',
    services: [
      { id: 'checkout', label: 'checkout', spanCount: 1, errorSpanCount: 0 },
      ...(includePayment ? [{ id: 'payment', label: 'payment', spanCount: 1, errorSpanCount: 0 }] : [])
    ],
    edges: includePayment ? [{
      key: 'checkout-payment', source: 'checkout', target: 'payment', sourceLabel: 'checkout', targetLabel: 'payment',
      kind: 'sync', durationMs: 500, callCount: 1, errorCount: 0
    }] : []
  })

  const aggregate = aggregateTraceCohort([
    make(ids[0], 100, false), make(ids[1], 120, false), make(ids[2], 140, false),
    make(ids[3], 160, false), make(ids[4], 500, true)
  ])
  const edge = aggregate.edges[0]

  assert.equal(edge.baselineObservedTraceCount, 0)
  assert.equal(edge.slowObservedTraceCount, 1)
  assert.equal(edge.latencyComparisonAvailable, false)
  assert.equal(edge.baselineMedianMs, 0)
  assert.equal(edge.slowMedianMs, 500)
  assert.equal(edge.slowDeltaMs, 0)
  assert.equal(edge.baselinePresenceRate, 0)
  assert.equal(edge.slowPresenceRate, 1)
  assert.equal(edge.slowPresenceLift, 1)
})
