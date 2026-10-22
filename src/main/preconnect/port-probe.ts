import { connect } from 'node:net'

export const DEFAULT_PROBE_INTERVAL_MS = 250
export const DEFAULT_PROBE_CONNECT_TIMEOUT_MS = 1000

export class PortTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PortTimeoutError'
  }
}

/** A single TCP connect attempt. Resolves false on refusal/timeout/abort. */
export function probePort(
  host: string,
  port: number,
  connectTimeoutMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false)
      return
    }
    let settled = false
    const socket = connect({ host, port })
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.removeAllListeners()
      socket.destroy()
      signal?.removeEventListener('abort', onAbort)
      resolve(ok)
    }
    const onAbort = () => finish(false)
    const timer = setTimeout(() => finish(false), connectTimeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.once('timeout', () => finish(false))
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export interface WaitForPortOptions {
  host?: string
  port: number
  timeoutMs: number
  intervalMs?: number
  signal?: AbortSignal
  /** Injectable for tests; defaults to a real TCP connect. */
  probe?: (
    host: string,
    port: number,
    connectTimeoutMs: number,
  ) => Promise<boolean>
}

/**
 * Polls until the host accepts a connection, then resolves. Throws
 * `PortTimeoutError` if the deadline passes or the signal aborts first.
 */
export async function waitForPort(options: WaitForPortOptions): Promise<void> {
  const host = options.host ?? '127.0.0.1'
  const intervalMs = options.intervalMs ?? DEFAULT_PROBE_INTERVAL_MS
  const probe =
    options.probe ??
    ((h, p, timeout) => probePort(h, p, timeout, options.signal))
  const deadline = Date.now() + options.timeoutMs
  do {
    if (options.signal?.aborted) break
    if (await probe(host, options.port, DEFAULT_PROBE_CONNECT_TIMEOUT_MS))
      return
    if (options.signal?.aborted) break
    await delay(intervalMs, options.signal)
  } while (Date.now() < deadline)
  throw new PortTimeoutError(
    `The tunnel did not open ${host}:${options.port} within ${options.timeoutMs}ms.`,
  )
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}
