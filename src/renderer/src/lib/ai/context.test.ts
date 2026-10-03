import { expect, test } from 'vitest'
import { buildAiContext, selectAiRelations } from './context'
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
test('fallback, relation, per-relation, global column and character budgets are enforced', async () => {
  const data = schemas(
    Array.from({ length: 20 }, (_, i) => relation(`item_${i}`)),
  )
  expect(selectAiRelations(data, 'unmatched', '')).toHaveLength(3)
  const selected = selectAiRelations(data, 'item', '')
  expect(selected).toHaveLength(8)
  const context = await buildAiContext(selected, async () =>
    Array.from({ length: 60 }, (_, i) => ({
      name: `column_${i}`,
      dataTypeName: 'text',
    })),
  )
  expect(context.language).toEqual({ kind: 'sql', dialect: 'postgres' })
  expect(context.relations[0].columns).toHaveLength(40)
  expect(context.relations.flatMap((r) => r.columns)).toHaveLength(200)
  const huge = await buildAiContext(selected, async () =>
    Array.from({ length: 60 }, () => ({
      name: 'c'.repeat(256),
      dataTypeName: 't'.repeat(256),
    })),
  )
  expect(JSON.stringify(huge).length).toBeLessThanOrEqual(24000)
})
test('context construction excludes extra credentials and result values and fails on missing columns', async () => {
  const context = await buildAiContext(
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
    buildAiContext([relation('orders')], async () => undefined),
  ).rejects.toThrow('Could not load')
})
