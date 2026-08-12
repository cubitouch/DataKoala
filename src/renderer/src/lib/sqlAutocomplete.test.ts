import assert from 'node:assert/strict'
import test from 'node:test'
import { sqlDialectForSourceKind, type DatabaseSchemaNode } from '../../../shared/types.ts'
import { buildSqlCompletionSchema } from './sqlCompletionSchema.ts'
import { codeMirrorDialect, DuckDBDialect, formatterDialect } from './sqlDialect.ts'
import { quoteSqlIdentifier, resolveQuerySources } from './sqlAliasCompletion.ts'
import { PostgreSQL, StandardSQL } from '@codemirror/lang-sql'

const schemas: DatabaseSchemaNode[] = [{
  name: 'public', isSystem: false, relations: [
    { schema: 'public', name: 'orders', kind: 'r', qualifiedName: 'public.orders', columnsStatus: 'loaded', columns: [{ name: 'id', dataTypeName: 'integer' }, { name: 'created_at', dataTypeName: 'timestamp' }] },
    { schema: 'public', name: 'customers', kind: 'v', qualifiedName: 'public.customers', columnsStatus: 'idle' }
  ]
}]

test('source kinds share one dialect mapping', () => {
  assert.equal(sqlDialectForSourceKind('postgres'), 'postgres')
  assert.equal(sqlDialectForSourceKind('bigquery'), 'google-sql')
  assert.equal(sqlDialectForSourceKind('local-files'), 'duckdb')
  assert.equal(sqlDialectForSourceKind('sqlite-file'), 'duckdb')
  assert.equal(codeMirrorDialect('postgres'), PostgreSQL)
  assert.equal(codeMirrorDialect('google-sql'), StandardSQL)
  assert.equal(codeMirrorDialect('duckdb'), DuckDBDialect)
  assert.equal(formatterDialect('duckdb'), 'duckdb')
  assert.match(DuckDBDialect.spec.keywords ?? '', /\bpivot\b/)
  assert.match(DuckDBDialect.spec.types ?? '', /\bhugeint\b/)
  assert.match(DuckDBDialect.spec.keywords ?? '', /\bselect\b/)
})

test('completion schema retains unloaded relations and cached columns', () => {
  assert.deepEqual(buildSqlCompletionSchema(schemas, 'postgres').schema, { public: { orders: ['id', 'created_at'], customers: [] } })
  const local = buildSqlCompletionSchema([{ ...schemas[0], name: 'main' }], 'duckdb')
  assert.equal(local.defaultSchema, 'main')
  assert.deepEqual(buildSqlCompletionSchema([{ ...schemas[0], name: 'sqlite' }], 'duckdb').schema, { sqlite: { orders: ['id', 'created_at'], customers: [] } })
})

test('BigQuery project.dataset namespaces are nested without merging duplicate tables', () => {
  const input = [
    { ...schemas[0], name: 'my-project.analytics' },
    { ...schemas[0], name: 'my-project.reporting' }
  ]
  assert.deepEqual(buildSqlCompletionSchema(input, 'google-sql').schema, {
    'my-project': {
      analytics: { orders: ['id', 'created_at'], customers: [] },
      reporting: { orders: ['id', 'created_at'], customers: [] }
    }
  })
})

test('conservative relation resolution supports aliases and cached state', () => {
  const found = resolveQuerySources('SELECT o. FROM public.orders AS o JOIN public.customers c ON c.id=o.id', schemas)
  assert.deepEqual(found.map(({ alias, relation }) => [alias, relation.name, relation.columnsStatus]), [['o', 'orders', 'loaded'], ['c', 'customers', 'idle']])
  assert.equal(resolveQuerySources('SELECT created_at FROM public.orders WHERE id = 1', schemas)[0].alias, undefined)
})

test('completion application quotes sensitive identifiers for each dialect', () => {
  assert.equal(quoteSqlIdentifier('created_at', 'postgres'), 'created_at')
  assert.equal(quoteSqlIdentifier('Order Items', 'postgres'), '"Order Items"')
  assert.equal(quoteSqlIdentifier('Événement', 'duckdb'), '"Événement"')
  assert.equal(quoteSqlIdentifier('select', 'postgres'), '"select"')
  assert.equal(quoteSqlIdentifier('Order Items', 'google-sql'), '`Order Items`')
})
