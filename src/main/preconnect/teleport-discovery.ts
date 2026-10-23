import { execFile } from 'node:child_process'
import {
  parseTeleportDatabases,
  type TeleportDiscoverErrorCode,
  type TeleportDiscoverResult,
} from '../../shared/teleport.ts'
import { classifyTshStatusFailure, summarizeTshFailure } from './errors.ts'

export type TshCommandRunner = (
  binary: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>

interface TshExecError extends NodeJS.ErrnoException {
  stdout?: string
  stderr?: string
}

const runTsh: TshCommandRunner = (binary, args) =>
  new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      { timeout: 20_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stdout, stderr }))
          return
        }
        resolve({ stdout, stderr })
      },
    )
  })

function failureCode(code: string | null): TeleportDiscoverErrorCode {
  return code === 'TSH_NOT_LOGGED_IN' ? 'TSH_NOT_LOGGED_IN' : 'TUNNEL_FAILED'
}

/**
 * Lists PostgreSQL database services visible to the active Teleport login.
 * Never assumes `tsh` exists: a missing binary, an expired session and any other
 * failure are returned as data so the renderer can guide the user instead.
 */
export async function discoverTeleportDatabases(
  options: { tshPath?: string } = {},
  runner: TshCommandRunner = runTsh,
): Promise<TeleportDiscoverResult> {
  const binary = options.tshPath?.trim() || 'tsh'
  try {
    const { stdout } = await runner(binary, ['db', 'ls', '--format=json'])
    return { ok: true, databases: parseTeleportDatabases(stdout) }
  } catch (error) {
    const value = error as TshExecError
    if (value.code === 'ENOENT') {
      return {
        ok: false,
        code: 'TSH_NOT_FOUND',
        error: `Could not find "${binary}". Install tsh, or set an absolute path to it in the tunnel settings.`,
      }
    }
    const detail = summarizeTshFailure(value.stderr ?? '', value.stdout ?? '')
    const classified = classifyTshStatusFailure(detail)
    if (classified) {
      return {
        ok: false,
        code: failureCode(classified.code),
        error: classified.message,
      }
    }
    return {
      ok: false,
      code: 'TUNNEL_FAILED',
      error:
        detail ||
        `Could not list Teleport databases: ${value.message ?? 'unknown error'}`,
    }
  }
}
