import type {
  DatabaseColumnNode,
  DatabaseRelationNode,
  DatabaseSchemaNode,
} from '@shared/types'
import {
  AI_LIMITS,
  type AiQueryContext,
  type AiRelationContext,
} from '@shared/ai'
import { isSystemSchema } from '@lib/databaseObjects'

const tokens = (text: string) =>
  new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).flatMap((word) =>
      word.length > 3 && word.endsWith('s')
        ? [word, word.slice(0, -1)]
        : [word],
    ),
  )

const eligibleRelations = (schemas: DatabaseSchemaNode[]) =>
  schemas
    .filter((schema) => !schema.isSystem && !isSystemSchema(schema.name))
    .flatMap((schema) => schema.relations)
    .filter(
      (relation) =>
        ['r', 'v', 'm'].includes(relation.kind) &&
        !isSystemSchema(relation.schema),
    )

const relationKey = (relation: { schema: string; name: string }) =>
  `${relation.schema}.${relation.name}`

function rankRelations(
  schemas: DatabaseSchemaNode[],
  searchText: string,
  currentQuery: string,
) {
  const words = tokens(searchText),
    queryWords = tokens(currentQuery)
  return eligibleRelations(schemas)
    .map((relation) => {
      const names = tokens(
        `${relation.schema} ${relation.name} ${relation.name.replaceAll('_', ' ')}`,
      )
      const columnNames = tokens(
        (relation.columns ?? [])
          .map((column) => column.name.replaceAll('_', ' '))
          .join(' '),
      )
      const referenced = queryWords.has(relation.name.toLowerCase())
      let score = 0
      for (const word of words) {
        if (names.has(word)) score += 4
        if (columnNames.has(word)) score += 1
      }
      return { relation, score, referenced }
    })
    .sort(
      (a, b) =>
        Number(b.referenced) - Number(a.referenced) ||
        b.score - a.score ||
        a.relation.qualifiedName.localeCompare(b.relation.qualifiedName),
    )
}

function fillFallback(
  selected: DatabaseRelationNode[],
  ranked: ReturnType<typeof rankRelations>,
  limit: number,
) {
  const selectedNames = new Set(selected.map(relationKey))
  const representedSchemas = new Set(selected.map((relation) => relation.schema))
  const groups = new Map<string, DatabaseRelationNode[]>()
  for (const { relation } of ranked) {
    if (selectedNames.has(relationKey(relation))) continue
    const group = groups.get(relation.schema) ?? []
    group.push(relation)
    groups.set(relation.schema, group)
  }
  const schemaNames = [...groups.keys()].sort(
    (a, b) =>
      Number(representedSchemas.has(a)) - Number(representedSchemas.has(b)) ||
      a.localeCompare(b),
  )
  for (const group of groups.values())
    group.sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName))
  while (selected.length < limit) {
    let added = false
    for (const schema of schemaNames) {
      const next = groups.get(schema)!.shift()
      if (next) {
        selected.push(next)
        selectedNames.add(relationKey(next))
        added = true
      }
      if (selected.length === limit) break
    }
    if (!added) break
  }
}

export function selectAiRelations(
  schemas: DatabaseSchemaNode[],
  prompt: string,
  query: string,
): DatabaseRelationNode[] {
  const ranked = rankRelations(schemas, prompt, query)
  const referenced = ranked.filter((item) => item.referenced)
  const limit = Math.min(
    AI_LIMITS.relations,
    Math.max(AI_LIMITS.initialRelations, referenced.length),
  )
  const selected = referenced.slice(0, limit).map((item) => item.relation)
  const selectedNames = new Set(selected.map(relationKey))
  for (const item of ranked) {
    if (
      selected.length >= limit ||
      item.score <= 0 ||
      selectedNames.has(relationKey(item.relation))
    )
      continue
    selected.push(item.relation)
    selectedNames.add(relationKey(item.relation))
  }
  // Strong prompt/current-query matches stay first. Only the spare initial
  // budget gets generic round-robin catalog coverage, leaving room for one
  // explicit discovery expansion later.
  fillFallback(selected, ranked, limit)
  return selected
}

export function expandAiRelations(
  schemas: DatabaseSchemaNode[],
  searchTerms: string[],
  currentQuery: string,
  alreadyDisclosedRelations: ReadonlyArray<
    Pick<AiRelationContext, 'schema' | 'name'>
  >,
): DatabaseRelationNode[] {
  const disclosed = new Set(alreadyDisclosedRelations.map(relationKey))
  const remaining = Math.max(0, AI_LIMITS.relations - disclosed.size)
  if (!remaining) return []
  return rankRelations(schemas, searchTerms.join(' '), currentQuery)
    .filter(
      (item) =>
        !disclosed.has(relationKey(item.relation)) &&
        (item.referenced || item.score > 0),
    )
    .slice(0, remaining)
    .map((item) => item.relation)
}

export async function appendAiContext(
  base: AiQueryContext,
  relations: DatabaseRelationNode[],
  load: (
    relation: DatabaseRelationNode,
  ) => Promise<DatabaseColumnNode[] | undefined>,
): Promise<AiQueryContext> {
  const context: AiQueryContext = {
    language: { ...base.language },
    relations: base.relations.map((relation) => ({
      ...relation,
      columns: relation.columns.map((column) => ({ ...column })),
    })),
  }
  const existing = new Set(context.relations.map(relationKey))
  let count = context.relations.reduce(
    (total, relation) => total + relation.columns.length,
    0,
  )
  for (const relation of relations) {
    if (
      context.relations.length >= AI_LIMITS.relations ||
      existing.has(relationKey(relation)) ||
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
    if (JSON.stringify(context).length > AI_LIMITS.contextCharacters) {
      context.relations.pop()
      break
    }
    existing.add(relationKey(relation))
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
  }
  return context
}

export async function buildAiContext(
  relations: DatabaseRelationNode[],
  load: (
    relation: DatabaseRelationNode,
  ) => Promise<DatabaseColumnNode[] | undefined>,
): Promise<AiQueryContext> {
  return appendAiContext(
    { language: { kind: 'sql', dialect: 'postgres' }, relations: [] },
    relations.slice(0, AI_LIMITS.relations),
    load,
  )
}
