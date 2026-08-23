import type { DataSourceAdapter, DataSourceSession } from '../data-source.ts'
import type { LokiProfile } from '../../shared/types.ts'
import type { LokiMetadataRequest } from '../../shared/loki.ts'
import { GcxLokiTransport, type LokiTransport } from '../gcx-loki-transport.ts'

export class LokiAdapter implements DataSourceAdapter {
  readonly kind = 'loki' as const
  private readonly createTransport: (context?: string, uid?: string) => LokiTransport
  constructor(createTransport: (context?: string, uid?: string) => LokiTransport = (context, uid) => new GcxLokiTransport(context, undefined, uid)) {
    this.createTransport = createTransport
  }
  async test(profile: LokiProfile) {
    try { await this.createTransport(profile.transport.context, profile.transport.datasourceUid).probe(); return { ok: true as const, sourceInfo: { label: 'Loki' } } }
    catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : String(error) } }
  }
  async connect(profile: LokiProfile) {
    const transport = this.createTransport(profile.transport.context, profile.transport.datasourceUid)
    const session: DataSourceSession = {
      info: { profileId: profile.id, provider: 'loki' },
      capabilities: { builder: true, explain: false, analyze: false, queryCancellation: false, parameterizedQueries: false, costEstimate: false, serverReadOnly: true, schemaAutocomplete: false },
      query: ({ sql, loki }) => { if (!loki) throw new Error('Loki queries require a time range, step, and result limit.'); return transport.query({ expression: sql, ...loki }) },
      lokiLabels: (request: LokiMetadataRequest) => transport.labels(request),
      lokiLabelValues: (label: string, request: LokiMetadataRequest) => transport.labelValues(label, request),
      formatLokiQuery: (query: string) => transport.formatQuery(query),
      listNamespaces: async () => [{ name: 'Logs' }], listRelations: async () => [], describeRelation: async () => [], close: async () => {}
    }
    return { result: { ok: true as const, generation: Date.now(), sourceInfo: { label: 'Loki' } }, session }
  }
}
