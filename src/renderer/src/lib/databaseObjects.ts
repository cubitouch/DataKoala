import type { DatabaseSchemaNode, TableInfo } from '@shared/types'

export function isSystemSchema(schemaName: string): boolean {
  const name = schemaName.toLowerCase()
  return name === 'pg_catalog' || name === 'information_schema' ||
    name === 'pg_toast' || name.startsWith('pg_toast_') ||
    name === 'pg_temp' || name.startsWith('pg_temp_') ||
    name === 'pg_toast_temp' || name.startsWith('pg_toast_temp_')
}

function kindRank(kind: TableInfo['kind']): number {
  return kind === 'r' ? 0 : kind === 'v' ? 1 : 2
}

/** User/system, relation type, then case-insensitive qualified name. */
export function compareDatabaseObjects(left: TableInfo, right: TableInfo): number {
  const system = Number(isSystemSchema(left.schema)) - Number(isSystemSchema(right.schema))
  if (system) return system
  const kind = kindRank(left.kind) - kindRank(right.kind)
  if (kind) return kind
  return `${left.schema}.${left.name}`.localeCompare(`${right.schema}.${right.name}`, undefined, { sensitivity: 'base' })
}

export function normalizeDatabaseObjects(objects: TableInfo[]): DatabaseSchemaNode[] {
  const schemas = new Map<string, DatabaseSchemaNode>()
  for (const object of [...objects].sort(compareDatabaseObjects)) {
    let schema = schemas.get(object.schema)
    if (!schema) {
      schema = { name: object.schema, isSystem: isSystemSchema(object.schema), relations: [] }
      schemas.set(object.schema, schema)
    }
    schema.relations.push({ ...object, qualifiedName: `${object.schema}.${object.name}`, columnsStatus: 'idle' })
  }
  return [...schemas.values()].sort((a, b) =>
    Number(a.isSystem) - Number(b.isSystem) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}
