import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'

export interface GcxCommandResult {
  stdout: string
  stderr: string
}
export type GcxCommandRunner = (
  args: string[],
  signal?: AbortSignal,
) => Promise<GcxCommandResult>

/** gcx rejects before executing the operation when layered config changes mid-read. */
export function withGcxConfigReadRetry(
  run: GcxCommandRunner,
  wait: (milliseconds: number, signal?: AbortSignal) => Promise<void> = (
    milliseconds,
    signal,
  ) => delay(milliseconds, undefined, { signal }),
): GcxCommandRunner {
  return async (args, signal) => {
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted()
      try {
        return await run(args, signal)
      } catch (error) {
        signal?.throwIfAborted()
        const failure = error as { stderr?: unknown; message?: unknown }
        const detail = `${failure?.stderr ?? ''} ${failure?.message ?? ''}`
        if (
          attempt >= 2 ||
          !/Config[^\r\n]*changed while loading layered configuration; retry/i.test(
            detail,
          )
        )
          throw error
        await wait(attempt === 0 ? 80 : 200, signal)
      }
    }
  }
}

const execute = promisify(execFile)

/** Execute gcx without involving a shell. Callers must supply one argv item per value. */
export const runGcxCommand: GcxCommandRunner = withGcxConfigReadRetry(
  async (args, signal) => {
    const result = await execute('gcx', args, {
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 100 * 1024 * 1024,
      windowsHide: true,
      signal,
    })
    return { stdout: result.stdout, stderr: result.stderr }
  },
)

export function parseGcxJson(value: string, command: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(
      `gcx returned malformed JSON for ${command}. Update gcx and try again.`,
    )
  }
}

export function sanitizeGcxError(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?\S+/gi, '$1[redacted]')
    .replace(/(cookie\s*[:=]\s*)[^\r\n]+/gi, '$1[redacted]')
    .replace(/(token|password|secret)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/https?:\/\/[^\s@]+@/g, 'https://[redacted]@')
    .trim()
}

export function gcxError(
  error: unknown,
  signal: 'Prometheus' | 'Tempo' | 'Loki',
): Error {
  const value = error as NodeJS.ErrnoException & {
    stderr?: string
    stdout?: string
  }
  if (value?.code === 'ENOENT')
    return new Error('gcx is not installed. Install gcx, then try again.')
  const detail =
    `${value?.stderr ?? ''} ${value?.stdout ?? ''} ${value?.message ?? ''}`.toLowerCase()
  if (/expired|token.*expir|session.*expir/.test(detail))
    return new Error(
      'gcx authentication has expired. Run gcx login, then try again.',
    )
  if (
    /not authenticated|not logged|no.*context|login required|unauthenticated/.test(
      detail,
    )
  )
    return new Error(
      'gcx is installed but no authenticated context is available. Run gcx login, then try again.',
    )
  if (
    /forbidden|permission|not permitted|access denied|status.?403/.test(detail)
  )
    return new Error(`${signal} access is not permitted for this account.`)
  const raw = sanitizeGcxError(
    `${value?.stderr ?? ''} ${value?.stdout ?? ''}`.trim(),
  )
  return new Error(
    raw ||
      `gcx could not complete the ${signal} operation. Check the selected context and run gcx login if needed.`,
  )
}
