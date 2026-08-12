import assert from 'node:assert/strict'
import test from 'node:test'
import type { BigQueryProfile } from '../../shared/types.ts'
import { BigQueryAdapter, __testing, normalizeBigQueryValue, type BigQueryClientLike } from './bigquery-adapter.ts'
import { BigQueryDate, BigQueryDatetime, BigQueryInt, BigQueryTime, BigQueryTimestamp, Geography } from '@google-cloud/bigquery'

const profile: BigQueryProfile = { kind: 'bigquery', version: 1, id: 'bq', name: 'BQ', billingProject: 'billing', defaultProject: 'data', defaultDataset: 'analytics', location: 'US', maximumBytesBilled: '1073741824', readonly: true }

test('advertises Builder without unsupported explain, analyze, or cancellation', () => {
  assert.deepEqual(__testing.capabilities, { builder: true, explain: false, analyze: false, queryCancellation: false, parameterizedQueries: true, costEstimate: true, serverReadOnly: false, schemaAutocomplete: true })
})

function client(statementType = 'SELECT', rows: any[] = [{ exact: new BigQueryInt('9007199254740993') }], pageToken?: string) {
  const calls: Record<string, unknown>[] = []
  let dryRunGetMetadataCalls = 0
  const value: BigQueryClientLike = {
    async getDatasets() { return [[{ id: 'analytics' }, { id: 'events' }, { id: 'finance' }]] },
    dataset() { return { async getTables() { return [[]] }, table() { return { async getMetadata() { return [{ schema: { fields: [] } }] } } } } },
    async createQueryJob(options) {
      calls.push(options)
      const metadata = options.dryRun
        ? { statistics: { query: { statementType, totalBytesProcessed: '12' } } }
        : { statistics: { query: { totalBytesProcessed: '12', cacheHit: false } } }
      if (options.dryRun) return [{ metadata, async getMetadata() { dryRunGetMetadataCalls++; throw new Error('dry-run metadata must be read inline') } }]
      return [{ metadata, async getMetadata() { return [metadata] }, async getQueryResults() { return [rows, pageToken ? { pageToken } : null, { schema: { fields: [{ name: 'exact', type: 'NUMERIC' }] }, pageToken }] } }]
    }
  }
  return { value, calls, dryRunGetMetadataCalls: () => dryRunGetMetadataCalls }
}

test('constructs an ADC client with only the billing project', async () => {
  let options: unknown
  const fake = client()
  const adapter = new BigQueryAdapter((received) => { options = received; return fake.value })
  assert.equal((await adapter.test(profile)).ok, true)
  assert.deepEqual(options, { projectId: 'billing' })
  assert.equal(JSON.stringify(options).includes('credential'), false)
})

test('dry-runs SELECT, applies positional params and maximum bytes, and preserves exact values', async () => {
  const fake = client(); const connected = await new BigQueryAdapter(() => fake.value).connect(profile)
  assert.equal(connected.result.ok, true)
  const result = await connected.session!.query({ sql: 'SELECT ?', parameters: ['x'] })
  assert.deepEqual(fake.calls.map((call) => ({ dryRun: call.dryRun, params: call.params, maximumBytesBilled: call.maximumBytesBilled, useLegacySql: call.useLegacySql })), [
    { dryRun: true, params: ['x'], maximumBytesBilled: '1073741824', useLegacySql: false },
    { dryRun: undefined, params: ['x'], maximumBytesBilled: '1073741824', useLegacySql: false }
  ])
  assert.equal(result.rows[0].exact, '9007199254740993')
  assert.deepEqual(result.columns.map((column) => [column.name, column.nativeType]), [['exact', 'NUMERIC']])
  assert.equal(result.execution?.provider, 'bigquery')
  assert.equal(fake.dryRunGetMetadataCalls(), 0)
})

test('estimates from inline dry-run metadata without fetching persisted job metadata', async () => {
  const fake = client(); const connected = await new BigQueryAdapter(() => fake.value).connect(profile)
  assert.deepEqual(await connected.session!.estimateQuery?.('SELECT 1'), { bytesProcessed: 12 })
  assert.equal(fake.dryRunGetMetadataCalls(), 0)
  assert.deepEqual(fake.calls.at(-1), { query: 'SELECT 1', dryRun: true, useLegacySql: false, location: 'US', maximumBytesBilled: '1073741824' })
})

