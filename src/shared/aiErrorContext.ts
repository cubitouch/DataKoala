import { AI_LIMITS } from './ai.ts'

const REDACTED = '[REDACTED]'

/** Sanitizes datasource diagnostics before external AI disclosure. */
export function sanitizeAiErrorContext(value: string): string {
  const sanitized = value
    .replace(
      /\b(postgres(?:ql)?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi,
      `$1$2:${REDACTED}@`,
    )
    .replace(/\b(Authorization\s*:\s*)[^\r\n]*/gi, `$1${REDACTED}`)
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`)
    .replace(
      /(["']?(?:password|passwd|api[_-]?key|access[_-]?token|secret|token)["']?\s*[:=]\s*["']?)(?!\[REDACTED\])[^\s,"';}]+/gi,
      `$1${REDACTED}`,
    )
    .replace(/(^|[\s=(,;])\/(?!\/)[^\s:'"),;]+/g, `$1${REDACTED}`)
    .replace(/\b[A-Za-z]:\\[^\s:'"),;]+/g, REDACTED)
  return sanitized.slice(0, AI_LIMITS.errorCharacters)
}
