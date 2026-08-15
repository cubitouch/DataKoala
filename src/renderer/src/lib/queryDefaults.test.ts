import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultQueryModeForDatasource, defaultQueryTextForDatasource } from './queryDefaults.ts'

test('datasource defaults keep manual languages separate and prefer Builder when supported', () => {
  assert.equal(defaultQueryModeForDatasource('postgres'), 'builder')
  assert.equal(defaultQueryModeForDatasource('prometheus'), 'builder')
  assert.equal(defaultQueryModeForDatasource(undefined, false), 'sql')
  assert.equal(defaultQueryTextForDatasource('postgres'), 'select now();')
  assert.equal(defaultQueryTextForDatasource('prometheus'), 'up')
})
