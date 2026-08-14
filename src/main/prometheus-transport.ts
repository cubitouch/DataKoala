import type { PrometheusMetricMetadata, PrometheusQueryRequest } from '../shared/prometheus.ts'
import type { QueryResult } from '../shared/types.ts'

export interface PrometheusTransport {
  metadata(): Promise<PrometheusMetricMetadata[]>
  labelsForMetric(metricName: string): Promise<string[]>
  labelValues(metricName: string, labelName: string): Promise<string[]>
  query(request: PrometheusQueryRequest): Promise<QueryResult>
}
