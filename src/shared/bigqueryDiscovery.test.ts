import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBigQueryReference } from './bigqueryDiscovery.ts'

test('parses supported BigQuery reference forms', () => {
  for (const [input, expected] of [
    ['project.dataset', { projectId: 'project', datasetId: 'dataset' }],
    ['project.dataset.table', { projectId: 'project', datasetId: 'dataset', tableId: 'table' }],
    ['project:dataset', { projectId: 'project', datasetId: 'dataset' }],
    ['project:dataset.table', { projectId: 'project', datasetId: 'dataset', tableId: 'table' }],
    ['`project.dataset.table`', { projectId: 'project', datasetId: 'dataset', tableId: 'table' }],
    ['projects/project/datasets/dataset', { projectId: 'project', datasetId: 'dataset' }],
    ['projects/project/datasets/dataset/tables/table', { projectId: 'project', datasetId: 'dataset', tableId: 'table' }]
  ] as const) assert.deepEqual(parseBigQueryReference(input), expected)
})

test('rejects malformed BigQuery references', () => {
  for (const input of ['', 'project', 'project..table', 'https://example.test', '`unterminated.dataset']) assert.equal(parseBigQueryReference(input), null)
})
