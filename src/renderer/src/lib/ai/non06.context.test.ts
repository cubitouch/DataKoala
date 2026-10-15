import { expect, test } from 'vitest'
import { AI_LIMITS } from '@shared/ai'
import type { DatabaseColumnNode, DatabaseRelationNode, DatabaseSchemaNode } from '@shared/types'
import {
  appendAiContext,
  buildAiContext,
  expandAiRelations,
  selectAiRelations,
  withAiRelationCatalog,
} from './context'

const relation = (name: string, schema = 'public'): DatabaseRelationNode => ({
  name,
  schema,
  qualifiedName: `${schema}.${name}`,
  kind: 'r',
  columnsStatus: 'loaded',
  columns: [],
})
const catalog = (relations: DatabaseRelationNode[]): DatabaseSchemaNode[] => [
  { name: 'public', isSystem: false, relations },
]
const columns = (prefix: string): DatabaseColumnNode[] =>
  Array.from({ length: AI_LIMITS.columnsPerRelation + 5 }, (_, index) => ({
    name: `${prefix}_${index}`,
    dataTypeName: 'text',
  }))

test('NON06 initial and discovery budgets apply to actual JSON and preserve structurally valid context', async () => {
  const relations = Array.from({ length: 12 }, (_, i) => relation(`device_${i}`))
  const data = catalog(relations)
  const selected = selectAiRelations(data, 'device', '')
  expect(selected).toHaveLength(AI_LIMITS.initialRelations)
  const initial = withAiRelationCatalog(
    await buildAiContext('postgres', selected, async (item) => columns(item.name)),
    data,
    'device',
    '',
  )
  expect(initial.relations).toHaveLength(AI_LIMITS.initialRelations)
  expect(initial.relations.flatMap((item) => item.columns)).toHaveLength(AI_LIMITS.initialColumns)
  expect(JSON.stringify(initial).length).toBeLessThanOrEqual(AI_LIMITS.contextCharacters)
  expect(initial.availableRelations?.length).toBeGreaterThan(0)
  expect(initial.availableRelations?.length).toBeLessThanOrEqual(AI_LIMITS.relationCatalog)
  const candidates = expandAiRelations(data, ['device'], '', initial.relations)
  expect(candidates).toHaveLength(AI_LIMITS.relations - AI_LIMITS.initialRelations)
  const expanded = await appendAiContext(
    {
      language: initial.language,
      relations: initial.relations,
    },
    candidates,
    async (item) => columns(item.name),
  )
  expect(expanded.relations).toHaveLength(AI_LIMITS.relations)
  expect(expanded.relations.flatMap((item) => item.columns)).toHaveLength(AI_LIMITS.columns)
  expect(JSON.stringify(expanded).length).toBeLessThanOrEqual(AI_LIMITS.contextCharacters)
  expect(() => JSON.parse(JSON.stringify(expanded))).not.toThrow()
})

test('NON06 oversized metadata is truncated by serialized JSON budget, not by slicing JSON text', async () => {
  const data = catalog(Array.from({ length: 8 }, (_, i) => relation(`table_${i}`)))
  const initial = await buildAiContext(
    'postgres',
    selectAiRelations(data, '', ''),
    async () => Array.from({ length: AI_LIMITS.columnsPerRelation }, (_, i) => ({
      name: `c_${i}_${'X'.repeat(240)}`,
      dataTypeName: 'T'.repeat(240),
    })),
  )
  const json = JSON.stringify(initial)
  expect(json.length).toBeLessThanOrEqual(AI_LIMITS.initialContextCharacters)
  expect(JSON.parse(json)).toEqual(initial)
  expect(initial.relations.every((item) => item.columns.length <= AI_LIMITS.columnsPerRelation)).toBe(true)
  expect(initial.relations.flatMap((item) => item.columns).length).toBeLessThanOrEqual(AI_LIMITS.initialColumns)
})

test('NON06 zero remaining slots and duplicates never request more column metadata', async () => {
  const disclosed = Array.from({ length: AI_LIMITS.relations }, (_, i) => ({
    schema: 'public',
    name: `already_${i}`,
    kind: 'table' as const,
    columns: [],
  }))
  const data = catalog([relation('devices'), relation('devices'), relation('private_orders', 'pg_catalog')])
  expect(expandAiRelations(data, ['devices'], '', disclosed)).toEqual([])
  let calls = 0
  const result = await appendAiContext(
    { language: { kind: 'sql', dialect: 'postgres' }, relations: disclosed },
    [relation('devices'), relation('devices')],
    async () => {
      calls++
      return columns('devices')
    },
  )
  expect(result.relations).toHaveLength(AI_LIMITS.relations)
  expect(calls).toBe(0)
})

test('NON06 unknown terms and system-schema relations cannot expand the local metadata catalog', () => {
  const data: DatabaseSchemaNode[] = [
    { name: 'public', isSystem: false, relations: [relation('devices')] },
    { name: 'pg_catalog', isSystem: true, relations: [relation('secret_table', 'pg_catalog')] },
  ]
  expect(expandAiRelations(data, ['missing'], '', [])).toEqual([])
  expect(expandAiRelations(data, ['secret_table'], '', [])).toEqual([])
  expect(expandAiRelations(data, ['devices'], '', [{ schema: 'public', name: 'devices' }])).toEqual([])
})

test('NON06 characterization: duplicate SQL references can consume initial relation slots', () => {
  const duplicated = relation('orders')
  const data = catalog([duplicated, { ...duplicated }, ...Array.from({ length: 9 }, (_, i) => relation(`other_${i}`))])
  const selected = selectAiRelations(data, '', 'select * from orders')
  expect(selected.filter((item) => item.name === 'orders')).toHaveLength(2)
})
