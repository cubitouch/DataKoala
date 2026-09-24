import type { LokiLogRow } from '@shared/loki'
function decodedPayload(line: string): Record<string, unknown> { try { const value: unknown = JSON.parse(line); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} } catch { return {} } }
export function effectiveLogMessage(row: LokiLogRow): string { for (const record of [row.parsedFields, row.structuredMetadata, decodedPayload(row.line)]) for (const key of ['message', 'msg', 'body']) { const value = record[key]; if (typeof value === 'string' && value.trim()) return value } return row.line }
