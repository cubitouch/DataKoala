import type {
  DatabaseColumnNode,
  DatabaseRelationNode,
  DatabaseSchemaNode,
} from '@shared/types'
import { AI_LIMITS, type AiQueryContext } from '@shared/ai'
import { isSystemSchema } from '@lib/databaseObjects'
const tokens = (text: string) =>
  new Set(text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [])
export function selectAiRelations(
  schemas: DatabaseSchemaNode[],
  prompt: string,
  query: string,
): DatabaseRelationNode[] {
  const words = tokens(prompt),
    queryWords = tokens(query)
  const ranked = schemas
    .filter((s) => !s.isSystem && !isSystemSchema(s.name))
    .flatMap((s) => s.relations)
    .filter(
      (r) => ['r', 'v', 'm'].includes(r.kind) && !isSystemSchema(r.schema),
    )
    .map((relation) => {
      const names = tokens(
        `${relation.schema} ${relation.name} ${relation.name.replaceAll('_', ' ')}`,
      )
      const columnNames = tokens(
        (relation.columns ?? [])
          .map((c) => c.name.replaceAll('_', ' '))
          .join(' '),
      )
      let score = queryWords.has(relation.name.toLowerCase()) ? 20 : 0
      for (const word of words) {
        if (names.has(word)) score += 4
        if (columnNames.has(word)) score += 1
      }
      return { relation, score }
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.relation.qualifiedName.localeCompare(b.relation.qualifiedName),
    )
  const relevant = ranked.filter((r) => r.score > 0)
  return (relevant.length ? relevant : ranked.slice(0, 3))
    .slice(0, AI_LIMITS.relations)
    .map((r) => r.relation)
}
export async function buildAiContext(
  relations: DatabaseRelationNode[],
  load: (
    relation: DatabaseRelationNode,
  ) => Promise<DatabaseColumnNode[] | undefined>,
): Promise<AiQueryContext> {
  const context: AiQueryContext = {
    language: { kind: 'sql', dialect: 'postgres' },
    relations: [],
  }
  let count = 0
  for (const relation of relations.slice(0, AI_LIMITS.relations)) {
    if (
      isSystemSchema(relation.schema) ||
      !['r', 'v', 'm'].includes(relation.kind)
    )
      continue
    const columns = await load(relation)
    if (!columns)
      throw new Error(
        'Could not load schema columns. Refresh connection metadata and try again.',
      )
    const next: AiQueryContext['relations'][number] = {
      schema: relation.schema,
      name: relation.name,
      kind:
        relation.kind === 'm'
          ? 'matview'
          : relation.kind === 'v'
            ? 'view'
            : 'table',
      columns: [],
    }
    context.relations.push(next)
    for (const column of columns.slice(0, AI_LIMITS.columnsPerRelation)) {
      if (count >= AI_LIMITS.columns) break
      next.columns.push({
        name: column.name,
        dataType: column.dataTypeName,
        ...(column.nullable === undefined ? {} : { nullable: column.nullable }),
      })
      if (JSON.stringify(context).length > AI_LIMITS.contextCharacters) {
        next.columns.pop()
        break
      }
      count++
    }
    if (JSON.stringify(context).length > AI_LIMITS.contextCharacters)
      context.relations.pop()
  }
  return context
}
