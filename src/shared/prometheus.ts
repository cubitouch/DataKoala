import type { PrometheusProfile } from './types.ts'

export interface PrometheusMetricMetadata { type?: string; help?: string; unit?: string }
export interface PrometheusDiscoveryResult {
  metricNames: string[]
  metadata: Record<string, PrometheusMetricMetadata>
  metadataAvailable: boolean
}
export interface GrafanaPrometheusDatasource { uid: string; name: string; type: string }

export type PrometheusConnectionInput = Pick<PrometheusProfile, 'transport'>
