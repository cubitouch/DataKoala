import { format as sqlFormat } from 'sql-formatter'

/**
 * SQL pretty-printing for the editor's Format button.
 *
 * Uses sql-formatter rather than round-tripping through node-sql-parser: the parser
 * would normalise the statement (re-quoting identifiers, uppercasing, dropping
 * comments) and cannot handle every dialect feature. Formatting must never lose
 * anything, so on failure we return the input untouched.
 */

export interface FormatResult {
  ok: boolean
  sql: string
  error?: string
}

export function formatSqlOrOriginal(input: string, dialect: 'postgresql' | 'bigquery' | 'duckdb' = 'postgresql'): string {
  const result = formatSql(input, dialect)
  return result.ok ? result.sql : input
}

export function formatSql(input: string, dialect: 'postgresql' | 'bigquery' | 'duckdb' = 'postgresql'): FormatResult {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, sql: input, error: 'Nothing to format.' }
  try {
    const sql = sqlFormat(trimmed, {
      language: dialect,
      keywordCase: 'upper',
      dataTypeCase: 'preserve',
      functionCase: 'preserve',
      identifierCase: 'preserve',
      indentStyle: 'standard',
      logicalOperatorNewline: 'before',
      expressionWidth: 80,
      linesBetweenQueries: 1,
      tabWidth: 2,
      useTabs: false
    })
    return { ok: true, sql: compactSqlFormatterOutput(sql) }
  } catch (e) {
    // Unparseable SQL must be left exactly as the user typed it.
    return { ok: false, sql: input, error: e instanceof Error ? e.message : String(e) }
  }
}

function compactSqlFormatterOutput(sql: string): string {
  const lines = sql.split('\n')
  const compacted: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if ((line === 'FROM' || line === 'WHERE') && lines[i + 1]?.startsWith('  ') && !lines[i + 1].endsWith(',')) {
      compacted.push(`${line} ${lines[i + 1].slice(2)}`)
      i += 1
      continue
    }
    if ((line === 'GROUP BY' || line === 'ORDER BY') && isSimpleIndentedCommaList(lines, i + 1)) {
      const items: string[] = []
      i += 1
      while (i < lines.length && lines[i].startsWith('  ')) {
        items.push(lines[i].trim().replace(/,$/, ''))
        i += 1
      }
      i -= 1
      compacted.push(`${line} ${items.join(', ')}`)
      continue
    }
    compacted.push(line)
  }
  return compacted.join('\n')
}

function isSimpleIndentedCommaList(lines: string[], start: number): boolean {
  let count = 0
  for (let i = start; i < lines.length && lines[i].startsWith('  '); i += 1) {
    const item = lines[i].trim().replace(/,$/, '')
    if (!/^[0-9]+(?:\s+ASC|\s+DESC)?;?$/i.test(item)) return false
    count += 1
  }
  return count > 0
}
