import { AI_LIMITS } from './ai.ts'

const REDACTED = '[REDACTED]'

/** Sanitizes datasource diagnostics before external AI disclosure. */
export function sanitizeAiErrorContext(value: string): string {
  const sanitized = value
    .replace(
      /\b(postgres(?:ql)?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi,
      `$1$2:${REDACTED}@`,
    )
    .replace(
      /\b(Authorization\s*:\s*)(?:Bearer\s+)?[^\s,;]+/gi,
      `$1${REDACTED}`,
    )
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`)
    .replace(
      /(["']?(?:password|passwd|api[_-]?key|access[_-]?token|secret|token)["']?\s*[:=]\s*["']?)(?!\[REDACTED\])[^\s,"';}]+/gi,
      `$1${REDACTED}`,
    )
    .replace(/(?:\/Users|\/home)\/[^\s:'"),;]+/g, REDACTED)
    .replace(/[A-Za-z]:\\Users\\[^\s:'"),;]+/g, REDACTED)
  return sanitized.slice(0, AI_LIMITS.errorCharacters)
}
