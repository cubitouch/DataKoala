import assert from 'node:assert/strict'
import { test } from 'vitest'
import { sqlDialectForSourceKind, type DatabaseSchemaNode } from '../../../shared/types.ts'
import { buildSqlCompletionSchema } from './sqlCompletionSchema.ts'
import { codeMirrorDialect, DuckDBDialect, formatterDialect, GoogleSQLDialect } from './sqlDialect.ts'
import { quoteSqlIdentifier, resolveQuerySources, sqlAliasCompletionSource } from './sqlAliasCompletion.ts'
import { PostgreSQL, schemaCompletionSource } from '@codemirror/lang-sql'
import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'

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
  assert.equal(codeMirrorDialect('google-sql'), GoogleSQLDialect)
  assert.equal(GoogleSQLDialect.spec.identifierQuotes, '`')
  assert.equal(codeMirrorDialect('duckdb'), DuckDBDialect)
  assert.equal(formatterDialect('duckdb'), 'duckdb')
  assert.match(DuckDBDialect.spec.keywords ?? '', /\bpivot\b/)
  assert.match(DuckDBDialect.spec.types ?? '', /\bhugeint\b/)
  assert.match(DuckDBDialect.spec.keywords ?? '', /\bselect\b/)
})

test('completion schema retains relations but delegates all columns to contextual completion', () => {
  assert.deepEqual(buildSqlCompletionSchema(schemas, 'postgres').schema, { public: { orders: [], customers: [] } })
  const local = buildSqlCompletionSchema([{ ...schemas[0], name: 'main' }], 'duckdb')
  assert.equal(local.defaultSchema, 'main')
  assert.deepEqual(buildSqlCompletionSchema([{ ...schemas[0], name: 'sqlite' }], 'duckdb').schema, { sqlite: { orders: [], customers: [] } })
})

test('BigQuery project.dataset namespaces are nested without merging duplicate tables', () => {
  const input = [
    { ...schemas[0], name: 'my-project.analytics' },
    { ...schemas[0], name: 'my-project.reporting' }
  ]
  assert.deepEqual(buildSqlCompletionSchema(input, 'google-sql').schema, {
    'my-project': {
      analytics: { orders: [], customers: [] },
      reporting: { orders: [], customers: [] }
    }
  })
})

async function schemaOptions(doc: string, schema: ReturnType<typeof buildSqlCompletionSchema>['schema']) {
  const state = EditorState.create({ doc })
  return schemaCompletionSource({ dialect: GoogleSQLDialect, schema })(new CompletionContext(state, doc.length, true))
}

test('GoogleSQL built-in schema completion never applies ANSI double quotes', async () => {
  const projects = await schemaOptions('SELECT * FROM ', { 'analytics-prod': [] })
  const project = projects?.options.find((option) => option.label === 'analytics-prod')
  assert.equal(project?.apply, '`analytics-prod`')
  assert.doesNotMatch(String(project?.apply), /"/)

  const datasets = await schemaOptions('SELECT * FROM ', { analytics: [] })
  assert.equal(datasets?.options.find((option) => option.label === 'analytics')?.apply, undefined)
  const tables = await schemaOptions('SELECT * FROM ', { events: [], 'Order Events': [] })
  assert.equal(tables?.options.find((option) => option.label === 'events')?.apply, undefined)
  assert.equal(tables?.options.find((option) => option.label === 'Order Events')?.apply, '`Order Events`')
  assert.equal(tables?.options.some((option) => String(option.apply).includes('"')), false)
})

test('conservative relation resolution supports aliases and cached state', () => {
  const found = resolveQuerySources('SELECT o. FROM public.orders AS o JOIN public.customers c ON c.id=o.id', schemas)
  assert.deepEqual(found.map(({ alias, relation }) => [alias, relation.name, relation.columnsStatus]), [['o', 'orders', 'loaded'], ['c', 'customers', 'idle']])
  assert.equal(resolveQuerySources('SELECT created_at FROM public.orders WHERE id = 1', schemas)[0].alias, undefined)
  for (const tail of ['LEFT JOIN public.customers c ON true', 'INNER JOIN public.customers c ON true', 'WHERE id=1', 'ORDER BY id']) {
    assert.equal(resolveQuerySources(`SELECT * FROM public.orders ${tail}`, schemas)[0].alias, undefined, tail)
  }
})

test('completion application quotes sensitive identifiers for each dialect', () => {
  assert.equal(quoteSqlIdentifier('created_at', 'postgres'), 'created_at')
  assert.equal(quoteSqlIdentifier('Order Items', 'postgres'), '"Order Items"')
  assert.equal(quoteSqlIdentifier('Événement', 'duckdb'), '"Événement"')
  assert.equal(quoteSqlIdentifier('select', 'postgres'), '"select"')
  assert.equal(quoteSqlIdentifier('Order Items', 'google-sql'), '`Order Items`')
})

test('contextual completion is the single typed column provider', async () => {
  const sql = 'SELECT o. FROM public.orders o'
  const state = EditorState.create({ doc: sql, selection: { anchor: 'SELECT o.'.length } })
  const result = await sqlAliasCompletionSource(schemas, 'postgres')(new CompletionContext(state, state.selection.main.head, true))
  assert.deepEqual(result?.options.map((option) => option.label), ['id', 'created_at'])
  assert.equal(result?.options.filter((option) => option.label === 'id').length, 1)
  assert.equal(result?.options[0].detail, 'column · integer')
})

test('alias dot loads only its uniquely resolved unloaded relation', async () => {
  const sql = 'SELECT c. FROM public.orders o JOIN public.customers c ON true'
  const state = EditorState.create({ doc: sql, selection: { anchor: 'SELECT c.'.length } })
  let loaded = ''
  const result = await sqlAliasCompletionSource(schemas, 'postgres', async (relation) => {
    loaded = relation.qualifiedName
    return [{ name: 'name', dataTypeName: 'text' }]
  })(new CompletionContext(state, state.selection.main.head, false))
  assert.equal(loaded, 'public.customers')
  assert.equal(result?.options[0].detail, 'column · text')
})
