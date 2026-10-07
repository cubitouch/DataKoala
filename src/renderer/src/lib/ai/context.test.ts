import { expect, test } from 'vitest'
import {
  appendAiContext,
  buildAiContext,
  expandAiRelations,
  selectAiRelations,
} from './context'
import { AI_LIMITS } from '@shared/ai'
import type { DatabaseRelationNode, DatabaseSchemaNode } from '@shared/types'

const relation = (name: string, schema = 'public'): DatabaseRelationNode => ({
  name,
  schema,
  qualifiedName: `${schema}.${name}`,
  kind: 'r',
  columnsStatus: 'loaded',
  columns: [{ name: 'id', dataTypeName: 'uuid' }],
})
const schemas = (relations: DatabaseRelationNode[]): DatabaseSchemaNode[] => [
  { name: 'public', isSystem: false, relations },
]

test('relation selection ranks prompt and current SQL, excludes system metadata and is deterministic', () => {
  const data = schemas([
    relation('users'),
    relation('orders'),
    relation('pg_class', 'pg_catalog'),
  ])
  expect(selectAiRelations(data, 'orders', '')[0].name).toBe('orders')
  expect(selectAiRelations(data, 'orders', 'select * from users')[0].name).toBe(
    'users',
  )
  expect(selectAiRelations(data, '', '').map((r) => r.name)).toEqual([
    'orders',
    'users',
  ])
  expect(
    selectAiRelations(schemas([...data[0].relations].reverse()), '', ''),
  ).toEqual(selectAiRelations(data, '', ''))
  const columns = relation('orders')
  columns.columns = [{ name: 'revenue', dataTypeName: 'numeric' }]
  expect(
    selectAiRelations(schemas([relation('users'), columns]), 'revenue', '')[0]
      .name,
  ).toBe('orders')
})

test('initial selection reserves discovery slots unless current SQL needs them', () => {
  const data = schemas(
    Array.from({ length: 12 }, (_, i) => relation(`item_${i}`)),
  )
  expect(selectAiRelations(data, 'unmatched', '')).toHaveLength(
    AI_LIMITS.initialRelations,
  )
  const currentQuery = Array.from(
    { length: 8 },
    (_, i) => `select * from item_${i}`,
  ).join('\nunion all\n')
  const referenced = selectAiRelations(data, '', currentQuery)
  expect(referenced).toHaveLength(AI_LIMITS.relations)
  expect(new Set(referenced.map((item) => item.name))).toEqual(
    new Set(Array.from({ length: 8 }, (_, i) => `item_${i}`)),
  )
})

test('initial context reserves column and character headroom for discovery', async () => {
  const data = schemas(
    Array.from({ length: 20 }, (_, i) => relation(`item_${i}`)),
  )
  const selected = selectAiRelations(data, 'item', '')
  expect(selected).toHaveLength(AI_LIMITS.initialRelations)
  const context = await buildAiContext('postgres', selected, async () =>
    Array.from({ length: 60 }, (_, i) => ({
      name: `column_${i}`,
      dataTypeName: 'text',
    })),
  )
  expect(context.language).toEqual({ kind: 'sql', dialect: 'postgres' })
  expect(context.relations[0].columns).toHaveLength(
    AI_LIMITS.columnsPerRelation,
  )
  expect(context.relations.flatMap((r) => r.columns)).toHaveLength(
    AI_LIMITS.initialColumns,
  )
  const huge = await buildAiContext('postgres', selected, async () =>
    Array.from({ length: 60 }, () => ({
      name: 'c'.repeat(256),
      dataTypeName: 't'.repeat(256),
    })),
  )
  expect(JSON.stringify(huge).length).toBeLessThanOrEqual(
    AI_LIMITS.initialContextCharacters,
  )
  const expandedHuge = await appendAiContext(
    huge,
    [relation('devices')],
    async () =>
      Array.from({ length: 10 }, (_, i) => ({
        name: `device_field_${i}`,
        dataTypeName: 'text',
      })),
  )
  expect(
    expandedHuge.relations.find((item) => item.name === 'devices')?.columns
      .length,
  ).toBeGreaterThan(0)
  expect(JSON.stringify(expandedHuge).length).toBeLessThanOrEqual(
    AI_LIMITS.contextCharacters,
  )
})

