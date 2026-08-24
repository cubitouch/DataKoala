const baseTime = Date.parse('2026-08-19T16:48:00.000Z')

export const lokiLabels = ['cluster', 'environment', 'namespace', 'service_name', 'severity']
export const lokiLabelValues = {
  cluster: ['eu-west-1'],
  environment: ['production', 'staging'],
  namespace: ['payments', 'platform'],
  service_name: ['checkout-api', 'payment-worker', 'inventory-service'],
  severity: ['INFO', 'WARN', 'ERROR']
}

const messages = [
  ['ERROR', 'Payment provider timeout after 800ms; circuit breaker opened after 3 retries'],
  ['WARN', 'Payment provider timeout on retry 2/3; applying 200ms exponential backoff'],
  ['ERROR', 'Checkout timeout while awaiting payment-worker acknowledgement'],
  ['WARN', 'Inventory reservation timeout; inventory-service recovered on retry'],
  ['INFO', 'Payment timeout rate returned below threshold; circuit breaker entering half-open'],
  ['INFO', 'Recovered payment-provider connection after timeout window'],
  ['WARN', 'Slow payment-provider response approaching timeout budget'],
  ['ERROR', 'Payment authorization timeout; request queued for safe retry']
]

export const previewLokiRows = Array.from({ length: 48 }, (_, index) => {
  const [severity, line] = messages[index % messages.length]
  const timestampMs = baseTime - index * 17_000
  const traceId = index === 0 ? '8f4a02ce4d7b41a2bd63688cf774913e' : undefined
  return {
    id: `preview-log-${String(index + 1).padStart(3, '0')}`,
    timestampNs: `${BigInt(timestampMs) * 1_000_000n}`,
    timestampMs,
    line: index === 0 ? JSON.stringify({ message: line, level: severity, trace_id: traceId, span_id: 'c92f5b76d841a903', checkout_id: 'demo-4821' }) : `${line}; checkout_id=demo-${String(4821 - index).padStart(4, '0')}`,
    labels: { environment: 'production', cluster: 'eu-west-1', namespace: 'payments', service_name: 'checkout-api' },
    structuredMetadata: { severity, pod: `checkout-api-7d9f${index % 3}`, trace_id: traceId ?? `synthetic-${String(index).padStart(4, '0')}` },
    parsedFields: { attempt: index % 3 + 1, timeout_ms: index % 4 === 0 ? 800 : 650, downstream_service: index % 3 === 1 ? 'payment-worker' : 'inventory-service', outcome: severity === 'INFO' ? 'recovered' : 'retrying' },
    severity,
    ...(traceId ? { traceId, spanId: 'c92f5b76d841a903' } : {})
  }
})

const columns = (names) => names.map((name) => ({ name, dataTypeID: 0, dataTypeName: name === 'value' ? 'float8' : name === 'timestamp' ? 'timestamp' : 'text', logicalType: name === 'value' ? 'number' : name === 'timestamp' ? 'timestamp' : 'string' }))

export const previewLokiLogResult = {
  resultKind: 'logs',
  columns: columns(['timestamp', 'severity', 'line']),
  rows: previewLokiRows,
  logRows: previewLokiRows,
  rowCount: previewLokiRows.length,
  durationMs: 82,
  execution: { provider: 'loki', durationMs: 82, rowCount: previewLokiRows.length, truncated: true, notice: 'Showing the newest 48 matching entries.' }
}

const trendStart = Date.parse('2026-08-19T16:00:00.000Z')
const volumes = [8, 9, 7, 11, 10, 12, 14, 18, 24, 47, 93, 168, 224, 181, 126, 72, 39, 25, 18, 14, 12, 10, 9, 8]
export const previewLokiTrendResult = {
  resultKind: 'metrics',
  columns: columns(['timestamp', 'value', 'service_name', 'severity']),
  rows: volumes.flatMap((value, index) => [
    { timestamp: new Date(trendStart + index * 150_000).toISOString(), value: Math.round(value * .64), service_name: 'checkout-api', severity: 'ERROR' },
    { timestamp: new Date(trendStart + index * 150_000).toISOString(), value: Math.round(value * .24), service_name: 'checkout-api', severity: 'WARN' },
    { timestamp: new Date(trendStart + index * 150_000).toISOString(), value: Math.round(value * .12), service_name: 'payment-worker', severity: 'INFO' }
  ]),
  rowCount: volumes.length * 3,
  durationMs: 49,
  execution: { provider: 'loki', durationMs: 49, rowCount: volumes.length }
}
