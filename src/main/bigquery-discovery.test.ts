import assert from 'node:assert/strict'
import test from 'node:test'
import { BigQueryDiscoveryService } from './bigquery-discovery.ts'

test('discovers and sorts projects across provider pages', async () => {
  const responses = [
    {
      data: {
        projects: [{ id: 'z', friendlyName: 'Zed' }],
        nextPageToken: 'next',
      },
    },
    { data: { projects: [{ id: 'a' }] } },
  ]
  const service = new BigQueryDiscoveryService(() => null as never, {
    getClient: async () => ({ request: async () => responses.shift()! }),
  } as never)
  assert.deepEqual(await service.discoverProjects(), [
    { projectId: 'a' },
    { projectId: 'z', friendlyName: 'Zed' },
  ])
})

test('surfaces only datasets returned by the provider with list metadata', async () => {
  const datasets = [
    {
      id: 'events',
      metadata: {
        datasetReference: { projectId: 'data', datasetId: 'events' },
        friendlyName: 'Analytics events',
        location: 'EU',
      },
    },
  ]
  let options: unknown
  const service = new BigQueryDiscoveryService(
    () =>
      ({
        getDatasets: async (received: unknown) => {
          options = received
          return [datasets]
        },
      }) as never,
  )
  assert.deepEqual(await service.listDatasets('data'), [
    {
      projectId: 'data',
      datasetId: 'events',
      friendlyName: 'Analytics events',
      location: 'EU',
    },
  ])
  assert.deepEqual(options, { projectId: 'data', autoPaginate: true })
})

// Discovery must preserve the actionable provider diagnosis instead of bare SDK errors.
test('normalizes project/default/dataset discovery failures without losing their causes', async () => {
  const cause = Object.assign(
    new Error('invalid_grant: Token has been expired or revoked'),
    { code: 401 },
  )
  const service = new BigQueryDiscoveryService(
    () =>
      ({
        getDatasets: async () => {
          throw cause
        },
      }) as never,
    {
      getClient: async () => {
        throw cause
      },
      getProjectId: async () => {
        throw cause
      },
    } as never,
  )
  for (const operation of [
    () => service.discoverProjects(),
    () => service.discoverDefaults(),
    () => service.listDatasets('demo'),
  ]) {
    await assert.rejects(operation(), (error) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /expired or was revoked.*Renew ADC/)
      assert.equal(error.cause, cause)
      return true
    })
  }
})
