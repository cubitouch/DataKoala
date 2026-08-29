export const previewTraceId = '4bf92f3577b34da6a3ce929d0e0e4736'

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

const baseTime = 1787133600000
const json = (value) => JSON.stringify(value)
const resource = (service, namespace) => ({
  'service.name': service,
  ...(namespace ? { 'service.namespace': namespace } : {}),
  'deployment.environment.name': 'production',
  'cloud.region': 'europe-west1'
})

export const previewTraceSearchResult = {
  columns: searchColumns,
  rows: [
    { traceId: previewTraceId, rootService: 'checkout-api', rootOperation: 'POST /checkout', startTimeMs: baseTime, durationMs: 1480, matchedSpans: 16, status: 'error' },
    { traceId: '93b7a6c1d35f4b97b6425f7801dc1c90', rootService: 'checkout-api', rootOperation: 'POST /checkout', startTimeMs: baseTime - 86_000, durationMs: 418, matchedSpans: 13, status: 'ok' },
    { traceId: '27af7654cde84e37a1d799b7fca23a5d', rootService: 'checkout-api', rootOperation: 'POST /checkout', startTimeMs: baseTime - 147_000, durationMs: 392, matchedSpans: 12, status: 'ok' },
    { traceId: 'c177a85ca1db4312a74eb42e155bb87e', rootService: 'checkout-api', rootOperation: 'POST /checkout', startTimeMs: baseTime - 238_000, durationMs: 906, matchedSpans: 15, status: 'error' },
    { traceId: '7f02e9dbf34c4cf6a02c4cf7064b4213', rootService: 'checkout-api', rootOperation: 'POST /checkout', startTimeMs: baseTime - 319_000, durationMs: 447, matchedSpans: 13, status: 'ok' }
  ],
  rowCount: 5,
  durationMs: 74,
  notice: 'Tempo search · 19 Aug 2026 16:00 → 19 Aug 2026 17:00',
  execution: { provider: 'tempo', durationMs: 74, rowCount: 5 }
}

