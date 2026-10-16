/** Exact copy payload is independent from the bounded inspector preview. */
export function logFieldCopyText(value: unknown): string {
  if (value === null || typeof value !== 'object') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return '[Unserializable object]'
  }
}

export function formatLogFieldValue(value: unknown) {
  const kind = Array.isArray(value)
    ? 'Array'
    : value !== null && typeof value === 'object'
      ? 'Object'
      : 'Value'
  let truncated = false
  let remaining = 100
  const ancestors = new Set<object>()
  function bounded(current: unknown, depth: number): unknown {
    if (typeof current === 'string') {
      if (current.length <= 500) return current
      truncated = true
      return `${current.slice(0, 500)}…`
    }
    if (current === null || typeof current !== 'object')
      return typeof current === 'bigint' ? String(current) : current
    if (ancestors.has(current)) {
      truncated = true
      return '[Circular]'
    }
    if (depth >= 4 || --remaining < 0) {
      truncated = true
      return Array.isArray(current) ? '[Array…]' : '[Object…]'
    }
    ancestors.add(current)
    const entries = Object.entries(current)
    if (entries.length > 20) truncated = true
    const limited = entries.slice(0, 20)
    const result = Array.isArray(current)
      ? limited.map(([, item]) => bounded(item, depth + 1))
      : Object.fromEntries(
          limited.map(([key, item]) => [key, bounded(item, depth + 1)]),
        )
    ancestors.delete(current)
    return result
  }
  let text: string
  try {
    text =
      kind === 'Value'
        ? String(value)
        : JSON.stringify(bounded(value, 0), null, 2)
  } catch {
    text = '[Unserializable object]'
    truncated = true
  }
  if (text.length > 2000) {
    text = `${text.slice(0, 2000)}…`
    truncated = true
  }
  return { kind, text, truncated }
}
