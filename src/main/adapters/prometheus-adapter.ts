import type { DataSourceAdapter, DataSourceSession } from '../data-source.ts'
import type { DataSourceCapabilities, PrometheusProfile, QueryResult } from '../../shared/types.ts'
import { discoverPrometheus } from '../prometheus-discovery.ts'

const capabilities: DataSourceCapabilities = {
  builder: false, explain: false, analyze: false, queryCancellation: false,
  parameterizedQueries: false, costEstimate: false, serverReadOnly: true, schemaAutocomplete: false
}

export class PrometheusAdapter implements DataSourceAdapter {
  readonly kind = 'prometheus' as const
  async test(profile: PrometheusProfile) {
    try {
      const result = await discoverPrometheus(profile.transport)
      return { ok: true as const, sourceInfo: { label: `Prometheus · ${result.metricNames.length} metrics` } }
    } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : String(error) } }
  }
  async connect(profile: PrometheusProfile) {
    const tested = await this.test(profile)
    if (!tested.ok) return { result: tested }
    const unsupported = async (): Promise<QueryResult> => { throw new Error('PromQL execution is not available yet.') }
    const session: DataSourceSession = {
      info: { profileId: profile.id, provider: 'prometheus' }, capabilities,
      query: unsupported, listNamespaces: async () => [], listRelations: async () => [],
      describeRelation: async () => [], close: async () => {}
    }
    return { result: { ...tested, generation: Date.now() }, session }
  }
}