test('omits location from query jobs without an explicit override', async () => {
  const fake = client(); const connected = await new BigQueryAdapter(() => fake.value).connect({ ...profile, location: undefined })
  await connected.session!.estimateQuery?.('SELECT 1')
  assert.equal(Object.hasOwn(fake.calls.at(-1)!, 'location'), false)
})

test('uses the effective data project and always exposes every visible dataset', async () => {
  for (const candidate of [profile, { ...profile, defaultDataset: undefined }, { ...profile, defaultProject: undefined, defaultDataset: undefined }]) {
    const fake = client(); const connected = await new BigQueryAdapter(() => fake.value).connect(candidate)
    const projectId = candidate.defaultProject || candidate.billingProject
    assert.deepEqual(await connected.session!.listNamespaces(), [
      { name: `${projectId}.analytics` }, { name: `${projectId}.events` }, { name: `${projectId}.finance` }
    ])
  }
  assert.equal(__testing.effectiveDataProject({ ...profile, defaultProject: '  ' }), 'billing')
})

test('passes defaultDataset to query jobs only when selected', async () => {
  const selected = client(); const selectedSession = await new BigQueryAdapter(() => selected.value).connect(profile)
  await selectedSession.session!.query({ sql: 'SELECT 1' })
  assert.deepEqual(selected.calls.at(-1)?.defaultDataset, { projectId: 'data', datasetId: 'analytics' })

  const all = client(); const allSession = await new BigQueryAdapter(() => all.value).connect({ ...profile, defaultDataset: undefined })
  await allSession.session!.query({ sql: 'SELECT 1' })
  assert.equal(Object.hasOwn(all.calls.at(-1)!, 'defaultDataset'), false)
})

function relationClient(datasetTables: Record<string, Array<{ id: string; type?: string }>>, hooks?: { start?: (dataset: string) => void; finish?: (dataset: string) => void; list?: (options?: Record<string, unknown>) => void }): BigQueryClientLike {
  return {
    async getDatasets(options) {
      if (options?.maxResults === 1) return [[]]
      hooks?.list?.(options)
      return [Object.keys(datasetTables).map((id) => ({ id }))]
    },
    dataset(datasetId, _options) {
      return {
        async getTables() {
          hooks?.start?.(datasetId)
          await new Promise((resolve) => setTimeout(resolve, 2))
          hooks?.finish?.(datasetId)
          return [datasetTables[datasetId].map(({ id, type = 'TABLE' }) => ({ id, async getMetadata() { return [{ type }] } }))]
        },
        table() { return { async getMetadata() { return [{ schema: { fields: [] } }] } } }
      }
    },
    async createQueryJob() { throw new Error('not used') }
  }
}

test('listRelations without a namespace flattens every dataset regardless of the default', async () => {
  const datasets = { empty: [], dataset_b: [{ id: 'events', type: 'VIEW' }], dataset_a: [{ id: 'zebra' }, { id: 'events' }] }
  for (const defaultDataset of [undefined, 'dataset_a']) {
    const connected = await new BigQueryAdapter(() => relationClient(datasets)).connect({ ...profile, defaultDataset })
    assert.deepEqual(await connected.session!.listRelations(), [
      { namespace: 'data.dataset_a', name: 'events', kind: 'table' },
      { namespace: 'data.dataset_a', name: 'zebra', kind: 'table' },
      { namespace: 'data.dataset_b', name: 'events', kind: 'view' }
    ])
  }
})

test('tree enumeration excludes hidden anonymous datasets by omitting the all flag', async () => {
  const requests: Array<Record<string, unknown> | undefined> = []
  const connected = await new BigQueryAdapter(() => relationClient({ analytics: [] }, { list: (options) => requests.push(options) })).connect({ ...profile, defaultDataset: undefined })
  await connected.session!.listRelations()
  assert.deepEqual(requests, [{ projectId: 'data' }])
  assert.equal(Object.hasOwn(requests[0]!, 'all'), false)
})

