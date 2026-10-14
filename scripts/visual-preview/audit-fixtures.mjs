import { syntheticSources } from './fixtures.mjs'
import { previewTraceSearchResult, previewTraceResult } from './trace-fixtures.mjs'

export const auditKinds = ['postgres', 'bigquery', 'local-files', 'sqlite-file', 'prometheus', 'loki', 'tempo']
export const auditViewports = { desktop: [1440, 900], narrow: [900, 900] }
export const auditTime = Date.UTC(2026, 7, 19, 16, 30)
export const auditLongText = 'Overflowing operation with detailed diagnostic context '.repeat(12)
export const auditLogs = Array.from({ length: 240 }, (_, index) => ({
  id: `audit-log-${index}`, timestampNs: String(BigInt(auditTime - index * 1000) * 1000000n),
  timestampMs: auditTime - index * 1000,
  line: index % 5 === 0 ? 'Request completed normally' : index % 5 === 1 ? auditLongText : index % 5 === 2 ? 'Database connection refused' : index % 5 === 3 ? 'Cache lookup returned no value' : 'Worker waiting for tasks',
  labels: { service_name: 'example-service', environment: 'example' },
  structuredMetadata: { region: 'example-region' }, parsedFields: {}, severity: index % 5 === 2 ? 'ERROR' : 'INFO',
  traceId: '00000000000000000000000000000101',
}))
export const auditLogResult = { resultKind: 'logs', columns: [{ name: 'line', dataTypeID: 25, dataTypeName: 'text' }], rows: auditLogs, logRows: auditLogs, rowCount: auditLogs.length, durationMs: 7, execution: { provider: 'loki', durationMs: 7 } }
export const auditTraceResult = { ...previewTraceSearchResult, rows: previewTraceSearchResult.rows.map((row, index) => ({ ...row, rootService: 'example-service', rootOperation: index === 1 ? auditLongText : 'Request completed normally', startTimeMs: auditTime - index * 1000 })), rowCount: 5 }
export const auditSpanResult = { ...previewTraceResult, rows: previewTraceResult.rows.map((row) => ({ ...row, startTimeMs: auditTime + Number(row.startTimeMs) - Number(previewTraceResult.rows[0].startTimeMs) })) }
export const auditSqlResult = { columns: [{ name: 'category', dataTypeID: 25, dataTypeName: 'text', logicalType: 'string' }, { name: 'value', dataTypeID: 23, dataTypeName: 'int4', logicalType: 'number' }], rows: [{ category: 'Request completed normally', value: 42 }, { category: auditLongText, value: 17 }, { category: 'Database connection refused', value: 3 }], rowCount: 3, durationMs: 7 }
export const auditRange = { kind: 'custom', startDate: '2026-08-19', startTime: '16:00', endDate: '2026-08-19', endTime: '17:00', recurringWindows: [] }
export const auditProfiles = Object.fromEntries(auditKinds.map((kind) => [kind, {
  ...(syntheticSources.find((source) => source.kind === kind) ?? { kind, version: 1, readonly: true, transport: { kind: 'gcx', context: 'example', datasourceUid: `example-${kind}` } }),
  id: `audit-${kind}`, name: `Example ${kind}`,
}]))
export const auditSchemas = [{ name: 'example', isSystem: false, relations: [{ schema: 'example', name: 'events', qualifiedName: 'example.events', kind: 'r', columnsStatus: 'loaded', columns: auditSqlResult.columns }, { schema: 'example', name: 'example-service', qualifiedName: 'example.example-service', kind: 'service', columnsStatus: 'loaded', columns: [], details: { kind: 'service', serviceNamespace: 'example' } }] }]

export const auditScreenshots = []
for (const viewport of Object.keys(auditViewports)) {
  for (const kind of auditKinds) for (const mode of ['raw', 'builder']) auditScreenshots.push(`${kind}-${mode}-${viewport}.png`)
  for (const list of ['logs', 'patterns', 'traces']) for (const state of ['default', 'hover', 'focus', 'open', 'scroll', 'empty']) auditScreenshots.push(`${list}-${state}-${viewport}.png`)
  for (const kind of ['postgres', 'loki', 'tempo']) for (const state of ['fresh', 'loading', 'error', 'retry']) auditScreenshots.push(`${kind}-${state}-${viewport}.png`)
  auditScreenshots.push(`postgres-error-chart-${viewport}.png`)
  for (const state of ['partial','partial-complete']) auditScreenshots.push(`tempo-${state}-${viewport}.png`)
  for (const kind of ['postgres','loki','tempo']) for (const state of ['default','changed']) auditScreenshots.push(`views-${kind}-${state}-${viewport}.png`)
  for (const kind of ['postgres','tempo']) for (const state of ['loading','error','settled']) auditScreenshots.push(`metadata-${kind}-${state}-${viewport}.png`)
  for(const surface of ['query','log']) for(const state of ['error','success']) auditScreenshots.push(`clipboard-${surface}-${state}-${viewport}.png`)
  for(const dialog of ['settings','loki']) for(const state of ['options','escape']) auditScreenshots.push(`nested-${dialog}-${state}-${viewport}.png`)
  for (const dialog of ['picker', ...auditKinds, 'settings', 'reset', 'presets']) auditScreenshots.push(`dialog-${dialog}-${viewport}.png`)
  for (const kind of ['postgres', 'prometheus', 'loki', 'tempo']) for (const state of ['options', 'no-options']) auditScreenshots.push(`selector-${kind}-${state}-${viewport}.png`)
}
// CAP-01 covers only otherwise missing PostgreSQL substates at the normal desktop viewport.
auditScreenshots.push(
  'cap01-pg-validation-desktop.png',
  'cap01-pg-string-desktop.png',
  'cap01-pg-tls-desktop.png',
  // CAP-02: existing-profile edit/delete/read-only; desktop-only, no new viewport matrix.
  'cap02-pg-edit-desktop.png',
  'cap02-pg-delete-desktop.png',
  'cap02-pg-readonly-desktop.png',
)
export const auditComparisonFiles = ['compare-lists.png', 'compare-toolbar.png', 'compare-dialogs.png', 'compare-feedback.png', 'compare-selectors.png', 'compare-detail.png']
export const auditCaptions = Object.fromEntries([...auditScreenshots, ...auditComparisonFiles].map((file) => [file, file.replace('.png', '').replaceAll('-', ' ')]))
