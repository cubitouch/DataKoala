import { execFile, spawn } from 'node:child_process'
import type { ConnectionId, TeleportPreConnect } from '../../shared/types.ts'
import {
  PreConnectError,
  type PreConnectErrorCode,
  classifyTshStatusFailure,
  summarizeTshFailure,
} from './errors.ts'
import {
  DEFAULT_TUNNEL_HOST,
  buildProxyDbArgs,
  isSessionExpired,
  isValidTunnelPort,
  parseTshStatus,
  resolveTshBinary,
  tunnelTimeout,
  type TshStatus,
} from '../../shared/teleport.ts'
import {
  DEFAULT_PROBE_CONNECT_TIMEOUT_MS,
  probePort,
  waitForPort,
} from './port-probe.ts'

export type PreConnectState =
  | 'checking-tsh'
  | 'checking-login'
  | 'starting'
  | 'waiting-for-port'
  | 'ready'
  | 'restarting'
  | 'failed'
  | 'stopped'

export interface PreConnectStateEvent {
  profileId: ConnectionId
  state: PreConnectState
  message: string
  code: PreConnectErrorCode | null
  attempt: number
  generation: number
  timestamp: number
}

/** Minimal child surface the manager needs; satisfied by `ChildProcess`. */
export interface TunnelProcess {
  readonly pid?: number
  on(
    event: 'exit',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  once(event: 'exit' | 'error', listener: () => void): unknown
  stdout: {
    on(event: 'data', listener: (chunk: unknown) => void): unknown
  } | null
  stderr: {
    on(event: 'data', listener: (chunk: unknown) => void): unknown
  } | null
  kill(signal?: NodeJS.Signals): boolean
}

export interface TeleportDeps {
  spawnTsh(
    binary: string,
    args: string[],
    env: NodeJS.ProcessEnv,
  ): TunnelProcess
  checkStatus(
    binary: string,
    env: NodeJS.ProcessEnv,
    signal: AbortSignal,
  ): Promise<TshStatus>
  waitForPort(
    port: number,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<void>
  probePort(port: number): Promise<boolean>
  now(): number
  restartBaseDelayMs: number
  restartMaxDelayMs: number
  healthIntervalMs: number
  healthFailureThreshold: number
  maxRestarts: number
  killGraceMs: number
}

interface ManagedTunnel {
  config: TeleportPreConnect
  generation: number
  state: PreConnectState
  attempt: number
  stopping: boolean
  child: TunnelProcess | null
  abort: AbortController
  healthTimer: ReturnType<typeof setInterval> | null
  restartTimer: ReturnType<typeof setTimeout> | null
  consecutiveHealthFailures: number
}

/** Internal sentinel: this attempt lost an intent/generation race and must unwind quietly. */
export class SupersededError extends Error {
  constructor() {
    super('This connection attempt was superseded by a newer connection.')
    this.name = 'SupersededError'
  }
}

function isKeepaliveEnabled(config: TeleportPreConnect): boolean {
  return config.keepalive !== false
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function killProcessTree(child: TunnelProcess, signal: NodeJS.Signals): void {
  const pid = child.pid
  if (process.platform === 'win32' || pid === undefined) {
    try {
      child.kill(signal)
    } catch {
      /* process already gone */
    }
    return
  }
  // The child is spawned detached, so its pgid equals its pid: signalling the
  // negative pid reaches tsh and any helper processes it started.
  try {
    process.kill(-pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      /* process already gone */
    }
  }
}

function defaultSpawnTsh(
  binary: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): TunnelProcess {
  const child = spawn(binary, args, {
    env,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return child as unknown as TunnelProcess
}

async function defaultCheckStatus(
  binary: string,
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
): Promise<TshStatus> {
  return new Promise<TshStatus>((resolve, reject) => {
    execFile(
      binary,
      ['status', '--format=json'],
      { env, timeout: 15_000, windowsHide: true, signal },
      (error, stdout, stderr) => {
        if (error) {
          const code = (error as NodeJS.ErrnoException).code
          if (code === 'ENOENT') {
            reject(
              new PreConnectError(
                'TSH_NOT_FOUND',
                `Could not find "${binary}". Install tsh, or set an absolute path to it in the advanced settings.`,
              ),
            )
            return
          }
          const detail = summarizeTshFailure(stderr ?? '', stdout ?? '')
          const classified = classifyTshStatusFailure(detail)
          if (classified) {
            reject(classified)
            return
          }
          reject(
            new PreConnectError(
              'TUNNEL_FAILED',
              detail || `Could not read Teleport status: ${messageOf(error)}`,
            ),
          )
          return
        }
        try {
          resolve(parseTshStatus(stdout))
        } catch {
          reject(
            new PreConnectError(
              'TUNNEL_FAILED',
              'Could not read the Teleport status output.',
            ),
          )
        }
      },
    )
  })
}

export function createTeleportDeps(
  overrides: Partial<TeleportDeps> = {},
): TeleportDeps {
  return {
    spawnTsh: defaultSpawnTsh,
    checkStatus: defaultCheckStatus,
    waitForPort: (port, timeoutMs, signal) =>
      waitForPort({
        host: DEFAULT_TUNNEL_HOST,
        port,
        timeoutMs,
        signal,
      }),
    probePort: (port) =>
      probePort(DEFAULT_TUNNEL_HOST, port, DEFAULT_PROBE_CONNECT_TIMEOUT_MS),
    now: () => Date.now(),
    restartBaseDelayMs: 500,
    restartMaxDelayMs: 10_000,
    healthIntervalMs: 10_000,
    healthFailureThreshold: 2,
    maxRestarts: 10,
    killGraceMs: 2000,
    ...overrides,
  }
}

/**
 * Owns one `tsh proxy db` process per profile. Starting is generation-guarded so
 * a superseded connect can neither kill nor leak a fresh tunnel, and readiness is
 * confirmed by polling the local port before the caller opens a Postgres pool.
 */
export class TeleportTunnelManager {
  private readonly deps: TeleportDeps
  private readonly tunnels = new Map<ConnectionId, ManagedTunnel>()
  private readonly intents = new Map<ConnectionId, number>()
  private readonly listeners = new Set<(event: PreConnectStateEvent) => void>()
  private nextIntent = 0
  private nextGeneration = 0

  constructor(deps: Partial<TeleportDeps> = {}) {
    this.deps = createTeleportDeps(deps)
  }

  onStateChanged(listener: (event: PreConnectStateEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  state(profileId: ConnectionId): PreConnectState | undefined {
    return this.tunnels.get(profileId)?.state
  }

  isReady(profileId: ConnectionId): boolean {
    return this.tunnels.get(profileId)?.state === 'ready'
  }

  /**
   * Starts (or restarts) a tunnel and resolves to its generation once it is
   * accepting connections. The caller passes that generation back to `stop` so a
   * superseded attempt cannot close a newer tunnel that shares the profile id.
   */
  async start(
    profileId: ConnectionId,
    config: TeleportPreConnect,
  ): Promise<number> {
    const intent = ++this.nextIntent
    this.intents.set(profileId, intent)
    await this.stop(profileId)
    // stop() cleared any prior intent; reclaim ownership for this attempt.
    this.intents.set(profileId, intent)

    this.validate(config)
    const managed: ManagedTunnel = {
      config,
      generation: ++this.nextGeneration,
      state: 'checking-tsh',
      attempt: 0,
      stopping: false,
      child: null,
      abort: new AbortController(),
      healthTimer: null,
      restartTimer: null,
      consecutiveHealthFailures: 0,
    }
    this.tunnels.set(profileId, managed)
    this.setState(
      managed,
      profileId,
      'checking-tsh',
      'Preparing Teleport tunnel…',
    )

    try {
      await this.verifyLogin(managed, profileId, intent)
      await this.launch(managed, profileId, intent)
    } catch (error) {
      if (error instanceof SupersededError) throw error
      await this.fail(managed, profileId, error)
      throw error
    }
    return managed.generation
  }

  async stop(profileId: ConnectionId, generation?: number): Promise<void> {
    const current = this.tunnels.get(profileId)
    if (generation !== undefined && current?.generation !== generation) {
      // A newer tunnel (or none) owns the id; leave it untouched.
      return
    }
    this.intents.delete(profileId)
    if (!current) return
    this.tunnels.delete(profileId)
    current.stopping = true
    current.abort.abort()
    this.stopHealth(current)
    if (current.restartTimer) {
      clearTimeout(current.restartTimer)
      current.restartTimer = null
    }
    await this.terminate(current)
    this.setState(current, profileId, 'stopped', 'Teleport tunnel closed.')
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled(
      [...this.tunnels.keys()].map((profileId) => this.stop(profileId)),
    )
  }

  private validate(config: TeleportPreConnect): void {
    if (!config || config.mode !== 'teleport')
      throw new PreConnectError(
        'INVALID_CONFIG',
        'The Teleport pre-connect configuration is invalid.',
      )
    if (!config.dbService?.trim())
      throw new PreConnectError(
        'INVALID_CONFIG',
        'A Teleport database service name is required.',
      )
    if (!isValidTunnelPort(config.tunnelPort))
      throw new PreConnectError(
        'INVALID_CONFIG',
        'The tunnel port must be a whole number between 1 and 65535.',
      )
  }

  private env(): NodeJS.ProcessEnv {
    return { ...process.env }
  }

  private current(
    profileId: ConnectionId,
    managed: ManagedTunnel,
    intent: number,
  ): boolean {
    return (
      this.intents.get(profileId) === intent &&
      this.tunnels.get(profileId)?.generation === managed.generation &&
      !managed.stopping
    )
  }

  private ensureCurrent(
    profileId: ConnectionId,
    managed: ManagedTunnel,
    intent: number,
  ): void {
    if (!this.current(profileId, managed, intent)) throw new SupersededError()
  }

  private async verifyLogin(
    managed: ManagedTunnel,
    profileId: ConnectionId,
    intent: number,
  ): Promise<void> {
    const binary = resolveTshBinary(managed.config)
    this.setState(
      managed,
      profileId,
      'checking-login',
      'Checking Teleport login…',
    )
    const status = await this.deps.checkStatus(
      binary,
      this.env(),
      managed.abort.signal,
    )
    this.ensureCurrent(profileId, managed, intent)
    if (!status.loggedIn) {
      throw new PreConnectError(
        'TSH_NOT_LOGGED_IN',
        'No active Teleport session was found. Run "tsh login", then try again.',
      )
    }
    if (isSessionExpired(status.validUntil, this.deps.now())) {
      throw new PreConnectError(
        'TSH_NOT_LOGGED_IN',
        'Your Teleport session has expired. Run "tsh login", then try again.',
      )
    }
  }

  private async launch(
    managed: ManagedTunnel,
    profileId: ConnectionId,
    intent: number,
  ): Promise<void> {
    this.setState(managed, profileId, 'starting', 'Starting Teleport tunnel…')
    const child = this.deps.spawnTsh(
      resolveTshBinary(managed.config),
      buildProxyDbArgs(managed.config),
      this.env(),
    )
    managed.child = child

    const output = { stderr: '', stdout: '' }
    child.stderr?.on('data', (chunk) => {
      output.stderr = (output.stderr + String(chunk)).slice(-4000)
    })
    child.stdout?.on('data', (chunk) => {
      output.stdout = (output.stdout + String(chunk)).slice(-4000)
    })

    let exitedResolve!: () => void
    const exitDeferred = new Promise<void>((resolve) => {
      exitedResolve = resolve
    })
    child.on('error', (error) => {
      output.stderr = `${output.stderr}\n${error.message}`.trim()
      exitedResolve()
    })
    child.on('exit', () => exitedResolve())

    this.setState(
      managed,
      profileId,
      'waiting-for-port',
      `Waiting for the tunnel on ${DEFAULT_TUNNEL_HOST}:${managed.config.tunnelPort}…`,
    )
    const port = managed.config.tunnelPort
    let portReady = false
    try {
      await Promise.race([
        this.deps
          .waitForPort(
            port,
            tunnelTimeout(managed.config),
            managed.abort.signal,
          )
          .then(() => {
            portReady = true
          }),
        exitDeferred.then(() => {
          if (portReady) return
          const detail = summarizeTshFailure(output.stderr, output.stdout)
          throw new PreConnectError(
            'TUNNEL_FAILED',
            `The Teleport tunnel exited before opening ${DEFAULT_TUNNEL_HOST}:${port}.${
              detail ? ` ${detail}` : ''
            }`,
          )
        }),
      ])
    } catch (error) {
      if (!(error instanceof SupersededError)) killProcessTree(child, 'SIGTERM')
      managed.child = null
      throw error
    }

    if (!this.current(profileId, managed, intent)) {
      killProcessTree(child, 'SIGTERM')
      throw new SupersededError()
    }

    managed.attempt = 0
    managed.consecutiveHealthFailures = 0
    this.setState(
      managed,
      profileId,
      'ready',
      `Teleport tunnel ready on ${DEFAULT_TUNNEL_HOST}:${port}.`,
    )

    exitDeferred.then(() =>
      this.handleUnexpectedExit(managed, profileId, intent, output),
    )
    if (isKeepaliveEnabled(managed.config))
      this.startHealth(managed, profileId, intent)
  }

  private handleUnexpectedExit(
    managed: ManagedTunnel,
    profileId: ConnectionId,
    intent: number,
    output: { stderr: string; stdout: string },
  ): void {
    if (!this.current(profileId, managed, intent)) return
    if (managed.state === 'restarting') return
    this.stopHealth(managed)
    managed.child = null
    const detail = summarizeTshFailure(output.stderr, output.stdout)
    if (!isKeepaliveEnabled(managed.config)) {
      void this.fail(
        managed,
        profileId,
        new PreConnectError(
          'TUNNEL_FAILED',
          detail
            ? `The Teleport tunnel stopped. ${detail}`
            : 'The Teleport tunnel stopped.',
        ),
      )
      return
    }
    this.scheduleRestart(
      managed,
      profileId,
      intent,
      detail || 'the tunnel process stopped',
    )
  }

  private scheduleRestart(
    managed: ManagedTunnel,
    profileId: ConnectionId,
    intent: number,
    reason: string,
  ): void {
    if (!this.current(profileId, managed, intent)) return
    if (managed.attempt >= this.deps.maxRestarts) {
      void this.fail(
        managed,
        profileId,
        new PreConnectError(
          'TUNNEL_FAILED',
          `The Teleport tunnel could not be restored after ${this.deps.maxRestarts} attempts (${reason}).`,
        ),
      )
      return
    }
    managed.attempt += 1
    const delay = Math.min(
      this.deps.restartBaseDelayMs * 2 ** (managed.attempt - 1),
      this.deps.restartMaxDelayMs,
    )
    this.setState(
      managed,
      profileId,
      'restarting',
      `Teleport tunnel dropped (${reason}). Reconnecting…`,
    )
    managed.restartTimer = setTimeout(() => {
      managed.restartTimer = null
      void this.recover(managed, profileId, intent)
    }, delay)
    managed.restartTimer.unref?.()
  }

  private async recover(
    managed: ManagedTunnel,
    profileId: ConnectionId,
    intent: number,
  ): Promise<void> {
    if (!this.current(profileId, managed, intent)) return
    try {
      // A dropped tunnel is often an expired certificate; re-checking login turns
      // a cryptic pg failure into an actionable "run tsh login" message.
      await this.verifyLogin(managed, profileId, intent)
      await this.launch(managed, profileId, intent)
    } catch (error) {
      if (error instanceof SupersededError) return
      if (!this.current(profileId, managed, intent)) return
      this.scheduleRestart(managed, profileId, intent, messageOf(error))
    }
  }

  private startHealth(
    managed: ManagedTunnel,
    profileId: ConnectionId,
    intent: number,
  ): void {
    this.stopHealth(managed)
    managed.healthTimer = setInterval(() => {
      void this.checkHealth(managed, profileId, intent)
    }, this.deps.healthIntervalMs)
    managed.healthTimer.unref?.()
  }

  private stopHealth(managed: ManagedTunnel): void {
    if (managed.healthTimer) {
      clearInterval(managed.healthTimer)
      managed.healthTimer = null
    }
  }

  private async checkHealth(
    managed: ManagedTunnel,
    profileId: ConnectionId,
    intent: number,
  ): Promise<void> {
    if (!this.current(profileId, managed, intent)) return
    if (managed.state !== 'ready') return
    const ok = await this.deps.probePort(managed.config.tunnelPort)
    if (!this.current(profileId, managed, intent)) return
    if (ok) {
      managed.consecutiveHealthFailures = 0
      return
    }
    managed.consecutiveHealthFailures += 1
    if (managed.consecutiveHealthFailures < this.deps.healthFailureThreshold)
      return
    this.stopHealth(managed)
    // Mark restarting before killing so the child's own exit handler is inert.
    this.setState(
      managed,
      profileId,
      'restarting',
      'The Teleport tunnel stopped responding. Reconnecting…',
    )
    if (managed.child) killProcessTree(managed.child, 'SIGTERM')
    managed.child = null
    this.scheduleRestart(
      managed,
      profileId,
      intent,
      'the tunnel stopped responding',
    )
  }

  private async fail(
    managed: ManagedTunnel,
    profileId: ConnectionId,
    error: unknown,
  ): Promise<void> {
    this.stopHealth(managed)
    if (managed.restartTimer) {
      clearTimeout(managed.restartTimer)
      managed.restartTimer = null
    }
    await this.terminate(managed)
    this.tunnels.delete(profileId)
    const code = error instanceof PreConnectError ? error.code : null
    this.setState(managed, profileId, 'failed', messageOf(error), code)
  }

  private async terminate(managed: ManagedTunnel): Promise<void> {
    const child = managed.child
    managed.child = null
    if (!child) return
    killProcessTree(child, 'SIGTERM')
    await this.waitForExit(child, this.deps.killGraceMs)
    killProcessTree(child, 'SIGKILL')
  }

  private waitForExit(child: TunnelProcess, ms: number): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }
      try {
        child.once('exit', finish)
        child.once('error', finish)
      } catch {
        finish()
        return
      }
      const timer = setTimeout(finish, ms)
      timer.unref?.()
    })
  }

  private setState(
    managed: ManagedTunnel,
    profileId: ConnectionId,
    state: PreConnectState,
    message: string,
    code: PreConnectErrorCode | null = null,
  ): void {
    managed.state = state
    const event: PreConnectStateEvent = {
      profileId,
      state,
      message,
      code,
      attempt: managed.attempt,
      generation: managed.generation,
      timestamp: this.deps.now(),
    }
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        /* a broken listener must not interrupt the tunnel lifecycle */
      }
    }
  }
}
