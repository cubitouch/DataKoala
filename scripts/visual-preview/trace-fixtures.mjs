export const previewTraceId = '00000000000000000000000000000101'

const searchColumns = [
  { name: 'traceId', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'rootService', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'rootOperation', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'startTimeMs', dataTypeID: 0, dataTypeName: 'float8', logicalType: 'number' },
  { name: 'durationMs', dataTypeID: 0, dataTypeName: 'float8', logicalType: 'number' },
  { name: 'matchedSpans', dataTypeID: 0, dataTypeName: 'int4', logicalType: 'number' },
  { name: 'status', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' }
]

const spanColumns = [
  { name: 'traceId', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'spanId', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'parentSpanId', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'service', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'serviceNamespace', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'name', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'startTimeMs', dataTypeID: 0, dataTypeName: 'float8', logicalType: 'number' },
  { name: 'durationMs', dataTypeID: 0, dataTypeName: 'float8', logicalType: 'number' },
  { name: 'status', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'statusMessage', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'kind', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'scopeName', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'resourceAttributes', dataTypeID: 0, dataTypeName: 'json', logicalType: 'json' },
  { name: 'attributes', dataTypeID: 0, dataTypeName: 'json', logicalType: 'json' },
  { name: 'events', dataTypeID: 0, dataTypeName: 'json', logicalType: 'json' },
  { name: 'links', dataTypeID: 0, dataTypeName: 'json', logicalType: 'json' }
]

// Keep the synthetic search results inside the preview's rolling “Last hour” range
// so the scatter screenshot proves that points, not just axes, are rendered.
const baseTime = Date.now() - 10 * 60_000
const json = (value) => JSON.stringify(value)
const resource = (service, namespace) => ({
  'service.name': service,
  ...(namespace ? { 'service.namespace': namespace } : {}),
  'deployment.environment.name': 'synthetic',
  'cloud.region': 'example-region-1'
})

export const previewTraceSearchResult = {
  columns: searchColumns,
  rows: [
    { traceId: previewTraceId, rootService: 'service-01', rootOperation: 'POST /example', startTimeMs: baseTime, durationMs: 1480, matchedSpans: 16, status: 'error' },
    { traceId: '00000000000000000000000000000102', rootService: 'service-01', rootOperation: 'POST /example', startTimeMs: baseTime - 86_000, durationMs: 418, matchedSpans: 13, status: 'ok' },
    { traceId: '00000000000000000000000000000103', rootService: 'service-01', rootOperation: 'POST /example', startTimeMs: baseTime - 147_000, durationMs: 392, matchedSpans: 12, status: 'ok' },
    { traceId: '00000000000000000000000000000104', rootService: 'service-01', rootOperation: 'POST /example', startTimeMs: baseTime - 238_000, durationMs: 906, matchedSpans: 15, status: 'error' },
    { traceId: '00000000000000000000000000000105', rootService: 'service-01', rootOperation: 'POST /example', startTimeMs: baseTime - 319_000, durationMs: 447, matchedSpans: 13, status: 'ok' }
  ],
  rowCount: 5,
  durationMs: 74,
  notice: 'Tempo search · synthetic preview window',
  execution: { provider: 'tempo', durationMs: 74, rowCount: 5 }
}

// Deliberately synthetic fixture identifiers. Do not copy names or values from real traces.
const spans = [
  { spanId: '0000000000000001', parentSpanId: '', service: 'service-01', namespace: 'example', name: 'POST /example', start: 0, duration: 1480, status: 'OK', kind: 'SERVER', scope: 'example.http', attrs: { 'http.request.method': 'POST', 'http.route': '/example', 'http.response.status_code': 200 }, events: [{ name: 'example.validated', attributes: { 'example.items.count': 4 } }] },
  { spanId: '0000000000000002', parentSpanId: '0000000000000001', service: 'service-01', namespace: 'example', name: 'validate request', start: 24, duration: 96, status: 'OK', kind: 'INTERNAL', scope: 'example.validate', attrs: { 'app.operation': 'validate-request' } },
  { spanId: '0000000000000003', parentSpanId: '0000000000000002', service: 'cache-01', namespace: 'example', name: 'GET example:key', start: 41, duration: 18, status: 'OK', kind: 'CLIENT', scope: 'cache.client', attrs: { 'db.system': 'redis', 'db.operation.name': 'GET', 'server.address': 'cache.example.invalid' } },
  { spanId: '0000000000000004', parentSpanId: '0000000000000001', service: 'service-02', namespace: 'example', name: 'POST /dependency-a', start: 148, duration: 274, status: 'OK', kind: 'CLIENT', scope: 'http.client', attrs: { 'http.request.method': 'POST', 'server.address': 'service-02.example.invalid' } },
  { spanId: '0000000000000005', parentSpanId: '0000000000000004', service: 'service-02', namespace: 'example', name: 'handle request', start: 172, duration: 214, status: 'OK', kind: 'SERVER', scope: 'example.service', attrs: { 'example.items': 4 } },
  { spanId: '0000000000000006', parentSpanId: '0000000000000005', service: 'database-01', namespace: 'example', name: 'SELECT example', start: 204, duration: 43, status: 'OK', kind: 'CLIENT', scope: 'db.client', attrs: { 'db.system': 'postgresql', 'db.operation.name': 'SELECT', 'db.namespace': 'example', 'server.address': 'database.example.invalid' } },
  { spanId: '0000000000000007', parentSpanId: '0000000000000005', service: 'database-01', namespace: 'example', name: 'UPDATE example', start: 268, duration: 71, status: 'OK', kind: 'CLIENT', scope: 'db.client', attrs: { 'db.system': 'postgresql', 'db.operation.name': 'UPDATE', 'db.namespace': 'example', 'server.address': 'database.example.invalid' } },
  { spanId: '0000000000000008', parentSpanId: '0000000000000001', service: 'service-03', namespace: 'example', name: 'call dependency', start: 438, duration: 826, status: 'ERROR', statusMessage: 'Synthetic downstream timeout after retries', kind: 'CLIENT', scope: 'example.dependency', attrs: { 'retry.count': 2, 'error.type': 'TimeoutError' }, events: [{ name: 'exception', attributes: { 'exception.type': 'TimeoutError', 'exception.message': 'Synthetic request exceeded timeout', 'exception.escaped': false } }] },
  { spanId: '0000000000000009', parentSpanId: '0000000000000008', service: 'service-03', namespace: 'example', name: 'POST /dependency-b', start: 474, duration: 701, status: 'ERROR', statusMessage: 'Synthetic gateway timeout', kind: 'CLIENT', scope: 'http.client', attrs: { 'http.request.method': 'POST', 'server.address': 'service-03.example.invalid', 'http.response.status_code': 504, 'error.type': 'TimeoutError' } },
  { spanId: '000000000000000a', parentSpanId: '0000000000000008', service: 'service-03', namespace: 'example', name: 'retry backoff', start: 1184, duration: 62, status: 'OK', kind: 'INTERNAL', scope: 'example.retry', attrs: { 'retry.attempt': 2, 'retry.delay_ms': 60 } },
  { spanId: '000000000000000b', parentSpanId: '0000000000000001', service: 'service-01', namespace: 'example', name: 'publish example.event', start: 1280, duration: 27, status: 'OK', kind: 'PRODUCER', scope: 'messaging.producer', attrs: { 'messaging.system': 'kafka', 'messaging.destination.name': 'example.event', 'messaging.operation.name': 'send', 'messaging.message.id': 'synthetic-message-01' } },
  { spanId: '000000000000000c', parentSpanId: '000000000000000b', service: 'broker-01', namespace: 'platform', name: 'example.event', start: 1288, duration: 11, status: 'OK', kind: 'PRODUCER', scope: 'messaging.broker', attrs: { 'messaging.system': 'kafka', 'messaging.destination.name': 'example.event' } },
  { spanId: '000000000000000d', parentSpanId: '000000000000000b', service: 'worker-01', namespace: 'workers', name: 'process example.event', start: 1322, duration: 118, status: 'OK', kind: 'CONSUMER', scope: 'messaging.consumer', attrs: { 'messaging.system': 'kafka', 'messaging.destination.name': 'example.event', 'messaging.operation.name': 'process', 'messaging.consumer.group.name': 'synthetic-consumer' }, links: [{ traceId: previewTraceId, spanId: '000000000000000b', attributes: { 'messaging.message.id': 'synthetic-message-01' } }] },
  { spanId: '000000000000000e', parentSpanId: '000000000000000d', service: 'service-04', namespace: 'workers', name: 'process downstream', start: 1341, duration: 72, status: 'OK', kind: 'CLIENT', scope: 'rpc.client', attrs: { 'rpc.system': 'grpc', 'rpc.method': 'ExampleMethod' } },
  { spanId: '000000000000000f', parentSpanId: '0000000000000001', service: 'service-01', namespace: 'example', name: 'render response', start: 1448, duration: 21, status: 'OK', kind: 'INTERNAL', scope: 'example.response', attrs: { 'app.operation': 'render-response' } },
  { spanId: '0000000000000010', parentSpanId: '0000000000000001', service: 'service-01', namespace: 'example', name: 'record outcome', start: 1469, duration: 8, status: 'OK', kind: 'INTERNAL', scope: 'example.telemetry', attrs: { 'example.outcome': 'synthetic-retry' } }
]

export const previewTraceResult = {
  columns: spanColumns,
  rows: spans.map((span) => ({
    traceId: previewTraceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    service: span.service,
    serviceNamespace: span.namespace,
    name: span.name,
    startTimeMs: baseTime + span.start,
    durationMs: span.duration,
    status: span.status,
    statusMessage: span.statusMessage ?? '',
    kind: span.kind,
    scopeName: span.scope,
    resourceAttributes: json(resource(span.service, span.namespace)),
    attributes: json(span.attrs),
    events: json(span.events ?? []),
    links: json(span.links ?? [])
  })),
  rowCount: spans.length,
  durationMs: 51,
  execution: { provider: 'tempo', durationMs: 51, rowCount: spans.length }
}

const cohortProfiles = new Map(previewTraceSearchResult.rows.map((row) => [row.traceId, {
  startTimeMs: row.startTimeMs,
  durationMs: row.durationMs,
  error: row.status === 'error',
  hotspotMs: row.durationMs >= 1200 ? 826 : row.durationMs >= 800 ? 550 : row.durationMs >= 440 ? 135 : row.durationMs >= 410 ? 120 : 105
}]))

export function previewTraceResultForId(traceId) {
  const profile = cohortProfiles.get(traceId)
  if (!profile) return null
  const scale = profile.durationMs / 1480
  return {
    ...previewTraceResult,
    rows: spans.map((span) => {
      const hotspot = span.spanId === '0000000000000008' || span.spanId === '0000000000000009'
      const durationMs = span.spanId === '0000000000000001'
        ? profile.durationMs
        : hotspot
          ? profile.hotspotMs * (span.spanId === '0000000000000009' ? 0.84 : 1)
          : Math.max(1, span.duration * scale)
      return {
        traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        service: span.service,
        serviceNamespace: span.namespace,
        name: span.name,
        startTimeMs: profile.startTimeMs + span.start * scale,
        durationMs,
        status: hotspot ? (profile.error ? 'ERROR' : 'OK') : span.status,
        statusMessage: hotspot && !profile.error ? '' : span.statusMessage ?? '',
        kind: span.kind,
        scopeName: span.scope,
        resourceAttributes: json(resource(span.service, span.namespace)),
        attributes: json(span.attrs),
        events: json(hotspot && !profile.error ? [] : span.events ?? []),
        links: json((span.links ?? []).map((link) => ({ ...link, traceId })))
      }
    }),
    rowCount: spans.length,
    durationMs: 20 + Math.round(profile.durationMs / 100),
    execution: { provider: 'tempo', durationMs: 20 + Math.round(profile.durationMs / 100), rowCount: spans.length }
  }
}
