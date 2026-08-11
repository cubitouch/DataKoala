import type { ColumnMeta } from '@shared/types'

export type JsonExplorerValue = null | boolean | number | string | JsonExplorerValue[] | { [key: string]: JsonExplorerValue }
export type NormalizedJsonCell = { status: 'valid'; value: JsonExplorerValue; formatted: string } | { status: 'invalid'; raw: string; message: string }

const INVALID_MESSAGE = 'This JSON value could not be formatted.'
const JSON_TYPE_OIDS = new Set([114, 3802])

export function normalizePostgresTypeName(typeName: string | null | undefined): string {
  return String(typeName ?? '').trim().toLowerCase().replace(/^pg_catalog\./, '')
}

export function isJsonColumnType(column: Pick<ColumnMeta, 'dataTypeName' | 'dataTypeID'> | null | undefined): boolean {
  if (!column) return false
  const type = normalizePostgresTypeName(column.dataTypeName)
  return type === 'json' || type === 'jsonb' || JSON_TYPE_OIDS.has(column.dataTypeID)
}

function rawRepresentation(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    const serialized = JSON.stringify(value)
    return serialized === undefined ? String(value) : serialized
  } catch {
    return Object.prototype.toString.call(value)
  }
}

function invalid(value: unknown): NormalizedJsonCell {
  return { status: 'invalid', raw: rawRepresentation(value), message: INVALID_MESSAGE }
}

export function normalizeJsonCellValue(value: unknown): NormalizedJsonCell {
  let parsed = value
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) } catch { return invalid(value) }
  } else if (value === undefined || typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function') {
    return invalid(value)
  }

  try {
    const formatted = JSON.stringify(parsed, null, 2)
    if (formatted === undefined) return invalid(value)
    return { status: 'valid', value: parsed as JsonExplorerValue, formatted }
  } catch {
    return invalid(value)
  }
}

export function mayContainJsonDocument(value: unknown): value is string {
  if (typeof value !== 'string') return false

  const trimmed = value.trim()

  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  )
}
