export const previewTraceId = '4bf92f3577b34da6a3ce929d0e0e4736'

const searchColumns = [
  { name: 'traceId', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'rootService', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'rootOperation', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'startTimeMs', dataTypeID: 0, dataTypeName: 'float8', logicalType: 'number' },
  { name: 'durationMs', dataTypeID: 0, dataTypeName: 'float8', logicalType: 'number' },
  { name: 'matchedSpans', dataTypeID: 0, dataTypeName: 'int4', logicalType: 'number' }
]

const spanColumns = [
  { name: 'traceId', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'spanId', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'parentSpanId', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'service', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'name', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'startTimeMs', dataTypeID: 0, dataTypeName: 'float8', logicalType: 'number' },
  { name: 'durationMs', dataTypeID: 0, dataTypeName: 'float8', logicalType: 'number' },
  { name: 'status', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'kind', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' },
  { name: 'attributes', dataTypeID: 0, dataTypeName: 'json', logicalType: 'json' }
]

const baseTime = 1787133600000
const attributes = (value) => JSON.stringify(value)

export const previewTraceSearchResult = {
  columns: searchColumns,
  rows: [
    { traceId: previewTraceId, rootService: 'checkout-api', rootOperation: 'POST /checkout', startTimeMs: baseTime, durationMs: 1480, matchedSpans: 16 },
    { traceId: '93b7a6c1d35f4b97b6425f7801dc1c90', rootService: 'checkout-api', rootOperation: 'POST /checkout', startTimeMs: baseTime - 86_000, durationMs: 418, matchedSpans: 13 },
    { traceId: '27af7654cde84e37a1d799b7fca23a5d', rootService: 'checkout-api', rootOperation: 'POST /checkout', startTimeMs: baseTime - 147_000, durationMs: 392, matchedSpans: 12 },
    { traceId: 'c177a85ca1db4312a74eb42e155bb87e', rootService: 'checkout-api', rootOperation: 'POST /checkout', startTimeMs: baseTime - 238_000, durationMs: 906, matchedSpans: 15 },
    { traceId: '7f02e9dbf34c4cf6a02c4cf7064b4213', rootService: 'checkout-api', rootOperation: 'POST /checkout', startTimeMs: baseTime - 319_000, durationMs: 447, matchedSpans: 13 }
  ],
  rowCount: 5,
  durationMs: 74,
  notice: 'Tempo search · last 1h · max 20 traces'
}

const spans = [
  { spanId: '0000000000000001', parentSpanId: '', service: 'checkout-api', name: 'POST /checkout', start: 0, duration: 1480, status: 'OK', kind: 'SERVER', attrs: { 'http.request.method': 'POST', 'http.route': '/checkout', 'http.response.status_code': 200, 'service.namespace': 'commerce', 'deployment.environment.name': 'production' } },
  { spanId: '0000000000000002', parentSpanId: '0000000000000001', service: 'checkout-api', name: 'validate session', start: 24, duration: 96, status: 'OK', kind: 'INTERNAL', attrs: { 'app.operation': 'validate-session' } },
  { spanId: '0000000000000003', parentSpanId: '0000000000000002', service: 'redis', name: 'GET session:8fa31', start: 41, duration: 18, status: 'OK', kind: 'CLIENT', attrs: { 'db.system': 'redis', 'db.operation.name': 'GET', 'server.address': 'checkout-cache' } },
  { spanId: '0000000000000004', parentSpanId: '0000000000000001', service: 'inventory-service', name: 'POST /reservations', start: 148, duration: 274, status: 'OK', kind: 'CLIENT', attrs: { 'http.request.method': 'POST', 'server.address': 'inventory.internal', 'service.namespace': 'commerce' } },
  { spanId: '0000000000000005', parentSpanId: '0000000000000004', service: 'inventory-service', name: 'reserve items', start: 172, duration: 214, status: 'OK', kind: 'SERVER', attrs: { 'app.cart.items': 4, 'service.namespace': 'commerce' } },
  { spanId: '0000000000000006', parentSpanId: '0000000000000005', service: 'postgres', name: 'SELECT inventory', start: 204, duration: 43, status: 'OK', kind: 'CLIENT', attrs: { 'db.system': 'postgresql', 'db.operation.name': 'SELECT', 'db.namespace': 'inventory', 'server.address': 'inventory-db' } },
  { spanId: '0000000000000007', parentSpanId: '0000000000000005', service: 'postgres', name: 'UPDATE reservations', start: 268, duration: 71, status: 'OK', kind: 'CLIENT', attrs: { 'db.system': 'postgresql', 'db.operation.name': 'UPDATE', 'db.namespace': 'inventory', 'server.address': 'inventory-db' } },
  { spanId: '0000000000000008', parentSpanId: '0000000000000001', service: 'payment-service', name: 'charge card', start: 438, duration: 826, status: 'ERROR', kind: 'CLIENT', attrs: { 'service.namespace': 'commerce', 'payment.provider': 'stripe', 'retry.count': 2, 'error.type': 'TimeoutError' } },
  { spanId: '0000000000000009', parentSpanId: '0000000000000008', service: 'payment-service', name: 'POST /charges', start: 474, duration: 701, status: 'ERROR', kind: 'CLIENT', attrs: { 'http.request.method': 'POST', 'server.address': 'api.stripe.com', 'http.response.status_code': 504, 'error.type': 'TimeoutError' } },
  { spanId: '000000000000000a', parentSpanId: '0000000000000008', service: 'payment-service', name: 'retry backoff', start: 1184, duration: 62, status: 'OK', kind: 'INTERNAL', attrs: { 'retry.attempt': 2, 'retry.delay_ms': 60 } },
  { spanId: '000000000000000b', parentSpanId: '0000000000000001', service: 'checkout-api', name: 'publish order.confirmed', start: 1280, duration: 27, status: 'OK', kind: 'PRODUCER', attrs: { 'messaging.system': 'kafka', 'messaging.destination.name': 'orders.confirmed', 'messaging.operation.name': 'send' } },
  { spanId: '000000000000000c', parentSpanId: '000000000000000b', service: 'kafka', name: 'orders.confirmed', start: 1288, duration: 11, status: 'OK', kind: 'PRODUCER', attrs: { 'messaging.system': 'kafka', 'messaging.destination.name': 'orders.confirmed' } },
  { spanId: '000000000000000d', parentSpanId: '000000000000000b', service: 'fulfilment-worker', name: 'process order.confirmed', start: 1322, duration: 118, status: 'OK', kind: 'CONSUMER', attrs: { 'service.namespace': 'fulfilment', 'messaging.system': 'kafka', 'messaging.destination.name': 'orders.confirmed', 'messaging.operation.name': 'process', 'messaging.consumer.group.name': 'fulfilment-v2' } },
  { spanId: '000000000000000e', parentSpanId: '000000000000000d', service: 'warehouse-service', name: 'allocate shipment', start: 1341, duration: 72, status: 'OK', kind: 'CLIENT', attrs: { 'service.namespace': 'fulfilment', 'rpc.system': 'grpc', 'rpc.method': 'AllocateShipment' } },
  { spanId: '000000000000000f', parentSpanId: '0000000000000001', service: 'checkout-api', name: 'render response', start: 1448, duration: 21, status: 'OK', kind: 'INTERNAL', attrs: { 'app.operation': 'render-response' } },
  { spanId: '0000000000000010', parentSpanId: '0000000000000001', service: 'checkout-api', name: 'record checkout outcome', start: 1469, duration: 8, status: 'OK', kind: 'INTERNAL', attrs: { 'checkout.outcome': 'accepted-with-payment-retry' } }
]

export const previewTraceResult = {
  columns: spanColumns,
  rows: spans.map((span) => ({
    traceId: previewTraceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    service: span.service,
    name: span.name,
    startTimeMs: baseTime + span.start,
    durationMs: span.duration,
    status: span.status,
    kind: span.kind,
    attributes: attributes(span.attrs)
  })),
  rowCount: spans.length,
  durationMs: 51
}
