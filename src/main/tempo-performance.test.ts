import assert from 'node:assert/strict'
import test from 'node:test'
import { createTempoPerformance, extractTempoProviderMetrics, TempoPerformanceCollector, tempoPerformanceLog } from './tempo-performance.ts'

test('collector totals invocations, parsing, normalization, bytes and optional metrics', () => {
  let now = 0
  const collector = new TempoPerformanceCollector('request-1', 'search.sample', () => now)
  now = 10
  collector.recordGcx({ phase: 'traces.query', gcxWallMs: 8, stdout: 'é', raw: { metrics: { inspectedBytes: '12', inspectedTraces: 3 } } })
  now = 20
  collector.recordGcx({ phase: 'root-status.error', gcxWallMs: 5, stdout: '{}', raw: {} })
  collector.recordParse(1.5)
  collector.recordParse(0.5)
  collector.recordNormalize(4)
  collector.recordRootStatus(7, 1)
  now = 30
  const summary = collector.complete({ rowCount: 2 })
  assert.equal(summary.gcxInvocations, 2)
  assert.equal(summary.gcxTotalMs, 13)
  assert.equal(summary.gcx[0].stdoutBytes, 2)
  assert.deepEqual(summary.gcx[0].providerMetrics, { inspectedBytes: 12, inspectedTraces: 3 })
  assert.equal(summary.parseMs, 2)
  assert.equal(summary.normalizeMs, 4)
  assert.equal(summary.rootStatusEnrichmentMs, 7)
})

test('provider metrics are optional and tolerate gcx data wrappers', () => {
  assert.equal(extractTempoProviderMetrics({ traces: [] }), undefined)
  assert.deepEqual(extractTempoProviderMetrics({ data: { metrics: { totalBlocks: 4, completedJobs: '2', ignored: null } } }), { totalBlocks: 4, completedJobs: 2 })
})

test('disabled mode creates no collector and emits no diagnostic logging', () => {
  const previous = process.env.DATAKOALA_TEMPO_PERF
  delete process.env.DATAKOALA_TEMPO_PERF
  const messages: unknown[] = []
  const original = console.info
  console.info = (...values: unknown[]) => { messages.push(values) }
  try {
    assert.equal(createTempoPerformance('request-2', 'trace.get'), undefined)
    tempoPerformanceLog('ignored', { queryLength: 2 })
    assert.deepEqual(messages, [])
  } finally {
    console.info = original
    if (previous === undefined) delete process.env.DATAKOALA_TEMPO_PERF
    else process.env.DATAKOALA_TEMPO_PERF = previous
  }
})
