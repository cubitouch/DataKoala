const scriptMessage =
  'BigQuery connections are read-only. Use DECLARE, SET for local variables, and SELECT statements, ending with a SELECT. Writes, dynamic SQL, and control-flow scripts are not supported.'

// This is a conservative statement-boundary scanner, not a SQL parser. BigQuery's
// dry run still validates SQL. Ignore quoted contents/comments when checking the
// supported script subset so a semicolon in a literal cannot hide a later write.
function scriptStatements(sql: string): string[] {
  const statements: string[] = []
  let statement = ''
  let i = 0
  while (i < sql.length) {
    const char = sql[i]
    if (sql.startsWith('--', i) || char === '#') {
      while (i < sql.length && sql[i] !== '\n' && sql[i] !== '\r') i++
      statement += ' '
    } else if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2)
      if (end < 0)
        throw new Error(
          'Unterminated BigQuery comment. Close the comment before running the query.',
        )
      i = end + 2
      statement += ' '
    } else if (char === "'" || char === '"' || char === '`') {
      const delimiter =
        char !== '`' && sql.startsWith(char.repeat(3), i)
          ? char.repeat(3)
          : char
      i += delimiter.length
      let closed = false
      while (i < sql.length) {
        // Escaped quotes do not end a literal, including raw literals where the
        // backslash is retained. Odd trailing backslashes are invalid in GoogleSQL.
        if (sql[i] === '\\') {
          i += 2
          continue
        }
        if (sql.startsWith(delimiter, i)) {
          i += delimiter.length
          closed = true
          break
        }
        i++
      }
      if (!closed)
        throw new Error(
          'Unterminated BigQuery quoted value. Close the quote before running the query.',
        )
      statement += char === '`' ? ' quoted_identifier ' : ' ? '
    } else if (char === ';') {
      if (statement.trim()) statements.push(statement.trim())
      statement = ''
      i++
    } else {
      statement += char
      i++
    }
  }
  if (statement.trim()) statements.push(statement.trim())
  return statements
}

export function assertReadOnlyBigQueryScript(sql: string): void {
  const statements = scriptStatements(sql)
  for (const statement of statements) {
    // Pipe syntax can include write operators despite starting with SELECT.
    // Keep it outside this deliberately limited script subset.
    if (statement.includes('|>')) throw new Error(scriptMessage)
    if (/^(SELECT|WITH|DECLARE)\b/i.test(statement)) continue
    // Only user-variable assignments: never SET @@system_variable, which can
    // change the query destination or other execution settings.
    if (
      /^SET\s+(?:[a-z_]\w*|\(\s*[a-z_]\w*(?:\s*,\s*[a-z_]\w*)*\s*\))\s*=/i.test(
        statement,
      )
    )
      continue
    throw new Error(scriptMessage)
  }
  if (!/^(SELECT|WITH)\b/i.test(statements.at(-1) ?? ''))
    throw new Error(scriptMessage)
}
