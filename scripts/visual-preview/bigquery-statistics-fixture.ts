/** Offline fixture generation uses the real adapter and production IPC serializer. */
import { writeFile } from 'node:fs/promises'
import {
  BigQueryAdapter,
  type BigQueryClientLike,
} from '../../src/main/adapters/bigquery-adapter.ts'
import { toIpcSafeQueryResult } from '../../src/main/ipc-serialization.ts'
import type { BigQueryProfile } from '../../src/shared/types.ts'
const profile: BigQueryProfile = {
  kind: 'bigquery',
  version: 1,
  id: 'audit-bigquery',
  name: 'Example bigquery',
  billingProject: 'synthetic',
  maximumBytesBilled: '',
  readonly: true,
}
const calls: Record<string, unknown>[] = []
const adapter = new BigQueryAdapter(
  () =>
    ({
      getDatasets: async () => [[]],
      createQueryJob: async (options: Record<string, unknown>) => {
        calls.push(options)
        if (options.dryRun)
          return [
            {
              metadata: {
                statistics: {
                  query: {
                    statementType: 'SCRIPT',
                    totalBytesProcessed: '999999',
                  },
                },
              },
            },
          ]
        return [
          {
            getQueryResults: async () => [
              [{ category: 'A', metric: 1 }, { category: 'B', metric: 2 }, { category: 'C', metric: 3 }],
              { pageToken: 'more' },
              {
                schema: { fields: [{ name: 'category', type: 'STRING' }, { name: 'metric', type: 'INT64' }] },
                totalRows: '12',
              },
            ],
            getMetadata: async () => [
              {
                statistics: {
                  startTime: '100',
                  endTime: '150',
                  query: {
                    statementType: 'SCRIPT',
                    totalBytesProcessed: '0',
                    totalBytesBilled: '2048',
                    totalSlotMs: '300',
                    cacheHit: false,
                  },
                  numChildJobs: '2',
                },
              },
            ],
          },
        ]
      },
    }) as unknown as BigQueryClientLike,
)
const { session } = await adapter.connect(profile)
const result = toIpcSafeQueryResult(
  await session!.query({
    sql: 'DECLARE x INT64 DEFAULT 1; SELECT x AS metric;',
  }),
)
if (calls.length !== 2) throw Error('Unexpected cosmetic provider request')
const output = process.argv[2]
if (!output) throw Error('Output path required')
await writeFile(output, JSON.stringify({ result, calls }))
