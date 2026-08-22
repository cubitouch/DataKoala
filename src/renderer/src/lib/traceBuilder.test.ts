import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTraceql, EMPTY_TRACE_BUILDER, traceBuilderFromSpan, traceBuilderFromTraceql, type TraceBuilderState } from './traceBuilder.ts'

const builder = (patch: Partial<TraceBuilderState>): TraceBuilderState => ({ ...EMPTY_TRACE_BUILDER, ...patch })

test('empty trace builder keeps the broad TraceQL selector', () => {
  assert.equal(buildTraceql(EMPTY_TRACE_BUILDER), '{ }')
})

test('builds and parses safe generic attribute predicates', () => {
  assert.equal(buildTraceql(builder({ advancedAttribute: 'resource.cloud.region', advancedOperator: '=', advancedValue: 'eu-west-1' })), '{ resource.cloud.region = "eu-west-1" }')
  assert.equal(buildTraceql(builder({ advancedAttribute: 'resource.deployment.environment.name', advancedOperator: '!=', advancedValue: 'staging' })), '{ resource.deployment.environment.name != "staging" }')
  assert.equal(buildTraceql(builder({ advancedAttribute: 'span.http.route.template', advancedOperator: '=~', advancedValue: 'prod.*"x' })), '{ span.http.route.template =~ "prod.*\\\"x" }')
  assert.equal(buildTraceql(builder({ advancedAttribute: 'span.http.response.status_code', advancedOperator: '>=', advancedValue: '500' })), '{ span.http.response.status_code >= 500 }')
  assert.equal(buildTraceql(builder({ advancedAttribute: 'resource.cloud.region', advancedValue: '' })), '{ }')
  assert.equal(buildTraceql(builder({ advancedAttribute: 'invalid; true', advancedValue: 'x' })), '{ }')
  const parsed = traceBuilderFromTraceql('{ resource.service.name = "checkout" && resource.cloud.region = "eu-west-1" }')
  assert.equal(parsed.service, 'checkout')
  assert.equal(parsed.advancedAttribute, 'resource.cloud.region')
  assert.equal(parsed.advancedValue, 'eu-west-1')
})

test('builds service, kind, status and duration filters with scoped intrinsics', () => {
  assert.equal(
    buildTraceql(builder({ serviceNamespace: 'commerce', service: 'checkout-api', spanKind: 'server', status: 'error', minDurationMs: '300' })),
    '{ resource.service.namespace = "commerce" && resource.service.name = "checkout-api" && span:kind = server && span:status = error && span:duration > 300ms }'
  )
})

test('HTTP controls separate method from route and tolerate old method attributes', () => {
  assert.equal(
    buildTraceql(builder({ spanKind: 'server', protocol: 'http', httpMethod: 'POST', endpoint: '/checkout' })),
    '{ span:kind = server && (span.http.request.method = "POST" || span.http.method = "POST") && span.http.route = "/checkout" }'
  )
  assert.equal(
    buildTraceql(builder({ spanKind: 'client', protocol: 'http', endpoint: '/payments/{id}' })),
    '{ span:kind = client && (span.url.template = "/payments/{id}" || span.url.path = "/payments/{id}") }'
  )
})

test('protocol-only filters still narrow the search', () => {
  assert.match(buildTraceql(builder({ protocol: 'http' })), /span\.http\.request\.method != nil/)
  assert.equal(buildTraceql(builder({ protocol: 'rpc' })), '{ span.rpc.system != nil }')
  assert.equal(buildTraceql(builder({ protocol: 'messaging' })), '{ span.messaging.system != nil }')
  assert.match(buildTraceql(builder({ protocol: 'database' })), /span\.db\.system\.name != nil/)
})

