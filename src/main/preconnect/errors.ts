export type PreConnectErrorCode =
  | 'TSH_NOT_FOUND'
  | 'TSH_NOT_LOGGED_IN'
  | 'TUNNEL_TIMEOUT'
  | 'TUNNEL_FAILED'
  | 'INVALID_CONFIG'

/** A pre-connect failure that should surface as a connection error, not a crash. */
export class PreConnectError extends Error {
  readonly code: PreConnectErrorCode

  constructor(code: PreConnectErrorCode, message: string) {
    super(message)
    this.name = 'PreConnectError'
    this.code = code
  }
}

/**
 * Removes credentials that a tool may echo back in its output. Kept deliberately
 * identical in spirit to the gcx sanitizer so tunnel errors never leak tokens.
 */
export function sanitizeTshOutput(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?\S+/gi, '$1[redacted]')
    .replace(/(cookie\s*[:=]\s*)[^\r\n]+/gi, '$1[redacted]')
    .replace(/(token|password|secret)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/https?:\/\/[^\s@]+@/g, 'https://[redacted]@')
    .trim()
}

/** Normalizes a spawned process's captured output into a single short line. */
export function summarizeTshFailure(stderr: string, stdout: string): string {
  const raw = `${stderr}\n${stdout}`
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
  return sanitizeTshOutput(raw).slice(0, 600)
}

/**
 * `tsh status` writes its JSON to stdout and then, for an expired certificate,
 * prints "Active profile expired." to stderr and exits non-zero. Turn that (and
 * the equivalent "not logged in" cases) into the same actionable message so the
 * user is told to run `tsh login` rather than shown a raw CLI error.
 */
export function classifyTshStatusFailure(
  detail: string,
): PreConnectError | null {
  if (/expired/i.test(detail)) {
    return new PreConnectError(
      'TSH_NOT_LOGGED_IN',
      'Your Teleport session has expired. Run "tsh login", then try again.',
    )
  }
  if (/not logged|no.*profile|login required|unauthenticated/i.test(detail)) {
    return new PreConnectError(
      'TSH_NOT_LOGGED_IN',
      'No active Teleport session was found. Run "tsh login", then try again.',
    )
  }
  return null
}
