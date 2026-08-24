import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { BuilderTimeRange } from './builderTimeRange'
import { prometheusRangeBounds } from './prometheusTimeRange'
import { lokiLabels } from './lokiMetadata'

export interface LokiLabelsSnapshot {
  status: 'loading' | 'loaded' | 'error'
  labels: string[]
  error: string | null
  bounds: { start: string; end: string }
}
interface Resource { snapshot: LokiLabelsSnapshot; listeners: Set<() => void>; request: number; promise?: Promise<void> }
const resources = new Map<string, Resource>()
const semanticKey = (connectionId: string, generation: number, tabId: string, range: BuilderTimeRange) => JSON.stringify([connectionId, generation, tabId, range])
const visibleLabels = (labels: string[]) => [...new Set(labels)].filter((label) => label && !label.startsWith('__')).sort()
function resourceFor(key: string, range: BuilderTimeRange): Resource {
  const previous = resources.get(key)
  if (previous) return previous
  const resource: Resource = { snapshot: { status: 'loading', labels: [], error: null, bounds: prometheusRangeBounds(range) }, listeners: new Set(), request: 0 }
  resources.set(key, resource)
  return resource
}
function emit(resource: Resource) { for (const listener of resource.listeners) listener() }
function load(resource: Resource, connectionId: string) {
  if (resource.promise) return resource.promise
  const request = ++resource.request
  resource.snapshot = { ...resource.snapshot, status: 'loading', error: null }; emit(resource)
  resource.promise = lokiLabels(connectionId, resource.snapshot.bounds).then((labels) => {
    if (request === resource.request) resource.snapshot = { ...resource.snapshot, status: 'loaded', labels: visibleLabels(labels), error: null }
  }, (error) => {
    if (request === resource.request) resource.snapshot = { ...resource.snapshot, status: 'error', error: error instanceof Error ? error.message : String(error) }
  }).finally(() => { if (request === resource.request) resource.promise = undefined; emit(resource) })
  return resource.promise
}
export function useLokiLabelsResource(connectionId: string, generation: number, tabId: string, range: BuilderTimeRange) {
  const key = semanticKey(connectionId, generation, tabId, range)
  const resource = useMemo(() => resourceFor(key, range), [key, connectionId])
  const snapshot = useSyncExternalStore((listener) => { resource.listeners.add(listener); return () => resource.listeners.delete(listener) }, () => resource.snapshot, () => resource.snapshot)
  useEffect(() => { void load(resource, connectionId) }, [resource, connectionId])
  return { ...snapshot, retry: () => { resource.request++; resource.promise = undefined; return load(resource, connectionId) } }
}
export function clearLokiLabelsResources() { resources.clear() }
