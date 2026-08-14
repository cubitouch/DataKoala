import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PrometheusMetricMetadata } from '../shared/prometheus.ts'
import type { PrometheusTransport } from './prometheus-transport.ts'

export interface GcxCommandResult { stdout: string; stderr: string }
export type GcxCommandRunner = (args: string[]) => Promise<GcxCommandResult>

const execute = promisify(execFile)
export const runGcxCommand: GcxCommandRunner = async (args) => {
  const result = await execute('gcx', args, { encoding: 'utf8', timeout: 30_000, maxBuffer: 10 * 1024 * 1024, windowsHide: true })
  return { stdout: result.stdout, stderr: result.stderr }
}

function parseJson(value: string, command: string): unknown {
  try { return JSON.parse(value) }
  catch { throw new Error(`gcx returned malformed JSON for ${command}. Update gcx and try again.`) }
}

function errorMessage(error: unknown): string {
  const value = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string }
  if (value?.code === 'ENOENT') return 'gcx is not installed. Install gcx, then try again.'
  const detail = `${value?.stderr ?? ''} ${value?.stdout ?? ''} ${value?.message ?? ''}`.toLowerCase()
  if (/expired|token.*expir|session.*expir/.test(detail)) return 'gcx authentication has expired. Run gcx login, then try again.'
  if (/not authenticated|not logged|no.*context|login required|unauthenticated/.test(detail)) return 'gcx is installed but no authenticated context is available. Run gcx login, then try again.'
  if (/forbidden|permission|not permitted|access denied|status.?403/.test(detail)) return 'Metrics access is not permitted for this account.'
  return 'gcx could not discover metrics. Check the selected context and run gcx login if needed.'
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string') throw new Error(`gcx metric metadata field "${key}" must be a string.`)
  return value
}

/**
 * gcx emits the Prometheus metadata API envelope:
 * `{ status: "success", data: { metric_name: [{ type, help, unit }] } }`.
 * Keep this contract and all raw response handling on the main-process side of IPC.
 */
export function normalizeGcxMetadata(raw: unknown): PrometheusMetricMetadata[] {
  if (!isRecord(raw) || raw.status !== 'success' || !isRecord(raw.data)) {
    throw new Error('gcx returned valid JSON, but the metrics metadata response must contain status "success" and a data object.')
  }

  const entries: PrometheusMetricMetadata[] = []
  for (const [name, values] of Object.entries(raw.data)) {
    if (!name || !Array.isArray(values)) {
      throw new Error(`gcx returned an unexpected metadata entry for metric "${name}".`)
    }
    for (const value of values) {
      if (!isRecord(value)) throw new Error(`gcx returned a non-object metadata value for metric "${name}".`)
      entries.push({
        name,
        type: optionalString(value, 'type'),
        help: optionalString(value, 'help'),
        unit: optionalString(value, 'unit')
      })
    }
  }

  // Traverse every raw entry before deduplication. Duplicate series metadata may
  // fill fields omitted by another target, so retain the first available value.
  const unique = new Map<string, PrometheusMetricMetadata>()
  for (const entry of entries) {
    const previous = unique.get(entry.name)
    unique.set(entry.name, previous ? {
      name: entry.name,
      type: previous.type ?? entry.type,
      help: previous.help ?? entry.help,
      unit: previous.unit ?? entry.unit
    } : entry)
  }
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[prometheus:gcx] gcx returned ${entries.length} raw metadata entries`)
    console.debug(`[prometheus:gcx] DataKoala normalized ${unique.size} unique metrics`)
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeVersion(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    const value = optionalString(record, 'version') ?? optionalString(record, 'Version')
    if (value) return value
  }
  throw new Error('gcx returned valid JSON, but did not include a version.')
}

export class GcxPrometheusTransport implements PrometheusTransport {
  private readonly context: string | undefined
  private readonly run: GcxCommandRunner
  constructor(context: string | undefined, run: GcxCommandRunner = runGcxCommand) { this.context = context; this.run = run }
  async version(): Promise<string> {
    try {
      return normalizeVersion(parseJson((await this.run(['version', '-o', 'json'])).stdout, 'version'))
    } catch (error) { throwNormalizedGcxError(error) }
  }
  async metadata(): Promise<PrometheusMetricMetadata[]> {
    try {
      const contextArgs = this.context ? ['--context', this.context] : []
      return normalizeGcxMetadata(parseJson((await this.run(['metrics', 'metadata', ...contextArgs, '-o', 'json'])).stdout, 'metrics metadata'))
    } catch (error) { throwNormalizedGcxError(error) }
  }
}

function throwNormalizedGcxError(error: unknown): never {
  if (error instanceof Error && (error.message.startsWith('gcx returned') || error.message.includes('metric metadata shape'))) throw error
  throw new Error(errorMessage(error))
}
