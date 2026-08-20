import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultQueryModeForDatasource, defaultQueryTextForDatasource, queryLanguageForDatasource } from './queryDefaults.ts'

test('datasource defaults keep manual languages separate and prefer Builder when supported', () => {
  assert.equal(defaultQueryModeForDatasource('postgres'), 'builder')
  assert.equal(defaultQueryModeForDatasource('prometheus'), 'builder')
  assert.equal(defaultQueryModeForDatasource('tempo'), 'builder')
  assert.equal(defaultQueryModeForDatasource(undefined, false), 'sql')
  assert.equal(defaultQueryTextForDatasource('postgres'), 'select now();')
  assert.equal(defaultQueryTextForDatasource('prometheus'), 'up')
  assert.equal(defaultQueryTextForDatasource('tempo'), '{ duration > 100ms }')
})

test('datasource query languages distinguish SQL, PromQL and TraceQL', () => {
  assert.equal(queryLanguageForDatasource('postgres'), 'sql')
  assert.equal(queryLanguageForDatasource('sqlite'), 'sql')
  assert.equal(queryLanguageForDatasource('bigquery'), 'sql')
  assert.equal(queryLanguageForDatasource('prometheus'), 'promql')
  assert.equal(queryLanguageForDatasource('tempo'), 'traceql')
})
