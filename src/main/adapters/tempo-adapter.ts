import type { DataSourceAdapter, DataSourceSession } from '../data-source.ts'
import type { DataSourceCapabilities, TempoProfile } from '../../shared/types.ts'
import { GcxTempoTransport, type TempoTransport } from '../gcx-tempo-transport.ts'

const capabilities: DataSourceCapabilities = {
  builder: true, explain: false, analyze: false, queryCancellation: false,
  parameterizedQueries: false, costEstimate: false, serverReadOnly: true, schemaAutocomplete: false
}

const DEFAULT_SERVICE_NAMESPACE = 'Services'

export class TempoAdapter implements DataSourceAdapter {
  readonly kind = 'tempo' as const
  private readonly createTransport: (context?: string, datasourceUid?: string) => TempoTransport

  constructor(
    createTransport: (context?: string, datasourceUid?: string) => TempoTransport =
      (context, datasourceUid) => new GcxTempoTransport(context, undefined, datasourceUid)
  ) {
    this.createTransport = createTransport
  }

  async test(profile: TempoProfile) {
    try {
      const transport = this.createTransport(profile.transport.context, profile.transport.datasourceUid)
      await transport.probe()
      return { ok: true as const, sourceInfo: { label: 'Grafana Tempo via gcx' } }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async connect(profile: TempoProfile) {
    const transport = this.createTransport(profile.transport.context, profile.transport.datasourceUid)
    try {
      await transport.probe()
      const services = await transport.services()
      const namespaceNames = [...new Set(services.map((service) => service.namespace || DEFAULT_SERVICE_NAMESPACE))]
        .sort((left, right) => left.localeCompare(right))
      const relations = services.map((service) => ({
        namespace: service.namespace || DEFAULT_SERVICE_NAMESPACE,
        name: service.name,
        kind: 'service' as const,
        details: { kind: 'service' as const, ...(service.namespace ? { serviceNamespace: service.namespace } : {}) }
      }))
      const sourceInfo = { label: `Tempo · ${services.length} service${services.length === 1 ? '' : 's'}` }
      const session: DataSourceSession = {
        info: { profileId: profile.id, provider: 'tempo' },
        capabilities,
        query: ({ sql }) => transport.query(sql),
        listNamespaces: async () => namespaceNames.map((name) => ({ name })),
        listRelations: async (namespace) => namespace ? relations.filter((relation) => relation.namespace === namespace.name) : relations,
        describeRelation: async () => [],
        close: async () => {}
      }
      return { result: { ok: true as const, generation: Date.now(), sourceInfo }, session }
    } catch (error) {
      return { result: { ok: false as const, error: error instanceof Error ? error.message : String(error) } }
    }
  }
}
