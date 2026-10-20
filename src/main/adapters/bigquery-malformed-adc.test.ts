import assert from 'node:assert/strict'
import test from 'node:test'
import { GoogleAuth, JWT, UserRefreshClient } from 'google-auth-library'
import { BigQuery } from '@google-cloud/bigquery'
import { BigQueryAdapter, type BigQueryClientLike } from './bigquery-adapter.ts'
import { BigQueryDiscoveryService } from '../bigquery-discovery.ts'
import { friendlyBigQueryError } from '../bigquery-errors.ts'
import { queryFailureKind } from '../query-failure.ts'
import type { BigQueryProfile } from '../../shared/types.ts'

const profile: BigQueryProfile = {
  kind: 'bigquery',
  version: 1,
  id: 'test',
  name: 'Synthetic',
  billingProject: 'test-billing',
  maximumBytesBilled: '',
  readonly: true,
}
// The installed SDK throws locally while loading these synthetic objects, before
// any token refresh, signing, or provider request. No real credentials or network.
const fixtures = [
  { json: { type: 'authorized_user' }, field: 'client_id' },
  {
    json: { type: 'authorized_user', client_id: 'SYNTHETIC' },
    field: 'client_secret',
  },
  {
    json: {
      type: 'authorized_user',
      client_id: 'SYNTHETIC',
      client_secret: 'SYNTHETIC',
    },
    field: 'refresh_token',
  },
  { json: { type: 'service_account' }, field: 'client_email' },
  {
    json: {
      type: 'service_account',
      client_email: 'synthetic@example.invalid',
    },
    field: 'private_key',
  },
  {
    json: { type: 'impersonated_service_account' },
    field: 'source_credentials',
  },
  {
    json: { type: 'impersonated_service_account', source_credentials: {} },
    field: 'service_account_impersonation_url',
  },
]

function sdkFailure(json: object): Error {
  try {
    new GoogleAuth().fromJSON(json)
    assert.fail('fixture must fail local ADC loading')
  } catch (error) {
    assert.ok(error instanceof Error)
    return error
  }
}

for (const { json, field } of fixtures) {
  test(`known SDK ADC loading failure: missing ${field}`, async () => {
    const error = sdkFailure(json)
    assert.match(error.message, new RegExp(`does not contain a ${field} field`))
    assert.match(
      friendlyBigQueryError(error),
      /Application Default Credentials.*JSON.*GOOGLE_APPLICATION_CREDENTIALS.*gcloud auth application-default login/,
    )
    const adapter = new BigQueryAdapter(
      () =>
        ({
          getDatasets: async () => {
            throw sdkFailure(json)
          },
        }) as unknown as BigQueryClientLike,
    )
    const tested = await adapter.test(profile)
    assert.equal(tested.ok, false)
    if (!tested.ok)
      assert.match(tested.error, /Application Default Credentials.*JSON/)

    let calls = 0
    const connected = await new BigQueryAdapter(
      () =>
        ({
          getDatasets: async () => [[]],
          createQueryJob: async () => {
            calls++
            throw sdkFailure(json)
          },
        }) as unknown as BigQueryClientLike,
    ).connect(profile)
    assert.equal(connected.result.ok, true)
    await assert.rejects(
      connected.session!.query({ sql: 'SELECT 1' }),
      (reason) => {
        assert.equal(queryFailureKind(reason), 'connection')
        assert.match(
          (reason as Error).message,
          /Application Default Credentials.*JSON/,
        )
        return true
      },
    )
    assert.equal(calls, 1)

    const discovery = new BigQueryDiscoveryService(() => null as never, {
      getClient: async () => {
        throw sdkFailure(json)
      },
    } as never)
    await assert.rejects(
      discovery.discoverProjects(),
      /Application Default Credentials.*JSON/,
    )
  })
}

test('real SQL errors remain query failures even if they quote an ADC validation message', async () => {
  const message = 'The incoming JSON object does not contain a client_id field.'
  const failure = Object.assign(new Error(message), {
    code: '400',
    errors: [{ reason: 'invalidQuery' }],
  })
  const connected = await new BigQueryAdapter(
    () =>
      ({
        getDatasets: async () => [[]],
        createQueryJob: async () => {
          throw failure
        },
      }) as unknown as BigQueryClientLike,
  ).connect(profile)
  await assert.rejects(
    connected.session!.query({ sql: 'SELECT client_id' }),
    (error) => {
      assert.equal(queryFailureKind(error), 'query')
      assert.equal((error as Error).message, message)
      return true
    },
  )
  assert.doesNotMatch(
    friendlyBigQueryError(failure),
    /Application Default Credentials/,
  )
  assert.doesNotMatch(
    friendlyBigQueryError(new Error('Unrecognized name: client_id at [1:8]')),
    /Application Default Credentials/,
  )
})

test('real BigQuery SDK connection testing recognizes incomplete synthetic user ADC', async () => {
  const adapter = new BigQueryAdapter(
    (options) =>
      new BigQuery({
        ...options,
        credentials: { type: 'authorized_user' } as never,
      }),
  )
  const result = await adapter.test(profile)
  assert.equal(result.ok, false)
  if (!result.ok)
    assert.match(
      result.error,
      /Application Default Credentials.*JSON.*GOOGLE_APPLICATION_CREDENTIALS/,
    )
})

test('known SDK object/type validation and punctuation variants receive ADC guidance', () => {
  for (const load of [
    () => new UserRefreshClient().fromJSON({ type: 'wrong-type' } as never),
    () => new UserRefreshClient().fromJSON(null as never),
    () => new JWT().fromJSON(null as never),
  ]) {
    assert.throws(load, (error) => {
      assert.ok(error instanceof Error)
      assert.match(
        friendlyBigQueryError(error),
        /Application Default Credentials.*JSON/,
      )
      return true
    })
  }
  assert.match(
    friendlyBigQueryError(
      new Error('The incoming JSON object does not contain a client_id field.'),
    ),
    /Application Default Credentials.*JSON/,
  )
  assert.doesNotMatch(
    friendlyBigQueryError(
      new Error(
        'The incoming JSON object does not contain a custom_json field',
      ),
    ),
    /Application Default Credentials/,
  )
})
