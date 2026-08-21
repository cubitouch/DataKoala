export type TraceStatus = 'any' | 'unset' | 'error' | 'ok'
export type TraceSpanKind = 'any' | 'server' | 'client' | 'producer' | 'consumer' | 'internal' | 'unspecified'
export type TraceProtocol = 'any' | 'http' | 'rpc' | 'messaging' | 'database'
export type TraceSampleSize = '100' | '250' | '500' | 'all'

export interface TraceBuilderState {
  serviceNamespace: string
  service: string
  spanKind: TraceSpanKind
  protocol: TraceProtocol
  httpMethod: string
  endpoint: string
  rpcSystem: string
  rpcService: string
  rpcMethod: string
  messagingSystem: string
  messagingDestination: string
  messagingOperation: string
  dbSystem: string
  dbOperation: string
  spanName: string
  status: TraceStatus
  minDurationMs: string
}

export interface TraceBuilderSpanSeed {
  serviceNamespace?: unknown
  service?: unknown
  name?: unknown
  status?: unknown
  kind?: unknown
  attributes?: unknown
  resourceAttributes?: unknown
}

export const EMPTY_TRACE_BUILDER: TraceBuilderState = {
  serviceNamespace: '',
  service: '',
  spanKind: 'any',
  protocol: 'any',
  httpMethod: '',
  endpoint: '',
  rpcSystem: '',
  rpcService: '',
  rpcMethod: '',
  messagingSystem: '',
  messagingDestination: '',
  messagingOperation: '',
  dbSystem: '',
  dbOperation: '',
  spanName: '',
  status: 'any',
  minDurationMs: ''
}

const HTTP_METHOD = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE)(?:\s+(.+))?$/i

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function record(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch { return {} }
}

function firstAttribute(attributes: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = text(attributes[key]).trim()
    if (value) return value
  }
  return ''
}

function hasAttribute(attributes: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => Object.hasOwn(attributes, key) && attributes[key] !== undefined && attributes[key] !== null)
}

function normalizedSpanKind(value: unknown): TraceSpanKind {
  const kind = text(value).trim().toLowerCase().replace(/^span_kind_/, '')
  return ['server', 'client', 'producer', 'consumer', 'internal', 'unspecified'].includes(kind)
    ? kind as TraceSpanKind
    : 'any'
}

function normalizedStatus(value: unknown): TraceStatus {
  const status = text(value).trim().toLowerCase().replace(/^status_code_/, '')
  if (status.includes('error')) return 'error'
  if (status === 'ok' || status.includes('success')) return 'ok'
  if (status.includes('unset')) return 'unset'
  return 'any'
}

function protocolFromAttributes(attributes: Record<string, unknown>): TraceProtocol {
  if (hasAttribute(attributes, ['http.request.method', 'http.method', 'http.route', 'url.template', 'url.path', 'http.target'])) return 'http'
  if (hasAttribute(attributes, ['rpc.system', 'rpc.service', 'rpc.method'])) return 'rpc'
  if (hasAttribute(attributes, ['messaging.system', 'messaging.destination.name', 'messaging.destination', 'messaging.operation.type', 'messaging.operation'])) return 'messaging'
  if (hasAttribute(attributes, ['db.system.name', 'db.system', 'db.operation.name', 'db.operation'])) return 'database'
  return 'any'
}

function extractQuoted(query: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = query.match(new RegExp(`(?:^|[\\s{(&|])${escaped}\\s*=\\s*"((?:\\\\.|[^"\\\\])*)"`))
  if (!match) return ''
  try { return JSON.parse(`"${match[1]}"`) } catch { return match[1] }
}

function firstQuoted(query: string, ...keys: string[]): string {
  for (const key of keys) {
    const value = extractQuoted(query, key)
    if (value) return value
  }
  return ''
}

