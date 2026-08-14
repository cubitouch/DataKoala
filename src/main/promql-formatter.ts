import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export interface PromtoolCommandResult { stdout: string; stderr: string }
export type PromtoolCommandRunner = (binary: string, args: string[]) => Promise<PromtoolCommandResult>

const execute = promisify(execFile)

export const runPromtoolCommand: PromtoolCommandRunner = async (binary, args) => {
  const result = await execute(binary, args, {
    encoding: 'utf8',
    timeout: 15_000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true
  })
  return { stdout: result.stdout, stderr: result.stderr }
}

export function resolvePromtoolPath(): string {
  const configured = process.env.DATAKOALA_PROMTOOL_PATH?.trim()
  return configured || 'promtool'
}

function normalizePromtoolError(error: unknown): Error {
  const value = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string }
  if (value?.code === 'ENOENT') {
    return new Error('PromQL formatting requires promtool. Install Prometheus/promtool or set DATAKOALA_PROMTOOL_PATH.')
  }

  const detail = `${value?.stderr ?? ''}\n${value?.stdout ?? ''}`.trim()
  if (detail) return new Error(detail)
  if (error instanceof Error && error.message) return new Error(error.message)
  return new Error('promtool could not format this PromQL query.')
}

/**
 * Pretty-print PromQL locally with Prometheus' official parser/formatter.
 * This never contacts Grafana or executes the query.
 */
export async function formatPromql(
  query: string,
  run: PromtoolCommandRunner = runPromtoolCommand,
  binary = resolvePromtoolPath()
): Promise<string> {
  if (!query.trim()) throw new Error('A PromQL query is required to format PromQL.')
  try {
    const { stdout } = await run(binary, ['--experimental', 'promql', 'format', query])
    const formatted = stdout.trim()
    if (!formatted) throw new Error('promtool returned an empty formatted query.')
    return formatted
  } catch (error) {
    throw normalizePromtoolError(error)
  }
}
