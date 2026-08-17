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

function runtimeType(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'Array'
  if (Buffer.isBuffer(value)) return 'Buffer'
  if (value instanceof Uint8Array) return 'Uint8Array'
  if (typeof value !== 'object') return typeof value
  return (value as { constructor?: { name?: string } }).constructor?.name || 'Object'
}

function cloneError(value: unknown): string | null {
  try {
    structuredClone(value)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

function logCloneDiagnostics(result: QueryResult, safeRows: Record<string, unknown>[]): void {
  const resultError = cloneError({ ...result, rows: safeRows })
  if (!resultError) return

  console.error('[ipc] query result is not structured-clone-safe after normalization', {
    provider: result.execution?.provider,
    rowCount: safeRows.length,
    error: resultError
  })

  const columnsByName = new Map(result.columns.map((column) => [column.name, column]))
  let logged = 0
  const maxLogged = 20

  for (let rowIndex = 0; rowIndex < safeRows.length && logged < maxLogged; rowIndex++) {
    const rawRow = result.rows[rowIndex]
    const safeRow = safeRows[rowIndex]
    for (const [columnName, safeValue] of Object.entries(safeRow)) {
      const error = cloneError(safeValue)
      if (!error) continue
      const column = columnsByName.get(columnName)
      console.error('[ipc] non-cloneable query cell', {
        provider: result.execution?.provider,
        rowIndex,
        column: columnName,
        logicalType: column?.logicalType,
        nativeType: column?.nativeType ?? column?.dataTypeName,
        rawRuntimeType: runtimeType(rawRow?.[columnName]),
        normalizedRuntimeType: runtimeType(safeValue),
        error
      })
      logged++
      if (logged >= maxLogged) break
    }
  }

  if (logged === 0) {
    console.error('[ipc] clone failure was not attributable to an individual top-level cell', {
      provider: result.execution?.provider,
      columns: result.columns.map((column) => ({
        name: column.name,
        logicalType: column.logicalType,
        nativeType: column.nativeType ?? column.dataTypeName
      }))
    })
  }
}

export function toIpcSafeQueryResult(result: QueryResult): QueryResult {
  const safeRows = result.rows.map((row) => toIpcSafeValue(row) as Record<string, unknown>)
  logCloneDiagnostics(result, safeRows)
  return {
    ...result,
    rows: safeRows
  }
}
