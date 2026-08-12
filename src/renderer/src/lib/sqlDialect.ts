import { PostgreSQL, SQLDialect, StandardSQL } from '@codemirror/lang-sql'
import type { SqlDialect } from '@shared/types'

const append = (base: string | undefined, additions: string) => [base, additions].filter(Boolean).join(' ')

/** DuckDB deliberately stays close to its PostgreSQL-derived grammar. */
export const DuckDBDialect = SQLDialect.define({
  ...PostgreSQL.spec,
  keywords: append(PostgreSQL.spec.keywords, 'pivot unpivot qualify sample summarize macro'),
  builtin: append(PostgreSQL.spec.builtin, 'arg_max arg_min epoch_ms list_transform read_csv read_json range generate_series'),
  types: append(PostgreSQL.spec.types, 'hugeint uhugeint ubigint uinteger usmallint utinyint blob struct map union')
})

export function codeMirrorDialect(dialect: SqlDialect): SQLDialect {
  if (dialect === 'google-sql') return StandardSQL
  if (dialect === 'duckdb') return DuckDBDialect
  return PostgreSQL
}

export type FormatterDialect = 'postgresql' | 'bigquery' | 'duckdb'

export function formatterDialect(dialect: SqlDialect): FormatterDialect {
  return dialect === 'google-sql' ? 'bigquery' : dialect === 'duckdb' ? 'duckdb' : 'postgresql'
}
