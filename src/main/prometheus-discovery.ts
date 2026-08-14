import type { PrometheusDiscoveryResult } from '../shared/prometheus.ts'
import type { PrometheusTransportConfig } from '../shared/types.ts'
import { GcxPrometheusTransport } from './gcx-prometheus-transport.ts'

export async function discoverPrometheus(config: PrometheusTransportConfig): Promise<PrometheusDiscoveryResult> {
  const transport = new GcxPrometheusTransport(config.context)
  const version = await transport.version()
  const metadata = await transport.metadata()
  return {
    metricNames: metadata.map((item) => item.name), metadata, metadataAvailable: true,
    gcx: { installed: true, version, ...(config.context ? { context: config.context } : {}) }
  }
}