test('context construction excludes extra credentials and result values and fails on missing columns', async () => {
  const context = await buildAiContext(
    'postgres',
    [
      {
        ...relation('orders'),
        password: 'secret',
        rows: ['private'],
      } as DatabaseRelationNode,
    ],
    async () => [{ name: 'id', dataTypeName: 'uuid', values: ['private'] }],
  )
  expect(JSON.stringify(context)).not.toMatch(
    /secret|private|password|rows|values/,
  )
  await expect(
    buildAiContext('postgres', [relation('orders')], async () => undefined),
  ).rejects.toThrow('Could not load')
})

const multiSchema = (names: string[]): DatabaseSchemaNode[] =>
  names.map((name) => ({
    name,
    isSystem: false,
    relations: [relation('second', name), relation('first', name)],
  }))

test('generic prompts cover eligible schemas and small catalogs without using system schemas', () => {
  const data: DatabaseSchemaNode[] = [
    {
      name: 'public',
      isSystem: false,
      relations: [relation('orders'), relation('customers')],
    },
    {
      name: 'billing',
      isSystem: false,
      relations: [relation('invoices', 'billing')],
    },
    {
      name: 'analytics',
      isSystem: false,
      relations: [relation('events', 'analytics')],
    },
    {
      name: 'pg_catalog',
      isSystem: true,
      relations: [relation('pg_class', 'pg_catalog')],
    },
  ]
  const selected = selectAiRelations(data, 'show an overview', '')
  expect(selected).toHaveLength(4)
  expect(new Set(selected.slice(0, 3).map((r) => r.schema))).toEqual(
    new Set(['analytics', 'billing', 'public']),
  )
  expect(selectAiRelations(data, 'invoice totals', '')[0].qualifiedName).toBe(
    'billing.invoices',
  )
  expect(
    selectAiRelations(data, 'invoice totals', 'select * from public.orders')[0]
      .qualifiedName,
  ).toBe('public.orders')
  expect(selected.some((item) => item.schema === 'pg_catalog')).toBe(false)
})

test('round-robin fallback uses distinct schemas first and remains deterministic', () => {
  const data = multiSchema(Array.from({ length: 12 }, (_, i) => `schema_${i}`))
  const selected = selectAiRelations(data, '', '')
  expect(selected).toHaveLength(AI_LIMITS.initialRelations)
  expect(new Set(selected.map((r) => r.schema)).size).toBe(
    AI_LIMITS.initialRelations,
  )
  expect(
    selectAiRelations(
      [...data]
        .reverse()
        .map((s) => ({ ...s, relations: [...s.relations].reverse() })),
      '',
      '',
    ),
  ).toEqual(selected)
  const smaller = selectAiRelations(data.slice(0, 3), '', '')
  expect(smaller).toHaveLength(6)
  expect(new Set(smaller.slice(0, 3).map((r) => r.schema)).size).toBe(3)
})

test('expansion uses local names and cached columns, keeps current-query priority and excludes disclosed/system relations', () => {
  const events = relation('events')
  events.columns = [{ name: 'device_id', dataTypeName: 'uuid' }]
  const data: DatabaseSchemaNode[] = [
    {
      name: 'public',
      isSystem: false,
      relations: [
        relation('orders'),
        relation('devices'),
        relation('customers'),
        events,
      ],
    },
    {
      name: 'pg_catalog',
      isSystem: true,
      relations: [relation('device_catalog', 'pg_catalog')],
    },
  ]
  const expanded = expandAiRelations(
    data,
    ['device'],
    'select * from customers',
    [{ schema: 'public', name: 'orders' }],
  )
  expect(expanded[0].name).toBe('customers')
  expect(expanded.map((item) => item.name)).toContain('devices')
  expect(expanded.map((item) => item.name)).toContain('events')
  expect(expanded.some((item) => item.schema === 'pg_catalog')).toBe(false)
  expect(
    expandAiRelations(data, ['orders'], '', [
      { schema: 'public', name: 'orders' },
    ]).some((item) => item.name === 'orders'),
  ).toBe(false)
})

