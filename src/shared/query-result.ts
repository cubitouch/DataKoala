import type { ColumnMeta, QueryResult } from './types.ts'

/** Returns the stable row-property identity for a result column. */
export function resultColumnKey(column: Pick<ColumnMeta, 'name' | 'key'>): string {
  return column.key ?? column.name
}

/** Reads a cell while retaining compatibility with name-keyed result rows. */
export function resultCellValue(
  row: QueryResult['rows'][number],
  column: Pick<ColumnMeta, 'name' | 'key'>
): unknown {
  return row[resultColumnKey(column)]
}
