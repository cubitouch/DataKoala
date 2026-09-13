import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTraceql, EMPTY_TRACE_BUILDER, mergeTraceBuilderState, traceBuilderFromSpan, traceBuilderFromTraceql, type TraceBuilderState } from './traceBuilder.ts'

const builder = (patch: Partial<TraceBuilderState>): TraceBuilderState => ({ ...EMPTY_TRACE_BUILDER, ...patch })

test('empty trace builder keeps the broad TraceQL selector', () => {
  assert.equal(buildTraceql(EMPTY_TRACE_BUILDER), '{ }')
})

test('merges generated structured constraints while preserving absent and advanced constraints', () => {
  const current = builder({
    serviceNamespace: 'commerce',
    service: 'checkout',
    spanKind: 'client',
    status: 'ok',
    minDurationMs: '250',
    advancedFilters: [
      { attribute: 'resource.deployment.environment.name', scope: 'resource', mode: 'include', values: ['production'] },
      { attribute: 'resource.cloud.region', scope: 'resource', mode: 'include', values: ['eu-west-1'] }
    ]
  })
  const merged = mergeTraceBuilderState(current, builder({ service: 'payments', spanKind: 'server', status: 'error' }))

  assert.equal(merged.service, 'payments')
  assert.equal(merged.spanKind, 'server')
  assert.equal(merged.status, 'error')
  assert.equal(merged.minDurationMs, '250')
  assert.equal(merged.serviceNamespace, 'commerce')
  assert.deepEqual(merged.advancedFilters, current.advancedFilters)
})

test('incoming advanced filters replace semantic conflicts, normalize values, and merge idempotently', () => {
  const current = builder({ advancedFilters: [
    { attribute: ' resource.deployment.environment.name ', scope: 'resource', mode: 'include', values: [' production ', 'production'] },
    { attribute: 'span.custom', scope: 'span', mode: 'include', values: ['keep'] },
    { attribute: 'resource.deployment.environment.name', scope: 'resource', mode: 'include', values: ['production'] }
  ] })
  const incoming = builder({ advancedFilters: [
    { attribute: 'resource.deployment.environment.name', scope: 'resource', mode: 'exclude', values: [' staging ', 'staging'] },
    { attribute: 'resource.cloud.region', scope: 'resource', mode: 'include', values: [' eu-west-1 ', 'eu-west-1'] }
  ] })
  const once = mergeTraceBuilderState(current, incoming)
  const twice = mergeTraceBuilderState(once, incoming)

  assert.deepEqual(once.advancedFilters, [
    { attribute: 'resource.deployment.environment.name', scope: 'resource', mode: 'exclude', values: ['staging'] },
    { attribute: 'span.custom', scope: 'span', mode: 'include', values: ['keep'] },
    { attribute: 'resource.cloud.region', scope: 'resource', mode: 'include', values: ['eu-west-1'] }
  ])
  assert.deepEqual(twice, once)
  const query = buildTraceql(twice)
  assert.equal(query.match(/deployment\.environment\.name/g)?.length, 1)
  assert.equal(query.match(/cloud\.region/g)?.length, 1)
})

test('reconciles protocol details without retaining fields from an inactive protocol', () => {
  const http = builder({ protocol: 'http', httpMethod: 'GET', endpoint: '/orders' })
  assert.deepEqual(
    mergeTraceBuilderState(http, builder({ protocol: 'http', httpMethod: 'POST' })),
    builder({ protocol: 'http', httpMethod: 'POST', endpoint: '/orders' })
  )
  assert.deepEqual(
    mergeTraceBuilderState(http, builder({ protocol: 'rpc', rpcSystem: 'grpc', rpcMethod: 'ListOrders' })),
    builder({ protocol: 'rpc', rpcSystem: 'grpc', rpcMethod: 'ListOrders' })
  )
  assert.deepEqual(mergeTraceBuilderState(http, builder({ protocol: 'any', rpcSystem: 'grpc' })), http)
  assert.equal(
    mergeTraceBuilderState(builder({ spanName: 'POST /example' }), builder({ protocol: 'http', spanName: '' })).spanName,
    'POST /example'
  )
})

test('merged constraints survive a TraceQL round trip', () => {
  const current = builder({
    service: 'checkout',
    minDurationMs: '100',
    protocol: 'http',
    endpoint: '/checkout',
    advancedFilters: [{ attribute: 'resource.deployment.environment.name', scope: 'resource', mode: 'include', values: ['production'] }]
  })
  const merged = mergeTraceBuilderState(current, builder({ service: 'payments', protocol: 'http', httpMethod: 'POST', status: 'error' }))
  const reparsed = traceBuilderFromTraceql(buildTraceql(merged))

  assert.equal(reparsed.service, 'payments')
  assert.equal(reparsed.minDurationMs, '100')
  assert.equal(reparsed.protocol, 'http')
  assert.equal(reparsed.httpMethod, 'POST')
  assert.equal(reparsed.endpoint, '/checkout')
  assert.equal(reparsed.status, 'error')
  assert.deepEqual(reparsed.advancedFilters, current.advancedFilters)
})