test('expansion never exceeds the remaining unique relation budget', () => {
  const data = schemas(
    Array.from({ length: 20 }, (_, i) => relation(`device_${i}`)),
  )
  const disclosed = Array.from({ length: 7 }, (_, i) => ({
    schema: 'public',
    name: `already_${i}`,
  }))
  expect(expandAiRelations(data, ['device'], '', disclosed)).toHaveLength(1)
})

test('wide initial context leaves usable global budget for discovered relation columns', async () => {
  const initialRelations = Array.from({ length: 6 }, (_, i) =>
    relation(`base_${i}`),
  )
  const initial = await buildAiContext('postgres', initialRelations, async () =>
    Array.from({ length: AI_LIMITS.columnsPerRelation }, (_, i) => ({
      name: `wide_column_${i}`,
      dataTypeName: 'text',
    })),
  )
  expect(initial.relations).toHaveLength(AI_LIMITS.initialRelations)
  expect(initial.relations.flatMap((item) => item.columns)).toHaveLength(
    AI_LIMITS.initialColumns,
  )
  expect(JSON.stringify(initial).length).toBeLessThanOrEqual(
    AI_LIMITS.initialContextCharacters,
  )

  const loaded: string[] = []
  const context = await appendAiContext(
    initial,
    [relation('devices'), relation('customers')],
    async (item) => {
      loaded.push(item.name)
      return Array.from({ length: AI_LIMITS.columnsPerRelation }, (_, i) => ({
        name: `${item.name}_field_${i}`,
        dataTypeName: 'text',
      }))
    },
  )

  expect(loaded).toEqual(['devices', 'customers'])
  expect(context.relations).toHaveLength(AI_LIMITS.relations)
  expect(
    context.relations.find((item) => item.name === 'devices')?.columns,
  ).toHaveLength(AI_LIMITS.columnsPerRelation)
  expect(
    context.relations.find((item) => item.name === 'customers')?.columns.length,
  ).toBeGreaterThan(0)
  expect(
    context.relations.flatMap((item) => item.columns).length,
  ).toBeLessThanOrEqual(AI_LIMITS.columns)
  expect(JSON.stringify(context).length).toBeLessThanOrEqual(
    AI_LIMITS.contextCharacters,
  )
})

test.each([['postgres'], ['duckdb'], ['google-sql']] as const)(
  'context construction preserves the %s dialect',
  async (dialect) => {
    const context = await buildAiContext(
      dialect,
      [relation('orders')],
      async () => [{ name: 'revenue', dataTypeName: 'numeric' }],
    )
    expect(context.language).toEqual({ kind: 'sql', dialect })
    expect(context.relations).toEqual([
      {
        schema: 'public',
        name: 'orders',
        kind: 'table',
        columns: [{ name: 'revenue', dataType: 'numeric' }],
      },
    ])
  },
)

test('DuckDB context excludes local source paths and BigQuery preserves project/dataset identity', async () => {
  const local = await buildAiContext(
    'duckdb',
    [
      {
        ...relation('customer_data', 'main'),
        path: '/Users/example/private/customer-data.csv',
      } as DatabaseRelationNode,
    ],
    async () => [{ name: 'customer_id', dataTypeName: 'VARCHAR' }],
  )
  expect(JSON.stringify(local)).not.toContain(
    '/Users/example/private/customer-data.csv',
  )

  const bigquery = await buildAiContext(
    'google-sql',
    [relation('orders', 'my-project.analytics')],
    async () => [{ name: 'revenue', dataTypeName: 'NUMERIC' }],
  )
  expect(bigquery.relations[0]).toMatchObject({
    schema: 'my-project.analytics',
    name: 'orders',
  })
})
