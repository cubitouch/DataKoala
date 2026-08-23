import { GcxLokiTransport } from '../src/main/gcx-loki-transport.ts'

const uid = process.env.DATAKOALA_LOKI_DATASOURCE_UID?.trim()
const expression = process.env.DATAKOALA_LOKI_QUERY?.trim()
if (!uid || !expression) {
  throw new Error('Set DATAKOALA_LOKI_DATASOURCE_UID and DATAKOALA_LOKI_QUERY to run the authenticated Loki smoke test.')
}
const context = process.env.DATAKOALA_GCX_CONTEXT?.trim() || undefined
const end = new Date(), start = new Date(end.getTime() - 15 * 60_000)
const transport = new GcxLokiTransport(context, undefined, uid)

await transport.probe()
const labels = await transport.labels({ start: start.toISOString(), end: end.toISOString() })
const result = await transport.query({ expression, start: start.toISOString(), end: end.toISOString(), step: '5s', limit: 20 })
console.log(JSON.stringify({ ok: true, datasourceUid: uid, discoveredLabels: labels.length, resultKind: result.resultKind, rows: result.rowCount, truncated: result.execution?.truncated ?? false }))
