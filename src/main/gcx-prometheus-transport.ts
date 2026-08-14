import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PrometheusDiscoveryResult, PrometheusMetricMetadata } from '../shared/prometheus.ts'

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

function optionalString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) if (typeof record[key] === 'string' && record[key]) return record[key] as string
  return undefined
}

/** Keeps all gcx response-shape handling on the main-process side of the IPC boundary. */
export function normalizeGcxMetadata(raw: unknown): PrometheusMetricMetadata[] {
  const root = raw && typeof raw === 'object' ? raw as Record<string, unknown> : undefined
  const candidate = Array.isArray(raw) ? raw : root && (root.data ?? root.metadata ?? root.metrics)
  const normalized: PrometheusMetricMetadata[] = []
  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      if (!item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      const name = optionalString(record, 'name', 'metric', 'metricName', '__name__')
      if (name) normalized.push({ name, type: optionalString(record, 'type'), help: optionalString(record, 'help', 'description'), unit: optionalString(record, 'unit') })
    }
  } else if (root) {
    for (const [name, entries] of Object.entries(root)) {
      const record = (Array.isArray(entries) ? entries[0] : entries) as Record<string, unknown> | undefined
      if (record && typeof record === 'object') normalized.push({ name, type: optionalString(record, 'type'), help: optionalString(record, 'help'), unit: optionalString(record, 'unit') })
    }
  }
  if (!normalized.length) throw new Error('gcx returned valid JSON, but its metric metadata shape was not recognized.')
  return normalized.sort((a, b) => a.name.localeCompare(b.name))
}

function normalizeVersion(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (raw && typeof raw === 'object') {
    const value = optionalString(raw as Record<string, unknown>, 'version', 'Version')
    if (value) return value
  }
  throw new Error('gcx returned valid JSON, but did not include a version.')
}

export class GcxPrometheusTransport {
  private readonly context: string | undefined
  private readonly run: GcxCommandRunner
  constructor(context: string | undefined, run: GcxCommandRunner = runGcxCommand) { this.context = context; this.run = run }
  async discover(): Promise<PrometheusDiscoveryResult> {
    try {
      const version = normalizeVersion(parseJson((await this.run(['version', '-o', 'json'])).stdout, 'version'))
      const contextArgs = this.context ? ['--context', this.context] : []
      const metadata = normalizeGcxMetadata(parseJson((await this.run(['metrics', 'metadata', ...contextArgs, '-o', 'json'])).stdout, 'metrics metadata'))
      return { metricNames: metadata.map((item) => item.name), metadata, metadataAvailable: true, gcx: { installed: true, version, ...(this.context ? { context: this.context } : {}) } }
    } catch (error) {
      if (error instanceof Error && (error.message.startsWith('gcx returned') || error.message.includes('metric metadata shape'))) throw error
      throw new Error(errorMessage(error))
    }
  }
}
