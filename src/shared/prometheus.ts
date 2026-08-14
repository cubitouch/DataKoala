import type { PrometheusProfile } from './types.ts'

export interface PrometheusMetricMetadata { name: string; type?: string; help?: string; unit?: string }
export interface PrometheusMetricLabels { metricName: string; labels: string[] }
export interface PrometheusLabelValues { metricName: string; labelName: string; values: string[] }
export interface PrometheusDiscoveryResult {
  metricNames: string[]
  metadata: PrometheusMetricMetadata[]
  metadataAvailable: boolean
  gcx?: { installed: true; version: string; context?: string }
}

export type PrometheusConnectionInput = Pick<PrometheusProfile, 'transport'>

/** Datasource-neutral range semantics; only the gcx transport maps these to CLI flags. */
export interface PrometheusQueryRequest {
  expression: string
  start: string
  end: string
  step: string
}