function hasKey(query: string, key: string): boolean {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[\\s{(&|])${escaped}\\s*(?:=|!=|=~|!~|>|<)`, 'i').test(query)
}

function enumValue<T extends string>(query: string, keys: string[], values: readonly T[], fallback: T): T {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = query.match(new RegExp(`(?:^|[\\s{(&|])${escaped}\\s*=\\s*([a-z]+)`, 'i'))
    const found = match?.[1]?.toLowerCase() as T | undefined
    if (found && values.includes(found)) return found
  }
  return fallback
}

function detectedProtocol(query: string): TraceProtocol {
  if (['span.http.request.method', 'span.http.method', 'span.http.route', 'span.url.template', 'span.url.path', 'span.http.target'].some((key) => hasKey(query, key))) return 'http'
  if (['span.rpc.system', 'span.rpc.service', 'span.rpc.method'].some((key) => hasKey(query, key))) return 'rpc'
  if (['span.messaging.system', 'span.messaging.destination.name', 'span.messaging.destination', 'span.messaging.operation.type', 'span.messaging.operation'].some((key) => hasKey(query, key))) return 'messaging'
  if (['span.db.system.name', 'span.db.system', 'span.db.operation.name', 'span.db.operation'].some((key) => hasKey(query, key))) return 'database'
  return 'any'
}

export function traceBuilderFromTraceql(query: string): TraceBuilderState {
  const duration = query.match(/(?:^|[\s{(&|])(?:span:)?duration\s*>\s*([0-9.]+)ms/i)?.[1] ?? ''
  return {
    ...EMPTY_TRACE_BUILDER,
    serviceNamespace: extractQuoted(query, 'resource.service.namespace'),
    service: extractQuoted(query, 'resource.service.name'),
    spanKind: enumValue(query, ['span:kind', 'kind'], ['server', 'client', 'producer', 'consumer', 'internal', 'unspecified'] as const, 'any'),
    protocol: detectedProtocol(query),
    httpMethod: firstQuoted(query, 'span.http.request.method', 'span.http.method'),
    endpoint: firstQuoted(query, 'span.http.route', 'span.url.template', 'span.url.path', 'span.http.target'),
    rpcSystem: extractQuoted(query, 'span.rpc.system'),
    rpcService: extractQuoted(query, 'span.rpc.service'),
    rpcMethod: extractQuoted(query, 'span.rpc.method'),
    messagingSystem: extractQuoted(query, 'span.messaging.system'),
    messagingDestination: firstQuoted(query, 'span.messaging.destination.name', 'span.messaging.destination'),
    messagingOperation: firstQuoted(query, 'span.messaging.operation.type', 'span.messaging.operation'),
    dbSystem: firstQuoted(query, 'span.db.system.name', 'span.db.system'),
    dbOperation: firstQuoted(query, 'span.db.operation.name', 'span.db.operation'),
    spanName: firstQuoted(query, 'span:name', 'name'),
    status: enumValue(query, ['span:status', 'status'], ['unset', 'error', 'ok'] as const, 'any'),
    minDurationMs: duration
  }
}

export function traceBuilderFromSpan(span: TraceBuilderSpanSeed): TraceBuilderState {
  const attributes = record(span.attributes)
  const resource = record(span.resourceAttributes)
  const name = text(span.name).trim()
  const spanKind = normalizedSpanKind(span.kind)
  let protocol = protocolFromAttributes(attributes)

  let httpMethod = firstAttribute(attributes, 'http.request.method', 'http.method')
  let endpoint = firstAttribute(attributes, 'http.route', 'url.template', 'url.path', 'http.target')
  const nameHttp = name.match(HTTP_METHOD)
  if (protocol === 'any' && nameHttp && (spanKind === 'server' || spanKind === 'client')) protocol = 'http'
  if (protocol === 'http' && nameHttp) {
    if (!httpMethod) httpMethod = nameHttp[1].toUpperCase()
    if (!endpoint && nameHttp[2]?.trim().startsWith('/')) endpoint = nameHttp[2].trim()
  }

  return {
    ...EMPTY_TRACE_BUILDER,
    serviceNamespace: text(span.serviceNamespace).trim() || firstAttribute(resource, 'service.namespace'),
    service: text(span.service).trim() || firstAttribute(resource, 'service.name'),
    spanKind,
    protocol,
    httpMethod,
    endpoint,
    rpcSystem: firstAttribute(attributes, 'rpc.system'),
    rpcService: firstAttribute(attributes, 'rpc.service'),
    rpcMethod: firstAttribute(attributes, 'rpc.method'),
    messagingSystem: firstAttribute(attributes, 'messaging.system'),
    messagingDestination: firstAttribute(attributes, 'messaging.destination.name', 'messaging.destination'),
    messagingOperation: firstAttribute(attributes, 'messaging.operation.type', 'messaging.operation'),
    dbSystem: firstAttribute(attributes, 'db.system.name', 'db.system'),
    dbOperation: firstAttribute(attributes, 'db.operation.name', 'db.operation'),
    spanName: protocol === 'any' ? name : '',
    status: normalizedStatus(span.status)
  }
}

const quoted = (value: string) => JSON.stringify(value.trim())
const equal = (key: string, value: string) => `${key} = ${quoted(value)}`
const either = (keys: string[], value: string) => keys.length === 1
  ? equal(keys[0], value)
  : `(${keys.map((key) => equal(key, value)).join(' || ')})`
const existsAny = (keys: string[]) => `(${keys.map((key) => `${key} != nil`).join(' || ')})`

export function buildTraceql(builder: TraceBuilderState): string {
  const conditions: string[] = []
  if (builder.serviceNamespace.trim()) conditions.push(equal('resource.service.namespace', builder.serviceNamespace))
  if (builder.service.trim()) conditions.push(equal('resource.service.name', builder.service))
  if (builder.spanKind !== 'any') conditions.push(`span:kind = ${builder.spanKind}`)

  if (builder.protocol === 'http') {
    if (builder.httpMethod.trim()) conditions.push(either(['span.http.request.method', 'span.http.method'], builder.httpMethod))
    if (builder.endpoint.trim()) {
      const endpointKeys = builder.spanKind === 'server'
        ? ['span.http.route']
        : builder.spanKind === 'client'
          ? ['span.url.template', 'span.url.path']
          : ['span.http.route', 'span.url.template', 'span.url.path']
      conditions.push(either(endpointKeys, builder.endpoint))
    }
    if (!builder.httpMethod.trim() && !builder.endpoint.trim()) conditions.push(existsAny(['span.http.request.method', 'span.http.method', 'span.http.route', 'span.url.template']))
  }

  if (builder.protocol === 'rpc') {
    if (builder.rpcSystem.trim()) conditions.push(equal('span.rpc.system', builder.rpcSystem))
    if (builder.rpcService.trim()) conditions.push(equal('span.rpc.service', builder.rpcService))
    if (builder.rpcMethod.trim()) conditions.push(equal('span.rpc.method', builder.rpcMethod))
    if (!builder.rpcSystem.trim() && !builder.rpcService.trim() && !builder.rpcMethod.trim()) conditions.push('span.rpc.system != nil')
  }

  if (builder.protocol === 'messaging') {
    if (builder.messagingSystem.trim()) conditions.push(equal('span.messaging.system', builder.messagingSystem))
    if (builder.messagingDestination.trim()) conditions.push(either(['span.messaging.destination.name', 'span.messaging.destination'], builder.messagingDestination))
    if (builder.messagingOperation.trim()) conditions.push(either(['span.messaging.operation.type', 'span.messaging.operation'], builder.messagingOperation))
    if (!builder.messagingSystem.trim() && !builder.messagingDestination.trim() && !builder.messagingOperation.trim()) conditions.push('span.messaging.system != nil')
  }

  if (builder.protocol === 'database') {
    if (builder.dbSystem.trim()) conditions.push(either(['span.db.system.name', 'span.db.system'], builder.dbSystem))
    if (builder.dbOperation.trim()) conditions.push(either(['span.db.operation.name', 'span.db.operation'], builder.dbOperation))
    if (!builder.dbSystem.trim() && !builder.dbOperation.trim()) conditions.push(existsAny(['span.db.system.name', 'span.db.system']))
  }

  if (builder.spanName.trim()) conditions.push(equal('span:name', builder.spanName))
  if (builder.status !== 'any') conditions.push(`span:status = ${builder.status}`)
  const duration = Number(builder.minDurationMs)
  if (builder.minDurationMs.trim() && Number.isFinite(duration) && duration >= 0) conditions.push(`span:duration > ${duration}ms`)
  return conditions.length ? `{ ${conditions.join(' && ')} }` : '{ }'
}
