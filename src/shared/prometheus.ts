import type { PrometheusProfile } from './types.ts'

export interface PrometheusMetricMetadata { name: string; type?: string; help?: string; unit?: string }
export interface PrometheusMetricLabels { metricName: string; labels: string[] }
export interface PrometheusLabelValues { metricName: string; labelName: string; values: string[] }
export interface PrometheusDatasourceOption { uid: string; name: string; type: string }
export interface PrometheusDiscoveryResult {
  metricNames: string[]
  metadata: PrometheusMetricMetadata[]
  metadataAvailable: boolean
  gcx?: { installed: true; version: string; context?: string }
}

export type PrometheusConnectionInput = Pick<PrometheusProfile, 'transport'>

/** Datasource-neutral range semantics; the gcx transport maps these to Prometheus query_range parameters. */
export interface PrometheusQueryRequest {
  expression: string
  start: string
  end: string
  step: string
}
