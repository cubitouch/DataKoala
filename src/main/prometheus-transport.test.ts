import assert from 'node:assert/strict'
import test from 'node:test'
import { GcxPrometheusTransport, normalizeGcxMetadata, type GcxCommandRunner } from './gcx-prometheus-transport.ts'
import { migrateStoredProfile } from './profile-migration.ts'

test('gcx succeeds with structured JSON and normalizes metadata without credentials', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    return args[0] === 'version'
      ? { stdout: '{"version":"1.2.3"}', stderr: '' }
      : { stdout: '{"http_requests_total":[{"type":"counter","help":"Requests","unit":"requests"}]}', stderr: '' }
  }
  const transport = new GcxPrometheusTransport(undefined, run)
  const version = await transport.version()
  const metadata = await transport.metadata()
  assert.deepEqual(calls, [['version', '-o', 'json'], ['metrics', 'metadata', '-o', 'json']])
  assert.deepEqual(metadata, [{ name: 'http_requests_total', type: 'counter', help: 'Requests', unit: 'requests' }])
  assert.equal(version, '1.2.3')
  assert.doesNotMatch(JSON.stringify({ version, metadata }), /token|oauth|credential|secret/i)
})

test('gcx executable missing has an actionable error', async () => {
  const run: GcxCommandRunner = async () => { const error = new Error('spawn gcx ENOENT') as NodeJS.ErrnoException; error.code = 'ENOENT'; throw error }
  await assert.rejects(() => new GcxPrometheusTransport(undefined, run).version(), /gcx is not installed/)
})

test('gcx malformed JSON is rejected', async () => {
  const run: GcxCommandRunner = async () => ({ stdout: 'not-json', stderr: '' })
  await assert.rejects(() => new GcxPrometheusTransport(undefined, run).version(), /malformed JSON/)
})

test('gcx non-zero exits are normalized without exposing terminal output', async () => {
  const run: GcxCommandRunner = async () => { throw Object.assign(new Error('exit 1'), { stderr: 'unexpected internal detail' }) }
  await assert.rejects(() => new GcxPrometheusTransport(undefined, run).version(), /^Error: gcx could not discover metrics/)
})

test('gcx expired and unauthenticated failures have specific recovery guidance', async () => {
  const expired: GcxCommandRunner = async () => { throw Object.assign(new Error('exit 1'), { stderr: 'access token expired' }) }
  await assert.rejects(() => new GcxPrometheusTransport(undefined, expired).metadata(), /authentication has expired.*gcx login/)
  const loggedOut: GcxCommandRunner = async () => { throw Object.assign(new Error('exit 1'), { stderr: 'not authenticated' }) }
  await assert.rejects(() => new GcxPrometheusTransport(undefined, loggedOut).metadata(), /no authenticated context.*gcx login/)
})

test('gcx permission failures explain that metrics access is required', async () => {
  const forbidden: GcxCommandRunner = async () => { throw Object.assign(new Error('exit 1'), { stderr: 'request forbidden: status 403' }) }
  await assert.rejects(() => new GcxPrometheusTransport(undefined, forbidden).metadata(), /Metrics access is not permitted/)
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
