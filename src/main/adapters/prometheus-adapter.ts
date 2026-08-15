import type { DataSourceAdapter, DataSourceSession } from '../data-source.ts'
import type { DataSourceCapabilities, PrometheusProfile } from '../../shared/types.ts'
import { discoverPrometheus } from '../prometheus-discovery.ts'
import type { PrometheusDiscoveryResult } from '../../shared/prometheus.ts'
import { GcxPrometheusTransport } from '../gcx-prometheus-transport.ts'
import type { PrometheusTransport } from '../prometheus-transport.ts'

const capabilities: DataSourceCapabilities = {
  builder: true, explain: false, analyze: false, queryCancellation: false,
  parameterizedQueries: false, costEstimate: false, serverReadOnly: true, schemaAutocomplete: false
}

export class PrometheusAdapter implements DataSourceAdapter {
  readonly kind = 'prometheus' as const
  private readonly discover: (profile: PrometheusProfile['transport']) => Promise<PrometheusDiscoveryResult>
  private readonly createTransport: (context?: string, datasourceUid?: string) => PrometheusTransport
  constructor(discover: (profile: PrometheusProfile['transport']) => Promise<PrometheusDiscoveryResult> = discoverPrometheus, createTransport: (context?: string, datasourceUid?: string) => PrometheusTransport = (context, datasourceUid) => new GcxPrometheusTransport(context, undefined, datasourceUid)) { this.discover = discover; this.createTransport = createTransport }
  async test(profile: PrometheusProfile) {
    try {
      const result = await this.discover(profile.transport)
      return { ok: true as const, sourceInfo: { label: `Prometheus · ${result.metricNames.length} metrics` } }
    } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : String(error) } }
  }
  async connect(profile: PrometheusProfile) {
    let discovery: PrometheusDiscoveryResult
    try { discovery = await this.discover(profile.transport) }
    catch (error) { return { result: { ok: false as const, error: error instanceof Error ? error.message : String(error) } } }
    const sourceInfo = { label: `Prometheus · ${discovery.metricNames.length} metrics` }
    const relations = [...discovery.metadata]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((metric) => ({
        namespace: 'Metrics', name: metric.name, kind: 'metric' as const,
        details: { kind: 'metric' as const, type: metric.type, help: metric.help, unit: metric.unit }
      }))
    const transport = this.createTransport(profile.transport.context, profile.transport.datasourceUid)
    const session: DataSourceSession = {
      info: { profileId: profile.id, provider: 'prometheus' }, capabilities,
      query: ({ sql, prometheus }) => {
        if (!prometheus) throw new Error('Prometheus range queries require start, end, and step.')
        return transport.query({ expression: sql, ...prometheus })
      },
      listNamespaces: async () => [{ name: 'Metrics' }],
      listRelations: async (namespace) => namespace && namespace.name !== 'Metrics' ? [] : relations,
      labelsForMetric: (metricName) => transport.labelsForMetric(metricName),
      labelValues: (metricName, labelName) => transport.labelValues(metricName, labelName),
      describeRelation: async () => [], close: async () => {}
    }
    return { result: { ok: true as const, generation: Date.now(), sourceInfo }, session }
  }
}
