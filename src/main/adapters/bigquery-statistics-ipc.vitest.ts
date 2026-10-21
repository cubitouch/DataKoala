import { afterEach, expect, it, vi } from 'vitest'
import { BigQueryAdapter, type BigQueryClientLike } from './bigquery-adapter.ts'
import { toIpcSafeQueryResult } from '../ipc-serialization.ts'
import type { BigQueryProfile } from '../../shared/types.ts'
afterEach(() => vi.unstubAllGlobals())
it('executes adapter → production serialization → modeled IPC envelope → renderer API without extra jobs', async () => {
  const profile: BigQueryProfile = {
    kind: 'bigquery',
    version: 1,
    id: 'stats',
    name: 'Stats',
    billingProject: 'synthetic',
    maximumBytesBilled: '',
    readonly: true,
  }
  const createQueryJob = vi.fn(async (options: Record<string, unknown>) =>
    options.dryRun
      ? [
          {
            metadata: {
              statistics: {
                query: { statementType: 'SELECT', totalBytesProcessed: '999' },
              },
            },
          },
        ]
      : [
          {
            getQueryResults: async () => [
              [{ value: 1 }],
              null,
              {
                schema: { fields: [{ name: 'value', type: 'INT64' }] },
                totalRows: '1',
              },
            ],
            getMetadata: async () => [
              {
                statistics: {
                  startTime: '100',
                  endTime: '105',
                  query: {
                    totalBytesProcessed: '0',
                    totalBytesBilled: '0',
                    totalSlotMs: '0',
                    cacheHit: false,
                  },
                },
              },
            ],
          },
        ],
  )
  const { session } = await new BigQueryAdapter(
    () =>
      ({
        getDatasets: async () => [[]],
        createQueryJob,
      }) as unknown as BigQueryClientLike,
  ).connect(profile)
  const run = vi.fn(async () => ({
    ok: true,
    result: toIpcSafeQueryResult(
      await session!.query({ sql: 'SELECT 1 AS value' }),
    ),
  }))
  // This stub models the IPC envelope. Native transport has a separate audit fixture.
  vi.stubGlobal('window', { datakoala: { query: { run } } })
  const { api } = await import('../../renderer/src/lib/api.ts')
  const result = await api.query.run(profile.id, 'SELECT 1 AS value')
  expect(result.execution).toMatchObject({
    bytesProcessed: 0,
    bytesBilled: 0,
    slotMs: 0,
    cacheHit: false,
    providerDurationMs: 5,
    totalRows: 1,
    statisticsScope: 'job',
  })
  expect(createQueryJob).toHaveBeenCalledTimes(2)
  expect(run).toHaveBeenCalledOnce()
})
