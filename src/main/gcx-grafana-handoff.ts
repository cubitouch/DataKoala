import type { GrafanaSignal, ResolvedGrafanaHandoff } from '../shared/grafanaExplore.ts'
import { normalizeGrafanaBaseUrl } from '../shared/grafanaExplore.ts'
import { parseGcxJson, runGcxCommand, sanitizeGcxError, type GcxCommandRunner } from './gcx-command.ts'

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

function stringValue(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function positiveInteger(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key]
    const numeric = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : Number.NaN
    if (Number.isInteger(numeric) && numeric > 0) return numeric
  }
  return undefined
}

function contextFromConfig(config: Record<string, unknown>): string | undefined {
  return stringValue(config, 'current-context', 'currentContext', 'current_context')
}

function currentContextFromOutput(value: string): string | undefined {
  try {
    const raw = JSON.parse(value) as unknown
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
    if (isRecord(raw)) return stringValue(raw, 'context', 'name', 'current-context', 'currentContext', 'current_context')
  } catch {
    // Older gcx releases can emit the context name as plain text.
  }
  const plain = value.trim()
  return plain && !/[\r\n]/.test(plain) ? plain : undefined
}

export function grafanaTargetFromConfig(raw: unknown, requestedContext?: string): { context: string; baseUrl: string; orgId?: number } {
  if (!isRecord(raw)) throw new Error('gcx config view returned an invalid configuration object.')
  const contexts = isRecord(raw.contexts) ? raw.contexts : undefined
  if (!contexts) throw new Error('gcx config view did not include any contexts.')

  const context = requestedContext?.trim() || contextFromConfig(raw) || (Object.keys(contexts).length === 1 ? Object.keys(contexts)[0] : undefined)
  if (!context) throw new Error('DataKoala could not determine the active gcx context.')
  const contextConfig = contexts[context]
  if (!isRecord(contextConfig)) throw new Error(`gcx context "${context}" was not found.`)

  // gcx v0 stored Grafana settings directly on each context.
  let grafana = isRecord(contextConfig.grafana) ? contextConfig.grafana : undefined

  // gcx v1 binds a context to a named stack which owns the Grafana settings.
  if (!grafana) {
    const stackName = stringValue(contextConfig, 'stack')
    const stacks = isRecord(raw.stacks) ? raw.stacks : undefined
    const stack = stackName && stacks && isRecord(stacks[stackName]) ? stacks[stackName] as Record<string, unknown> : undefined
    grafana = stack && isRecord(stack.grafana) ? stack.grafana : undefined
  }

  if (!grafana) throw new Error(`gcx context "${context}" does not define a Grafana destination.`)
  const server = stringValue(grafana, 'server')
  if (!server) throw new Error(`gcx context "${context}" does not define grafana.server.`)
  return { context, baseUrl: normalizeGrafanaBaseUrl(server), orgId: positiveInteger(grafana, 'org-id', 'orgId', 'org_id') }
}

function compatibleDatasource(signal: GrafanaSignal, type: string): boolean {
  if (signal === 'prometheus') return /prometheus|mimir/i.test(type)
  if (signal === 'loki') return /loki/i.test(type)
  return /tempo/i.test(type)
}

function contextDatasourceUid(raw: unknown, context: string, signal: GrafanaSignal): string | undefined {
  if (!isRecord(raw) || !isRecord(raw.contexts) || !isRecord(raw.contexts[context])) return undefined
  const datasources = isRecord(raw.contexts[context].datasources) ? raw.contexts[context].datasources as Record<string, unknown> : undefined
  if (!datasources) return undefined
  return stringValue(datasources, signal)
}

function datasourceFromResponse(raw: unknown, signal: GrafanaSignal, requestedUid?: string): { uid: string; type: string } {
  if (!Array.isArray(raw)) throw new Error('gcx returned an invalid Grafana datasource response.')
  const compatible = raw.flatMap((item) => {
    if (!isRecord(item) || typeof item.uid !== 'string' || typeof item.type !== 'string') return []
    return compatibleDatasource(signal, item.type) ? [{ uid: item.uid, type: item.type }] : []
  })

  if (requestedUid?.trim()) {
    const selected = compatible.find(({ uid }) => uid === requestedUid.trim())
    if (!selected) throw new Error(`Grafana datasource "${requestedUid.trim()}" is not available in the selected gcx context.`)
    return selected
  }
  if (compatible.length === 1) return compatible[0]
  if (compatible.length === 0) throw new Error(`No compatible Grafana ${signal} datasource was found in the selected gcx context.`)
  throw new Error(`Multiple Grafana ${signal} datasources are available. Select one in the DataKoala connection.`)
}

function normalizedGcxFailure(error: unknown): Error {
  const value = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string }
  if (value?.code === 'ENOENT') return new Error('gcx is not installed. Install gcx, then try again.')
  if (error instanceof Error && (
    error.message.startsWith('gcx config') ||
    error.message.startsWith('DataKoala could not') ||
    error.message.startsWith('gcx context') ||
    error.message.startsWith('Grafana datasource') ||
    error.message.startsWith('No compatible Grafana') ||
    error.message.startsWith('Multiple Grafana')
  )) return error
  const detail = sanitizeGcxError(`${value?.stderr ?? ''} ${value?.stdout ?? ''}`.trim())
  return new Error(detail || 'DataKoala could not resolve the Grafana destination from gcx.')
}

export async function resolveGcxGrafanaHandoff(
  request: { context?: string; datasourceUid?: string; signal: GrafanaSignal },
  run: GcxCommandRunner = runGcxCommand
): Promise<ResolvedGrafanaHandoff> {
  if (!request || !['prometheus', 'loki', 'tempo'].includes(request.signal)) throw new Error('A valid observability signal is required for Grafana handoff.')
  if (request.context !== undefined && typeof request.context !== 'string') throw new Error('The gcx context must be a string.')
  if (request.datasourceUid !== undefined && typeof request.datasourceUid !== 'string') throw new Error('The Grafana datasource UID must be a string.')
  try {
    const config = parseGcxJson((await run(['config', 'view', '-o', 'json'])).stdout, 'config view')
    let target: { context: string; baseUrl: string; orgId?: number }
    try {
      target = grafanaTargetFromConfig(config, request.context)
    } catch (error) {
      if (request.context?.trim()) throw error
      const current = currentContextFromOutput((await run(['config', 'current-context'])).stdout)
      if (!current) throw error
      target = grafanaTargetFromConfig(config, current)
    }

    const contextArgs = target.context ? ['--context', target.context] : []
    const datasources = parseGcxJson((await run(['api', '/api/datasources', ...contextArgs, '-o', 'json'])).stdout, 'Grafana datasources')
    const requestedUid = request.datasourceUid?.trim() || contextDatasourceUid(config, target.context, request.signal)
    const selected = datasourceFromResponse(datasources, request.signal, requestedUid)
    return { baseUrl: target.baseUrl, ...(target.orgId ? { orgId: target.orgId } : {}), datasourceUid: selected.uid, datasourceType: selected.type }
  } catch (error) {
    throw normalizedGcxFailure(error)
  }
}