test('builds and parses faceted attribute predicates', () => {
  assert.equal(buildTraceql(builder({ advancedFilters: [{ attribute: 'resource.cloud.region', scope: 'resource', mode: 'include', values: ['eu-west-1', 'eu-west-3'] }] })), '{ (resource.cloud.region = "eu-west-1" || resource.cloud.region = "eu-west-3") }')
  assert.equal(buildTraceql(builder({ advancedFilters: [{ attribute: 'resource.deployment.environment.name', scope: 'resource', mode: 'exclude', values: ['staging', 'test'] }] })), '{ resource.deployment.environment.name != "staging" && resource.deployment.environment.name != "test" }')
  assert.equal(buildTraceql(builder({ advancedFilters: [{ attribute: 'span.custom', scope: 'span', mode: 'include', values: ['a"b'] }] })), '{ span.custom = "a\\\"b" }')
  assert.equal(buildTraceql(builder({ advancedFilters: [{ attribute: 'resource.cloud.region', scope: 'resource', mode: 'include', values: [] }] })), '{ }')
  assert.equal(buildTraceql(builder({ advancedFilters: [{ attribute: 'invalid; true', scope: 'span', mode: 'include', values: ['x'] }] })), '{ }')
  const parsed = traceBuilderFromTraceql('{ resource.service.name = "checkout" && (resource.cloud.region = "eu-west-1" || resource.cloud.region = "eu-west-3") }')
  assert.equal(parsed.service, 'checkout')
  assert.deepEqual(parsed.advancedFilters, [{ attribute: 'resource.cloud.region', scope: 'resource', mode: 'include', values: ['eu-west-1', 'eu-west-3'] }])
})

test('does not import boolean structures whose facet semantics cannot be preserved', () => {
  assert.deepEqual(traceBuilderFromTraceql('{ resource.cloud.region = "eu-west-1" && resource.cloud.region = "eu-west-3" }').advancedFilters, [])
  assert.deepEqual(traceBuilderFromTraceql('{ resource.cloud.region != "eu-west-1" || resource.cloud.region != "eu-west-3" }').advancedFilters, [])
  assert.deepEqual(traceBuilderFromTraceql('{ resource.cloud.region = "eu-west-1" }').advancedFilters, [
    { attribute: 'resource.cloud.region', scope: 'resource', mode: 'include', values: ['eu-west-1'] }
  ])
  assert.deepEqual(traceBuilderFromTraceql('{ resource.cloud.region = "eu-west-1" || span.custom = "foo" }').advancedFilters, [])
  assert.deepEqual(traceBuilderFromTraceql('{ resource.service.name = "checkout" || resource.cloud.region = "eu-west-1" }').advancedFilters, [])
  assert.deepEqual(traceBuilderFromTraceql('{ (resource.service.name = "checkout" || resource.cloud.region = "eu-west-1") && span:status = error }').advancedFilters, [])
})

test('builds service, kind, status and duration filters with scoped intrinsics', () => {
  assert.equal(
    buildTraceql(builder({ serviceNamespace: 'commerce', service: 'checkout-api', spanKind: 'server', status: 'error', minDurationMs: '300' })),
    '{ resource.service.namespace = "commerce" && resource.service.name = "checkout-api" && span:kind = server && span:status = error && span:duration > 300ms }'
  )
})

test('HTTP controls separate method from route and tolerate semantic-convention aliases', () => {
  assert.equal(
    buildTraceql(builder({ spanKind: 'server', protocol: 'http', httpMethod: 'POST', endpoint: '/checkout' })),
    '{ span:kind = server && (span.http.request.method = "POST" || span.http.method = "POST") && (span.http.route = "/checkout" || span.url.template = "/checkout" || span.url.path = "/checkout" || span.http.target = "/checkout") }'
  )
  assert.equal(
    buildTraceql(builder({ spanKind: 'client', protocol: 'http', endpoint: '/payments/{id}' })),
    '{ span:kind = client && (span.http.route = "/payments/{id}" || span.url.template = "/payments/{id}" || span.url.path = "/payments/{id}" || span.http.target = "/payments/{id}") }'
  )
})

test('server Explore similar queries preserve url.path-only root spans', () => {
  const seeded = traceBuilderFromSpan({
    serviceNamespace: 'commerce',
    service: 'checkout-api',
    kind: 'SERVER',
    name: 'POST /checkout/42',
    status: 'UNSET',
    attributes: JSON.stringify({ 'http.request.method': 'POST', 'url.path': '/checkout/42' })
  })
  const query = buildTraceql(seeded)

  assert.equal(seeded.protocol, 'http')
  assert.equal(seeded.endpoint, '/checkout/42')
  assert.match(query, /span\.url\.path = "\/checkout\/42"/)
  assert.match(query, /span:kind = server/)
})

test('protocol-only filters still narrow the search', () => {
  assert.match(buildTraceql(builder({ protocol: 'http' })), /span\.http\.request\.method != nil/)
  assert.match(buildTraceql(builder({ protocol: 'http' })), /span\.url\.path != nil/)
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
