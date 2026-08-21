import { api } from './api'

const labelRequests = new Map<string, Promise<string[]>>()
const valueRequests = new Map<string, Promise<string[]>>()

export type PrometheusGcxErrorKind = 'auth_required' | 'invalid_context' | 'gcx_unavailable' | 'upstream' | 'unknown_gcx'

export interface PrometheusGcxError {
  kind: PrometheusGcxErrorKind
  message: string
}

export function prometheusMetadataError(error: unknown): PrometheusGcxError {
  const raw = error instanceof Error ? error.message : String(error)
  const lower = raw.toLowerCase()
  if (lower.includes('login') || lower.includes('auth') || lower.includes('credential') || lower.includes('unauthenticated')) {
    return { kind: 'auth_required', message: lower.includes('gcx login') ? raw : `${raw} Run gcx login, then retry.` }
  }
  if (lower.includes('context')) {
    return { kind: 'invalid_context', message: `${raw} Check the selected gcx context, then retry.` }
  }
  if (lower.includes('enoent') || lower.includes('not found') && lower.includes('gcx') || lower.includes('spawn gcx')) {
    return { kind: 'gcx_unavailable', message: `${raw} Make sure gcx is installed and available on PATH.` }
  }
  if (lower.includes('network') || lower.includes('timeout') || lower.includes('upstream') || lower.includes('temporar')) {
    return { kind: 'upstream', message: `${raw} Retry the metadata request.` }
  }
  return { kind: 'unknown_gcx', message: raw }
}

export function resetPrometheusMetadataCache() {
  labelRequests.clear()
  valueRequests.clear()
}

export function metricLabels(profileId: string, metric: string, connectionGeneration = 0): Promise<string[]> {
  const key = `${profileId}\0${metric}\0${connectionGeneration}`
  const existing = labelRequests.get(key)
  if (existing) return existing
  const request = api.connections.prometheus.labelsForMetric(profileId, metric).then((labels: string[]) => {
    if (import.meta.env.DEV) console.debug(`[prometheus:builder] metric=${metric} labelCount=${labels.length} labels=${JSON.stringify(labels)}`)
    return labels
  }).catch((error: unknown) => { labelRequests.delete(key); throw error })
  labelRequests.set(key, request)
  return request
}

export function metricLabelValues(profileId: string, metric: string, label: string, connectionGeneration = 0): Promise<string[]> {
  const key = `${profileId}\0${metric}\0${label}\0${connectionGeneration}`
  const existing = valueRequests.get(key)
  if (existing) return existing
  const request = api.connections.prometheus.labelValues(profileId, metric, label).catch((error: unknown) => { valueRequests.delete(key); throw error })
  valueRequests.set(key, request)
  return request
}