const spans = [
  { spanId: '0000000000000001', parentSpanId: '', service: 'checkout-api', namespace: 'commerce', name: 'POST /checkout', start: 0, duration: 1480, status: 'OK', kind: 'SERVER', scope: 'checkout.http', attrs: { 'http.request.method': 'POST', 'http.route': '/checkout', 'http.response.status_code': 200 }, events: [{ name: 'cart.validated', attributes: { 'cart.items.count': 4 } }] },
  { spanId: '0000000000000002', parentSpanId: '0000000000000001', service: 'checkout-api', namespace: 'commerce', name: 'validate session', start: 24, duration: 96, status: 'OK', kind: 'INTERNAL', scope: 'checkout.session', attrs: { 'app.operation': 'validate-session' } },
  { spanId: '0000000000000003', parentSpanId: '0000000000000002', service: 'redis', namespace: 'commerce', name: 'GET session:8fa31', start: 41, duration: 18, status: 'OK', kind: 'CLIENT', scope: 'redis.client', attrs: { 'db.system': 'redis', 'db.operation.name': 'GET', 'server.address': 'checkout-cache' } },
  { spanId: '0000000000000004', parentSpanId: '0000000000000001', service: 'inventory-service', namespace: 'commerce', name: 'POST /reservations', start: 148, duration: 274, status: 'OK', kind: 'CLIENT', scope: 'http.client', attrs: { 'http.request.method': 'POST', 'server.address': 'inventory.internal' } },
  { spanId: '0000000000000005', parentSpanId: '0000000000000004', service: 'inventory-service', namespace: 'commerce', name: 'reserve items', start: 172, duration: 214, status: 'OK', kind: 'SERVER', scope: 'inventory.api', attrs: { 'app.cart.items': 4 } },
  { spanId: '0000000000000006', parentSpanId: '0000000000000005', service: 'postgres', namespace: 'commerce', name: 'SELECT inventory', start: 204, duration: 43, status: 'OK', kind: 'CLIENT', scope: 'pg', attrs: { 'db.system': 'postgresql', 'db.operation.name': 'SELECT', 'db.namespace': 'inventory', 'server.address': 'inventory-db' } },
  { spanId: '0000000000000007', parentSpanId: '0000000000000005', service: 'postgres', namespace: 'commerce', name: 'UPDATE reservations', start: 268, duration: 71, status: 'OK', kind: 'CLIENT', scope: 'pg', attrs: { 'db.system': 'postgresql', 'db.operation.name': 'UPDATE', 'db.namespace': 'inventory', 'server.address': 'inventory-db' } },
  { spanId: '0000000000000008', parentSpanId: '0000000000000001', service: 'payment-service', namespace: 'commerce', name: 'charge card', start: 438, duration: 826, status: 'ERROR', statusMessage: 'Payment provider timed out after retries', kind: 'CLIENT', scope: 'payments.checkout', attrs: { 'payment.provider': 'stripe', 'retry.count': 2, 'error.type': 'TimeoutError' }, events: [{ name: 'exception', attributes: { 'exception.type': 'TimeoutError', 'exception.message': 'Stripe request exceeded 700ms timeout', 'exception.escaped': false } }] },
  { spanId: '0000000000000009', parentSpanId: '0000000000000008', service: 'payment-service', namespace: 'commerce', name: 'POST /charges', start: 474, duration: 701, status: 'ERROR', statusMessage: 'Gateway timeout', kind: 'CLIENT', scope: 'http.client', attrs: { 'http.request.method': 'POST', 'server.address': 'api.stripe.com', 'http.response.status_code': 504, 'error.type': 'TimeoutError' } },
  { spanId: '000000000000000a', parentSpanId: '0000000000000008', service: 'payment-service', namespace: 'commerce', name: 'retry backoff', start: 1184, duration: 62, status: 'OK', kind: 'INTERNAL', scope: 'payments.retry', attrs: { 'retry.attempt': 2, 'retry.delay_ms': 60 } },
  { spanId: '000000000000000b', parentSpanId: '0000000000000001', service: 'checkout-api', namespace: 'commerce', name: 'publish order.confirmed', start: 1280, duration: 27, status: 'OK', kind: 'PRODUCER', scope: 'kafka.producer', attrs: { 'messaging.system': 'kafka', 'messaging.destination.name': 'orders.confirmed', 'messaging.operation.name': 'send', 'messaging.message.id': 'order-784392' } },
  { spanId: '000000000000000c', parentSpanId: '000000000000000b', service: 'kafka', namespace: 'platform', name: 'orders.confirmed', start: 1288, duration: 11, status: 'OK', kind: 'PRODUCER', scope: 'kafka', attrs: { 'messaging.system': 'kafka', 'messaging.destination.name': 'orders.confirmed' } },
  { spanId: '000000000000000d', parentSpanId: '000000000000000b', service: 'fulfilment-worker', namespace: 'fulfilment', name: 'process order.confirmed', start: 1322, duration: 118, status: 'OK', kind: 'CONSUMER', scope: 'kafka.consumer', attrs: { 'messaging.system': 'kafka', 'messaging.destination.name': 'orders.confirmed', 'messaging.operation.name': 'process', 'messaging.consumer.group.name': 'fulfilment-v2' }, links: [{ traceId: previewTraceId, spanId: '000000000000000b', attributes: { 'messaging.message.id': 'order-784392' } }] },
  { spanId: '000000000000000e', parentSpanId: '000000000000000d', service: 'warehouse-service', namespace: 'fulfilment', name: 'allocate shipment', start: 1341, duration: 72, status: 'OK', kind: 'CLIENT', scope: 'grpc.client', attrs: { 'rpc.system': 'grpc', 'rpc.method': 'AllocateShipment' } },
  { spanId: '000000000000000f', parentSpanId: '0000000000000001', service: 'checkout-api', namespace: 'commerce', name: 'render response', start: 1448, duration: 21, status: 'OK', kind: 'INTERNAL', scope: 'checkout.response', attrs: { 'app.operation': 'render-response' } },
  { spanId: '0000000000000010', parentSpanId: '0000000000000001', service: 'checkout-api', namespace: 'commerce', name: 'record checkout outcome', start: 1469, duration: 8, status: 'OK', kind: 'INTERNAL', scope: 'checkout.telemetry', attrs: { 'checkout.outcome': 'accepted-with-payment-retry' } }
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
