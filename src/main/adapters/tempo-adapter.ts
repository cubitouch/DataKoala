import type { DataSourceAdapter, DataSourceSession } from '../data-source.ts'
import type { DataSourceCapabilities, TempoProfile } from '../../shared/types.ts'
import type { TempoTransport } from '../gcx-tempo-transport.ts'
import { SamplingGcxTempoTransport } from '../gcx-tempo-sampling-transport.ts'
import { performance } from 'node:perf_hooks'
import { tempoPerformanceLog } from '../tempo-performance.ts'

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
      (context, datasourceUid) => new SamplingGcxTempoTransport(context, undefined, datasourceUid)
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
    const connectStarted = performance.now()
    const transport = this.createTransport(profile.transport.context, profile.transport.datasourceUid)
    try {
      const probeStarted = performance.now()
      tempoPerformanceLog('init.probe.started', { profileId: profile.id })
      await transport.probe().catch((error) => {
        tempoPerformanceLog('init.probe.failed', {
          profileId: profile.id, durationMs: performance.now() - probeStarted,
          error: error instanceof Error ? error.message : String(error)
        })
        throw error
      })
      tempoPerformanceLog('init.probe.completed', { profileId: profile.id, durationMs: performance.now() - probeStarted })

      let servicesPromise: ReturnType<TempoTransport['services']> | undefined
      let servicesResolved = false
      const loadServices = () => {
        if (servicesPromise) {
          tempoPerformanceLog(servicesResolved ? 'metadata.services.cached' : 'metadata.services.joined', { profileId: profile.id })
          return servicesPromise
        }
        const started = performance.now()
        tempoPerformanceLog('metadata.services.started', { profileId: profile.id })
        servicesPromise = transport.services().then((services) => {
          servicesResolved = true
          tempoPerformanceLog('metadata.services.completed', {
            profileId: profile.id, durationMs: performance.now() - started, count: services.length
          })
          return services
        }).catch((error) => {
          servicesPromise = undefined
          tempoPerformanceLog('metadata.services.failed', {
            profileId: profile.id, durationMs: performance.now() - started,
            error: error instanceof Error ? error.message : String(error)
          })
          throw error
        })
        return servicesPromise
      }
      const listRelations = async () => (await loadServices()).map((service) => ({
        namespace: service.namespace || DEFAULT_SERVICE_NAMESPACE,
        name: service.name,
        kind: 'service' as const,
        details: { kind: 'service' as const, ...(service.namespace ? { serviceNamespace: service.namespace } : {}) }
      }))
      const sessionStarted = performance.now()
      const session: DataSourceSession = {
        info: { profileId: profile.id, provider: 'tempo' },
        capabilities,
        query: ({ sql, tempo }) => transport.query(sql, tempo),
        listNamespaces: async () => [...new Set((await loadServices()).map((service) => service.namespace || DEFAULT_SERVICE_NAMESPACE))]
          .sort((left, right) => {
            if (left === DEFAULT_SERVICE_NAMESPACE) return -1
            if (right === DEFAULT_SERVICE_NAMESPACE) return 1
            return left.localeCompare(right)
          }).map((name) => ({ name })),
        listRelations: async (namespace) => {
          const relations = await listRelations()
          return namespace ? relations.filter((relation) => relation.namespace === namespace.name) : relations
        },
        describeRelation: async () => [],
        attributeValues: (attribute, query) => transport.attributeValues(attribute, query),
        close: async () => {}
      }
      tempoPerformanceLog('init.session.created', { profileId: profile.id, durationMs: performance.now() - sessionStarted })
      const sourceInfo = { label: 'Grafana Tempo via gcx' }
      tempoPerformanceLog('init.connect.total', { profileId: profile.id, durationMs: performance.now() - connectStarted })
      return { result: { ok: true as const, generation: Date.now(), sourceInfo }, session }
    } catch (error) {
      tempoPerformanceLog('init.connect.failed', {
        profileId: profile.id, durationMs: performance.now() - connectStarted,
        error: error instanceof Error ? error.message : String(error)
      })
      return { result: { ok: false as const, error: error instanceof Error ? error.message : String(error) } }
    }
  }
}
