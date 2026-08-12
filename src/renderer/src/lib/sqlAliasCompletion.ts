import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete'
import type { DatabaseColumnNode, DatabaseRelationNode, DatabaseSchemaNode, SqlDialect } from '@shared/types'

interface ResolvedSource { alias?: string; relation: DatabaseRelationNode }
const RESERVED = new Set('select from where group order having limit offset join left right full inner outer cross natural on using union except intersect table view user'.split(' '))

export function quoteSqlIdentifier(name: string, dialect: SqlDialect): string {
  if (/^[a-z_][a-z0-9_$]*$/.test(name) && !RESERVED.has(name)) return name
  const quote = dialect === 'google-sql' ? '`' : '"'
  return `${quote}${name.replaceAll(quote, quote + quote)}${quote}`
}

function unquote(value: string): string[] {
  // BigQuery commonly quotes a whole three-part path, whereas Postgres quotes
  // each component. Preserve dots inside either representation.
  if (value.startsWith('`') && value.endsWith('`')) return value.slice(1, -1).split('.')
  return (value.match(/"[^"]*"|[^.]+/g) ?? []).map((part) => part.replace(/^"|"$/g, '').replaceAll('""', '"'))
}

export function resolveQuerySources(sql: string, schemas: DatabaseSchemaNode[]): ResolvedSource[] {
  const sources: ResolvedSource[] = []
  const pattern = /\b(?:from|join)\s+((?:`[^`]+`|"[^"]+"|[\p{L}_][\p{L}\p{N}_$-]*)(?:\s*\.\s*(?:`[^`]+`|"[^"]+"|[\p{L}_][\p{L}\p{N}_$-]*))*)(?:\s+(?:as\s+)?([\p{L}_][\p{L}\p{N}_$]*))?/giu
  for (const match of sql.matchAll(pattern)) {
    const parts = unquote(match[1].replaceAll(/\s+/g, ''))
    const relationName = parts.pop()
    const namespaceName = parts.join('.')
    const candidates = schemas.flatMap((schema) => schema.relations.map((relation) => ({ schema, relation })))
      .filter(({ schema, relation }) => relation.name === relationName && (!namespaceName || schema.name === namespaceName))
    const alias = match[2] && !RESERVED.has(match[2].toLowerCase()) ? match[2] : undefined
    if (candidates.length === 1) sources.push({ alias, relation: candidates[0].relation })
  }
  return sources
}

function columnCompletion(column: DatabaseColumnNode, dialect: SqlDialect): Completion {
  return { label: column.name, type: 'property', detail: `column · ${column.dataTypeName}`, apply: quoteSqlIdentifier(column.name, dialect) }
}

export function sqlAliasCompletionSource(
  schemas: DatabaseSchemaNode[],
  dialect: SqlDialect,
  loadColumns?: (relation: DatabaseRelationNode) => Promise<DatabaseColumnNode[] | undefined>
): CompletionSource {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const sources = resolveQuerySources(context.state.doc.toString(), schemas)
    const qualified = context.matchBefore(/(?:`[^`]+`|"[^"]+"|[\p{L}_][\p{L}\p{N}_$-]*)(?:\.(?:`[^`]+`|"[^"]+"|[\p{L}_][\p{L}\p{N}_$-]*))*\.[\p{L}\p{N}_$]*$/u)
    if (qualified) {
      const dot = qualified.text.lastIndexOf('.')
      const qualifier = qualified.text.slice(0, dot)
      const parts = unquote(qualifier)
      const relationName = parts.at(-1)
      const matches = sources.filter((item) => item.alias === qualifier || (!item.alias && item.relation.name === relationName))
      if (matches.length !== 1) return null
      const source = matches[0]
      const columns = source.relation.columnsStatus === 'loaded' ? source.relation.columns : await loadColumns?.(source.relation)
      if (!columns) return null
      return { from: qualified.from + dot + 1, options: columns.map((column) => columnCompletion(column, dialect)), validFor: /^[\p{L}\p{N}_$]*$/u }
    }
    const word = context.matchBefore(/[\p{L}\p{N}_$]*$/u)
    if (!word || (!context.explicit && !word.text)) return null
    if (sources.length !== 1) return null
    const source = sources[0]
    const columns = source.relation.columnsStatus === 'loaded' ? source.relation.columns : context.explicit ? await loadColumns?.(source.relation) : undefined
    if (!columns) return null
    return { from: word.from, options: columns.map((column) => columnCompletion(column, dialect)), validFor: /^[\p{L}\p{N}_$]*$/u }
  }
}
