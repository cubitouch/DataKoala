import type { SQLNamespace } from '@codemirror/lang-sql'
import type { DatabaseSchemaNode, SqlDialect } from '@shared/types'

export interface SqlCompletionSchema {
  schema: SQLNamespace
  defaultSchema?: string
}

interface MutableNamespace {
  [key: string]: MutableNamespace | readonly string[]
}

/** Converts the store cache only. This function has no access to IPC or adapters. */
export function buildSqlCompletionSchema(schemas: DatabaseSchemaNode[], dialect: SqlDialect): SqlCompletionSchema {
  const root: MutableNamespace = {}
  for (const namespace of schemas) {
    const parts = dialect === 'google-sql' ? namespace.name.split('.') : [namespace.name]
    let target = root
    for (const part of parts) {
      const existing = target[part]
      if (!existing || Array.isArray(existing)) target[part] = {}
      target = target[part] as MutableNamespace
    }
    for (const relation of namespace.relations) {
      // Contextual completion is the sole column provider, so columns have
      // datatype details and never appear twice. CodeMirror still discovers
      // every namespace and relation through this empty leaf.
      target[relation.name] = []
    }
  }
  return { schema: root as SQLNamespace, defaultSchema: dialect === 'duckdb' && schemas.some((item) => item.name === 'main') ? 'main' : undefined }
}
