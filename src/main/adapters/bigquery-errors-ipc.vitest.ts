import { afterEach, expect, it, vi } from 'vitest'
import { BigQueryAdapter, type BigQueryClientLike } from './bigquery-adapter.ts'
import { queryFailureKind, queryFailureMessage } from '../query-failure.ts'
import type { BigQueryProfile } from '../../shared/types.ts'

const profile: BigQueryProfile = {
  kind: 'bigquery',
  version: 1,
  id: 'demo',
  name: 'Demo',
  billingProject: 'demo-billing',
  defaultProject: 'demo-data',
  maximumBytesBilled: '',
  readonly: true,
}
afterEach(() => vi.unstubAllGlobals())

it.each([
  {
    failure: { code: '401', response: { data: { error: 'invalid_grant' } } },
    kind: 'connection',
    expected: /expired or was revoked/,
  },
  {
    failure: {
      code: 403,
      errors: [{ reason: 'accessDenied' }],
      message: 'Dataset demo:analytics access denied',
    },
    kind: 'connection',
    expected: /dataset read permissions/,
  },
  {
    failure: {
      code: 400,
      errors: [{ reason: 'invalidQuery' }],
      message: 'Unrecognized name: credential at [1:8]',
    },
    kind: 'query',
    expected: /Unrecognized name: credential/,
  },
])(
  'adapter failure crosses clone-safe IPC envelope and renderer API as $kind',
  async ({ failure, kind, expected }) => {
    vi.resetModules()
    const adapter = new BigQueryAdapter(
      () =>
        ({
          getDatasets: async () => [[]],
          createQueryJob: async () => {
            throw failure
          },
        }) as unknown as BigQueryClientLike,
    )
    const connected = await adapter.connect(profile)
    expect(connected.result.ok).toBe(true)
    // Use the same failure serialization functions as main's unchanged QUERY_RUN
    // handler. structuredClone models IPC serialization, not a native Electron run.
    const run = vi.fn(async () => {
      try {
        return {
          ok: true,
          result: await connected.session!.query({ sql: 'SELECT missing' }),
        }
      } catch (error) {
        return structuredClone({
          ok: false,
          kind: queryFailureKind(error),
          message: queryFailureMessage(error),
        })
      }
    })
    vi.stubGlobal('window', { datakoala: { query: { run } } })
    const { api } = await import('../../renderer/src/lib/api.ts')
    await expect(
      api.query.run(profile.id, 'SELECT missing'),
    ).rejects.toMatchObject({ kind, message: expect.stringMatching(expected) })
    expect(run).toHaveBeenCalledTimes(1)
  },
)
