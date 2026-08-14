import assert from 'node:assert/strict'
import test from 'node:test'
import { DirectPrometheusTransport } from './prometheus-transport.ts'
import { GcxPrometheusTransport, normalizeGcxMetadata, type GcxCommandRunner } from './gcx-prometheus-transport.ts'
import { migrateStoredProfile } from './profile-migration.ts'

function response(body: unknown): Response { return new Response(JSON.stringify(body), { status: 200 }) }

test('Direct Prometheus transport remains functional', async () => {
  let request: { url: string; authorization?: string } | undefined
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
    request = { url: String(input), authorization: (init?.headers as Record<string, string>)?.Authorization }
    return response({ status: 'success', data: ['up'] })
  }
  const transport = new DirectPrometheusTransport({ kind: 'direct', url: 'https://prom.example/', auth: { kind: 'bearer', token: 'secret' } }, fakeFetch as typeof fetch)
  assert.deepEqual(await transport.request('/api/v1/label/__name__/values'), ['up'])
  assert.equal(request?.url, 'https://prom.example/api/v1/label/__name__/values')
  assert.equal(request?.authorization, 'Bearer secret')
})

test('gcx succeeds with structured JSON and normalizes metadata without credentials', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    return args[0] === 'version'
      ? { stdout: '{"version":"1.2.3"}', stderr: '' }
      : { stdout: '{"http_requests_total":[{"type":"counter","help":"Requests","unit":"requests"}]}', stderr: '' }
  }
  const result = await new GcxPrometheusTransport(undefined, run).discover()
  assert.deepEqual(calls, [['version', '-o', 'json'], ['metrics', 'metadata', '-o', 'json']])
  assert.deepEqual(result.metadata, [{ name: 'http_requests_total', type: 'counter', help: 'Requests', unit: 'requests' }])
  assert.equal(result.gcx?.version, '1.2.3')
  assert.doesNotMatch(JSON.stringify(result), /token|oauth|credential|secret/i)
})

test('gcx executable missing has an actionable error', async () => {
  const run: GcxCommandRunner = async () => { const error = new Error('spawn gcx ENOENT') as NodeJS.ErrnoException; error.code = 'ENOENT'; throw error }
  await assert.rejects(() => new GcxPrometheusTransport(undefined, run).discover(), /gcx is not installed/)
})

test('gcx malformed JSON is rejected', async () => {
  const run: GcxCommandRunner = async () => ({ stdout: 'not-json', stderr: '' })
  await assert.rejects(() => new GcxPrometheusTransport(undefined, run).discover(), /malformed JSON/)
})

test('gcx non-zero exits are normalized without exposing terminal output', async () => {
  const run: GcxCommandRunner = async () => { throw Object.assign(new Error('exit 1'), { stderr: 'unexpected internal detail' }) }
  await assert.rejects(() => new GcxPrometheusTransport(undefined, run).discover(), /^Error: gcx could not discover metrics/)
})

test('gcx expired and unauthenticated failures have specific recovery guidance', async () => {
  const expired: GcxCommandRunner = async () => { throw Object.assign(new Error('exit 1'), { stderr: 'access token expired' }) }
  await assert.rejects(() => new GcxPrometheusTransport(undefined, expired).discover(), /authentication has expired.*gcx login/)
  const loggedOut: GcxCommandRunner = async () => { throw Object.assign(new Error('exit 1'), { stderr: 'not authenticated' }) }
  await assert.rejects(() => new GcxPrometheusTransport(undefined, loggedOut).discover(), /no authenticated context.*gcx login/)
})

test('metadata normalization accepts array envelopes and validates shape', () => {
  assert.deepEqual(normalizeGcxMetadata({ data: [{ metric: 'up', type: 'gauge', description: 'Target health' }] }), [{ name: 'up', type: 'gauge', help: 'Target health', unit: undefined }])
  assert.throws(() => normalizeGcxMetadata({ data: [{ invalid: true }] }), /shape was not recognized/)
})

test('persisted gcx profiles contain context configuration only', () => {
  const stored = { kind: 'prometheus', version: 1, id: 'p1', name: 'Cloud metrics', readonly: true, transport: { kind: 'gcx', context: 'production' } }
  const result = migrateStoredProfile(stored)
  if (result.status === 'unsupported') assert.fail('gcx profile was rejected')
  assert.equal(result.status, 'current')
  assert.equal(result.profile.kind, 'prometheus')
  if (result.profile.kind !== 'prometheus') assert.fail('wrong profile kind')
  assert.deepEqual(result.profile.transport, { kind: 'gcx', context: 'production' })
  assert.doesNotMatch(JSON.stringify(result), /token|password|oauth|credential|secret/i)
})