test('builds RPC, messaging and database semantic-convention filters', () => {
  assert.equal(
    buildTraceql(builder({ protocol: 'rpc', rpcSystem: 'grpc', rpcService: 'CartService', rpcMethod: 'Checkout' })),
    '{ span.rpc.system = "grpc" && span.rpc.service = "CartService" && span.rpc.method = "Checkout" }'
  )
  assert.equal(
    buildTraceql(builder({ protocol: 'messaging', messagingSystem: 'kafka', messagingDestination: 'orders', messagingOperation: 'publish' })),
    '{ span.messaging.system = "kafka" && (span.messaging.destination.name = "orders" || span.messaging.destination = "orders") && (span.messaging.operation.type = "publish" || span.messaging.operation = "publish") }'
  )
  assert.equal(
    buildTraceql(builder({ protocol: 'database', dbSystem: 'postgresql', dbOperation: 'SELECT' })),
    '{ (span.db.system.name = "postgresql" || span.db.system = "postgresql") && (span.db.operation.name = "SELECT" || span.db.operation = "SELECT") }'
  )
})

test('parses existing unscoped builder queries and new structured fields', () => {
  assert.deepEqual(
    traceBuilderFromTraceql('{ resource.service.namespace = "commerce" && resource.service.name = "checkout-api" && name = "POST /checkout" && status = error && duration > 300ms }'),
    builder({ serviceNamespace: 'commerce', service: 'checkout-api', spanName: 'POST /checkout', status: 'error', minDurationMs: '300' })
  )

  const parsed = traceBuilderFromTraceql('{ span:kind = server && span.http.request.method = "GET" && span.http.route = "/orders/{id}" && span:status = ok }')
  assert.equal(parsed.spanKind, 'server')
  assert.equal(parsed.protocol, 'http')
  assert.equal(parsed.httpMethod, 'GET')
  assert.equal(parsed.endpoint, '/orders/{id}')
  assert.equal(parsed.status, 'ok')
})

test('seeds Explore similar from HTTP span semantic attributes instead of the advanced operation field', () => {
  const seeded = traceBuilderFromSpan({
    serviceNamespace: 'commerce',
    service: 'checkout-api',
    kind: 'SERVER',
    name: 'POST',
    status: 'OK',
    attributes: JSON.stringify({ 'http.request.method': 'POST', 'http.route': '/checkout' })
  })

  assert.deepEqual(seeded, builder({
    serviceNamespace: 'commerce',
    service: 'checkout-api',
    spanKind: 'server',
    protocol: 'http',
    httpMethod: 'POST',
    endpoint: '/checkout',
    status: 'ok'
  }))
  assert.equal(seeded.spanName, '')
})

test('seeds Explore similar from RPC, messaging and database semantic attributes', () => {
  assert.deepEqual(
    traceBuilderFromSpan({ kind: 'CLIENT', name: 'CartService/Checkout', attributes: { 'rpc.system': 'grpc', 'rpc.service': 'CartService', 'rpc.method': 'Checkout' } }),
    builder({ spanKind: 'client', protocol: 'rpc', rpcSystem: 'grpc', rpcService: 'CartService', rpcMethod: 'Checkout' })
  )
  assert.deepEqual(
    traceBuilderFromSpan({ kind: 'PRODUCER', name: 'orders publish', attributes: { 'messaging.system': 'kafka', 'messaging.destination.name': 'orders', 'messaging.operation.type': 'publish' } }),
    builder({ spanKind: 'producer', protocol: 'messaging', messagingSystem: 'kafka', messagingDestination: 'orders', messagingOperation: 'publish' })
  )
  assert.deepEqual(
    traceBuilderFromSpan({ kind: 'CLIENT', name: 'SELECT inventory', attributes: { 'db.system.name': 'postgresql', 'db.operation.name': 'SELECT' } }),
    builder({ spanKind: 'client', protocol: 'database', dbSystem: 'postgresql', dbOperation: 'SELECT' })
  )
})

test('uses an HTTP-looking span name as a structured fallback and preserves genuinely custom names as advanced', () => {
  assert.deepEqual(
    traceBuilderFromSpan({ kind: 'SERVER', name: 'POST /checkout', status: 'UNSET' }),
    builder({ spanKind: 'server', protocol: 'http', httpMethod: 'POST', endpoint: '/checkout', status: 'unset' })
  )
  assert.deepEqual(
    traceBuilderFromSpan({ kind: 'INTERNAL', name: 'refresh inventory cache' }),
    builder({ spanKind: 'internal', spanName: 'refresh inventory cache' })
  )
})
