import type { PrometheusProfile } from './types.ts'

export interface PrometheusMetricMetadata { name: string; type?: string; help?: string; unit?: string }
export interface PrometheusDiscoveryResult {
  metricNames: string[]
  metadata: PrometheusMetricMetadata[]
  metadataAvailable: boolean
  gcx?: { installed: true; version: string; context?: string }
}

export type PrometheusConnectionInput = Pick<PrometheusProfile, 'transport'>
