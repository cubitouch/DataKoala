import type { PrometheusMetricMetadata } from '../shared/prometheus.ts'

/** Provider-neutral Prometheus operations. Query operations belong in a later increment. */
export interface PrometheusTransport {
  metadata(): Promise<PrometheusMetricMetadata[]>
}
