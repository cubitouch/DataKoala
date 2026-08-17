import type { QueryResult } from '../shared/types.ts'

/**
 * Electron IPC uses Chromium's structured-clone machinery, which cannot carry
 * arbitrary Node/custom class instances. Database drivers can expose those in
 * result rows (for example node-postgres interval values), so normalize values
 * at the IPC boundary while preserving the structured-clone-native types the UI
 * relies on, notably Date.
 */
export function toIpcSafeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  if (value instanceof Date) return value
  if (Buffer.isBuffer(value)) return Uint8Array.from(value)
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return value
  if (Array.isArray(value)) return value.map(toIpcSafeValue)

  const record = value as Record<string, unknown>
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, toIpcSafeValue(entry)]))
}

export function toIpcSafeQueryResult(result: QueryResult): QueryResult {
  return {
    ...result,
    rows: result.rows.map((row) => toIpcSafeValue(row) as Record<string, unknown>)
  }
}
