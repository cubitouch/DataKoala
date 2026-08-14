import type { PrometheusMetricMetadata, PrometheusQueryRequest } from '../shared/prometheus.ts'
import type { QueryResult } from '../shared/types.ts'

export interface PrometheusTransport {
  metadata(): Promise<PrometheusMetricMetadata[]>
  query(request: PrometheusQueryRequest): Promise<QueryResult>
}
