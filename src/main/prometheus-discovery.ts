import type { PrometheusDiscoveryResult, PrometheusMetricMetadata } from '../shared/prometheus.ts'
import type { PrometheusTransportConfig } from '../shared/types.ts'
import { createPrometheusTransport } from './prometheus-transport.ts'

export async function discoverPrometheus(config: PrometheusTransportConfig): Promise<PrometheusDiscoveryResult> {
  const transport = createPrometheusTransport(config)
  const metricNames = await transport.request<string[]>('/api/v1/label/__name__/values')
  let metadata: Record<string, PrometheusMetricMetadata> = {}
  let metadataAvailable = false
  try {
    metadata = await transport.request<Record<string, PrometheusMetricMetadata[]>>('/api/v1/metadata')
      .then((values) => Object.fromEntries(Object.entries(values).flatMap(([name, entries]) => entries[0] ? [[name, entries[0]]] : [])))
    metadataAvailable = true
  } catch { /* Metadata is experimental enrichment, never a connection requirement. */ }
  return { metricNames: [...new Set(metricNames)].sort(), metadata, metadataAvailable }
}
