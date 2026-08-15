import { api } from './api'

const labelRequests = new Map<string, Promise<string[]>>()
const valueRequests = new Map<string, Promise<string[]>>()

export function metricLabels(profileId: string, metric: string): Promise<string[]> {
  const key = `${profileId}\0${metric}`
  const existing = labelRequests.get(key)
  if (existing) return existing
  const request = api.connections.prometheus.labelsForMetric(profileId, metric).then((labels: string[]) => {
    if (import.meta.env.DEV) console.debug(`[prometheus:builder] metric=${metric} labelCount=${labels.length} labels=${JSON.stringify(labels)}`)
    return labels
  }).catch((error: unknown) => { labelRequests.delete(key); throw error })
  labelRequests.set(key, request)
  return request
}

export function metricLabelValues(profileId: string, metric: string, label: string): Promise<string[]> {
  const key = `${profileId}\0${metric}\0${label}`
  const existing = valueRequests.get(key)
  if (existing) return existing
  const request = api.connections.prometheus.labelValues(profileId, metric, label).catch((error: unknown) => { valueRequests.delete(key); throw error })
  valueRequests.set(key, request)
  return request
}