test('a qualified namespace queries only that namespace project and dataset', async () => {
  const requested: Array<{ datasetId: string; projectId: unknown }> = []
  const base = relationClient({ dataset_a: [{ id: 'events' }], dataset_b: [{ id: 'other' }] })
  const connected = await new BigQueryAdapter(() => ({
    ...base,
    dataset(datasetId, options) { requested.push({ datasetId, projectId: options?.projectId }); return base.dataset(datasetId, options) }
  })).connect(profile)
  requested.length = 0
  assert.deepEqual(await connected.session!.listRelations({ name: 'other-project.dataset_a' }), [
    { namespace: 'other-project.dataset_a', name: 'events', kind: 'table' }
  ])
  assert.deepEqual(requested, [{ datasetId: 'dataset_a', projectId: 'other-project' }])
})

test('all-dataset relation enumeration uses bounded concurrency', async () => {
  const datasets = Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`dataset_${index}`, [{ id: 'events' }]]))
  let active = 0; let peak = 0
  const connected = await new BigQueryAdapter(() => relationClient(datasets, {
    start() { active++; peak = Math.max(peak, active) }, finish() { active-- }
  })).connect({ ...profile, defaultDataset: undefined })
  assert.equal((await connected.session!.listRelations()).length, 17)
  assert.ok(peak > 1)
  assert.ok(peak <= __testing.DATASET_RELATION_CONCURRENCY)
})

test('rejects non-SELECT dry-run statement types before execution', async () => {
  const fake = client('INSERT'); const connected = await new BigQueryAdapter(() => fake.value).connect(profile)
  await assert.rejects(() => connected.session!.query({ sql: 'INSERT INTO x VALUES (1)' }), /only one SELECT/)
  assert.equal(fake.calls.length, 1)
})

test('caps renderer-bound rows and reports truncation', async () => {
  const fake = client('SELECT', Array.from({ length: __testing.ROW_LIMIT + 1 }, (_, n) => ({ n })))
  const connected = await new BigQueryAdapter(() => fake.value).connect(profile)
  const result = await connected.session!.query({ sql: 'SELECT n FROM t' })
  assert.equal(result.rows.length, 10_000); assert.equal(result.execution?.truncated, true)
})

test('reports truncation when BigQuery returns a next page below the local row cap', async () => {
  const fake = client('SELECT', [{ exact: 1 }], 'next-page')
  const connected = await new BigQueryAdapter(() => fake.value).connect(profile)
  const result = await connected.session!.query({ sql: 'SELECT exact FROM t' })
  assert.equal(result.rows.length, 1); assert.equal(result.execution?.truncated, true)
})

test('normalizes IPC-unsafe nested values', () => {
  assert.deepEqual(normalizeBigQueryValue({ bytes: Buffer.from('ok'), list: [1n, null], record: { value: 123 }, nested: { value: { x: 2n } } }), { bytes: 'b2s=', list: ['1', null], record: { value: 123 }, nested: { value: { x: '2' } } })
})

test('unwraps only concrete BigQuery scalar wrapper instances', () => {
  assert.deepEqual(normalizeBigQueryValue({
    integer: new BigQueryInt('9007199254740993'), date: new BigQueryDate('2026-01-02'),
    datetime: new BigQueryDatetime('2026-01-02T03:04:05'), time: new BigQueryTime('03:04:05'),
    timestamp: new BigQueryTimestamp('2026-01-02T03:04:05Z'), geography: new Geography('POINT(1 2)')
  }), { integer: '9007199254740993', date: '2026-01-02', datetime: '2026-01-02T03:04:05', time: '03:04:05', timestamp: '2026-01-02T03:04:05.000Z', geography: 'POINT(1 2)' })
})

test('returns actionable provider errors', async () => {
  for (const [error, expected] of [[{ code: 401, message: 'bad credentials' }, /Application Default Credentials/], [{ code: 403, message: 'denied', errors: [{ reason: 'accessDenied' }] }, /permission denied/], [{ code: 403, message: 'API has not been used and is disabled' }, /API is disabled/], [{ message: 'Dataset is in location EU, not US' }, /location mismatch/]] as const) {
    const adapter = new BigQueryAdapter(() => ({ ...client().value, async getDatasets() { throw error } }))
    const result = await adapter.test(profile); assert.equal(result.ok, false); if (!result.ok) assert.match(result.error, expected)
  }
})
