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
const traceIdFor = (index) => (0xd000 + index).toString(16).padStart(32, '0')
const spanIdFor = (index) => (index + 1).toString(16).padStart(16, '0')
const numbered = (prefix, count) => Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`)

// Deliberately meaningless synthetic names. Do not copy service names from screenshots,
// production traces, customer environments, or any other real system into visual fixtures.
const layerNames = [
  ['synthetic-gateway'],
  numbered('service', 10),
  numbered('worker', 18),
  numbered('consumer', 18),
  numbered('backend', 13)
]
const hotspotServices = new Set(['service-03', 'worker-07', 'consumer-11', 'backend-04'])

const primarySpans = []
const layerSpanIndexes = []
for (let layerIndex = 0; layerIndex < layerNames.length; layerIndex += 1) {
  const names = layerNames[layerIndex]
  const indexes = []
  for (let index = 0; index < names.length; index += 1) {
    const spanIndex = primarySpans.length
    indexes.push(spanIndex)
    const previous = layerSpanIndexes[layerIndex - 1] ?? []
    const parentIndex = layerIndex === 0 ? -1 : previous[Math.floor(index * previous.length / names.length)]
    const name = names[index]
    const hotspot = hotspotServices.has(name)
    primarySpans.push({
      spanId: spanIdFor(spanIndex),
      parentSpanId: parentIndex < 0 ? '' : spanIdFor(parentIndex),
      service: name,
      namespace: `synthetic-layer-${Math.min(layerIndex + 1, 5)}`,
      name: layerIndex === 0 ? 'POST /synthetic' : `process ${name}`,
      start: layerIndex * 560 + index * 13,
      duration: layerIndex === 0 ? 10_800 : hotspot ? 900 + (index % 5) * 120 : 90 + ((spanIndex * 37) % 430),
      status: hotspot && index % 4 === 0 ? 'ERROR' : 'OK',
      kind: layerIndex === 0 ? 'SERVER' : layerIndex >= 2 && index % 5 === 0 ? 'CONSUMER' : 'CLIENT'
    })
  }
  layerSpanIndexes.push(indexes)
}

// Add fan-in/fan-out so dense previews exercise roughly twice as many transitions as services.
const extraSpans = []
for (let layerIndex = 2; layerIndex < layerSpanIndexes.length; layerIndex += 1) {
  const current = layerSpanIndexes[layerIndex]
  const previous = layerSpanIndexes[layerIndex - 1]
  for (let index = 0; index < current.length; index += 1) {
    const target = primarySpans[current[index]]
    const primaryParent = Math.floor(index * previous.length / current.length)
    const alternateParent = previous[(primaryParent + 1 + (index % Math.max(1, previous.length - 1))) % previous.length]
    const spanIndex = primarySpans.length + extraSpans.length
    extraSpans.push({
      ...target,
      spanId: spanIdFor(spanIndex),
      parentSpanId: spanIdFor(alternateParent),
      name: `secondary ${target.name}`,
      start: target.start + 34,
      duration: Math.max(45, Math.round(target.duration * 0.62))
    })
  }
}

const denseSpans = [...primarySpans, ...extraSpans]
const denseRows = Array.from({ length: 20 }, (_, index) => ({
  traceId: traceIdFor(index),
  rootService: 'synthetic-gateway',
  rootOperation: 'POST /synthetic',
  startTimeMs: baseTime - index * 41_000,
  durationMs: 3_100 + ((index * 977) % 8_700),
  matchedSpans: denseSpans.length,
  status: index % 6 === 0 ? 'error' : 'ok'
}))

export const previewDenseTraceSearchResult = {
  columns: searchColumns,
  rows: denseRows,
  rowCount: denseRows.length,
  durationMs: 83,
  notice: 'Tempo search · synthetic dense service-map preview',
  execution: { provider: 'tempo', durationMs: 83, rowCount: denseRows.length }
}

const denseProfiles = new Map(denseRows.map((row, index) => [row.traceId, { ...row, index }]))

export function previewDenseTraceResultForId(traceId) {
  const profile = denseProfiles.get(traceId)
  if (!profile) return null
  const scale = profile.durationMs / 10_800
  const rows = denseSpans.map((span, index) => {
    const hotspot = hotspotServices.has(span.service)
    const durationMs = span.parentSpanId === ''
      ? profile.durationMs
      : Math.max(12, Math.round(span.duration * (hotspot ? 0.75 + profile.index * 0.045 : 0.72 + scale * 0.28)))
    const error = hotspot && profile.status === 'error' && index % 5 === 0
    return {
      traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      service: span.service,
      serviceNamespace: span.namespace,
      name: span.name,
      startTimeMs: profile.startTimeMs + Math.round(span.start * scale),
      durationMs,
      status: error ? 'ERROR' : span.status,
      statusMessage: error ? 'Synthetic downstream timeout' : '',
      kind: span.kind,
      scopeName: 'synthetic.preview',
      resourceAttributes: json({ 'service.name': span.service, 'service.namespace': span.namespace, 'deployment.environment.name': 'synthetic' }),
      attributes: json(span.parentSpanId === '' ? { 'http.request.method': 'POST', 'url.path': '/synthetic' } : {}),
      events: '[]',
      links: '[]'
    }
  })
  return {
    columns: spanColumns,
    rows,
    rowCount: rows.length,
    durationMs: 31,
    execution: { provider: 'tempo', durationMs: 31, rowCount: rows.length }
  }
}
