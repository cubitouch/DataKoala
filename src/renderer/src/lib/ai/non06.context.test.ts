import { expect, test } from 'vitest'
import { AI_LIMITS } from '@shared/ai'
import type {
  DatabaseColumnNode,
  DatabaseRelationNode,
  DatabaseSchemaNode,
} from '@shared/types'
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
  const relations = Array.from({ length: 12 }, (_, i) =>
    relation(`device_${i}`),
  )
  const data = catalog(relations)
  const selected = selectAiRelations(data, 'device', '')
  expect(selected).toHaveLength(AI_LIMITS.initialRelations)
  const initial = withAiRelationCatalog(
    await buildAiContext('postgres', selected, async (item) =>
      columns(item.name),
    ),
    data,
    'device',
    '',
  )
  expect(initial.relations).toHaveLength(AI_LIMITS.initialRelations)
  expect(initial.relations.flatMap((item) => item.columns)).toHaveLength(
    AI_LIMITS.initialColumns,
  )
  expect(JSON.stringify(initial).length).toBeLessThanOrEqual(
    AI_LIMITS.contextCharacters,
  )
  expect(initial.availableRelations?.length).toBeGreaterThan(0)
  expect(initial.availableRelations?.length).toBeLessThanOrEqual(
    AI_LIMITS.relationCatalog,
  )
  const candidates = expandAiRelations(data, ['device'], '', initial.relations)
  expect(candidates).toHaveLength(
    AI_LIMITS.relations - AI_LIMITS.initialRelations,
  )
  const expanded = await appendAiContext(
    {
      language: initial.language,
      relations: initial.relations,
    },
    candidates,
    async (item) => columns(item.name),
  )
  expect(expanded.relations).toHaveLength(AI_LIMITS.relations)
  expect(expanded.relations.flatMap((item) => item.columns)).toHaveLength(
    AI_LIMITS.columns,
  )
  expect(JSON.stringify(expanded).length).toBeLessThanOrEqual(
    AI_LIMITS.contextCharacters,
  )
  expect(() => JSON.parse(JSON.stringify(expanded))).not.toThrow()
})

test('NON06 oversized metadata is truncated by serialized JSON budget, not by slicing JSON text', async () => {
  const data = catalog(
    Array.from({ length: 8 }, (_, i) => relation(`table_${i}`)),
  )
  const initial = await buildAiContext(
    'postgres',
    selectAiRelations(data, '', ''),
    async () =>
      Array.from({ length: AI_LIMITS.columnsPerRelation }, (_, i) => ({
        name: `c_${i}_${'X'.repeat(240)}`,
        dataTypeName: 'T'.repeat(240),
      })),
  )
  const json = JSON.stringify(initial)
  expect(json.length).toBeLessThanOrEqual(AI_LIMITS.initialContextCharacters)
  expect(JSON.parse(json)).toEqual(initial)
  expect(
    initial.relations.every(
      (item) => item.columns.length <= AI_LIMITS.columnsPerRelation,
    ),
  ).toBe(true)
  expect(
    initial.relations.flatMap((item) => item.columns).length,
  ).toBeLessThanOrEqual(AI_LIMITS.initialColumns)
})

test('NON06 zero remaining slots and duplicates never request more column metadata', async () => {
  const disclosed = Array.from({ length: AI_LIMITS.relations }, (_, i) => ({
    schema: 'public',
    name: `already_${i}`,
    kind: 'table' as const,
    columns: [],
  }))
  const data = catalog([
    relation('devices'),
    relation('devices'),
    relation('private_orders', 'pg_catalog'),
  ])
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
    {
      name: 'pg_catalog',
      isSystem: true,
      relations: [relation('secret_table', 'pg_catalog')],
    },
  ]
  expect(expandAiRelations(data, ['missing'], '', [])).toEqual([])
  expect(expandAiRelations(data, ['secret_table'], '', [])).toEqual([])
  expect(
    expandAiRelations(data, ['devices'], '', [
      { schema: 'public', name: 'devices' },
    ]),
  ).toEqual([])
})

test('NON06 duplicate SQL references consume only one initial relation slot', () => {
  const duplicated = relation('orders')
  const data = catalog([
    duplicated,
    { ...duplicated },
    ...Array.from({ length: 9 }, (_, i) => relation(`other_${i}`)),
  ])
  const selected = selectAiRelations(data, '', 'select * from orders')
  expect(selected.map((item) => item.qualifiedName)).toEqual([
    'public.orders',
    'public.other_0',
    'public.other_1',
    'public.other_2',
    'public.other_3',
    'public.other_4',
  ])
})

test('NON06 duplicate fallback and discovery records preserve unique budgets and catalog order', () => {
  const relations = Array.from({ length: 12 }, (_, i) =>
    relation(`device_${String(i).padStart(2, '0')}`),
  )
  const data = catalog(relations.flatMap((item) => [item, { ...item }]))
  const initial = selectAiRelations(data, '', '')
  expect(initial.map((item) => item.name)).toEqual(
    relations.slice(0, AI_LIMITS.initialRelations).map((item) => item.name),
  )
  const expanded = expandAiRelations(data, ['device'], '', initial)
  expect(expanded.map((item) => item.name)).toEqual(['device_06', 'device_07'])
  const context = withAiRelationCatalog(
    { language: { kind: 'sql', dialect: 'postgres' }, relations: [] },
    data,
    '',
    '',
  )
  expect(context.availableRelations).toEqual(
    relations.map(({ schema, name }) => ({ schema, name })),
  )
})

test('NON06 duplicate referenced metadata cannot inflate the initial budget or displace prompt matches', () => {
  const orders = relation('orders')
  const data = catalog([
    ...Array.from({ length: 12 }, () => ({ ...orders })),
    relation('customers'),
    ...Array.from({ length: 12 }, (_, i) => relation(`other_${i}`)),
  ])
  const selected = selectAiRelations(data, 'customers', 'select * from orders')
  expect(selected).toHaveLength(AI_LIMITS.initialRelations)
  expect(selected.slice(0, 2).map((item) => item.name)).toEqual([
    'orders',
    'customers',
  ])
  const query = [
    'orders',
    'customers',
    ...Array.from({ length: 12 }, (_, i) => `other_${i}`),
  ].join(' ')
  const full = selectAiRelations(data, 'customers', query)
  expect(full).toHaveLength(AI_LIMITS.relations)
  expect(new Set(full.map((item) => item.qualifiedName)).size).toBe(
    AI_LIMITS.relations,
  )
})

test('NON06 malformed or ineligible relation records cannot consume selected slots', () => {
  const malformed = [
    null,
    {},
    { ...relation('bad'), name: 42 },
    { ...relation('bad'), schema: null },
    { ...relation('bad'), qualifiedName: undefined },
    relation(''),
    { ...relation('bad'), kind: 'unsupported' },
  ] as unknown as DatabaseRelationNode[]
  const data = catalog([
    ...malformed,
    relation('orders'),
    relation('orders'),
    relation('hidden', 'pg_catalog'),
  ])
  expect(
    selectAiRelations(data, 'orders', '').map((item) => item.qualifiedName),
  ).toEqual(['public.orders'])
  expect(
    expandAiRelations(data, ['orders'], '', []).map(
      (item) => item.qualifiedName,
    ),
  ).toEqual(['public.orders'])
})
