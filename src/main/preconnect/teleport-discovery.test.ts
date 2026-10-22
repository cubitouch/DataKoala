import assert from 'node:assert/strict'
import test from 'node:test'
import {
  discoverTeleportDatabases,
  type TshCommandRunner,
} from './teleport-discovery.ts'

test('discover returns the PostgreSQL database services', async () => {
  const runner: TshCommandRunner = async () => ({
    stdout: JSON.stringify([
      { metadata: { name: 'pg' }, spec: { protocol: 'postgres' } },
      { metadata: { name: 'mongo' }, spec: { protocol: 'mongodb' } },
    ]),
    stderr: '',
  })
  const result = await discoverTeleportDatabases({}, runner)
  assert.deepEqual(result, { ok: true, databases: [{ name: 'pg' }] })
})

test('discover reports a missing tsh instead of throwing', async () => {
  const runner: TshCommandRunner = async () => {
    throw Object.assign(new Error('spawn tsh ENOENT'), { code: 'ENOENT' })
  }
  const result = await discoverTeleportDatabases({}, runner)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'TSH_NOT_FOUND')
  assert.match(result.error, /tsh/i)
})

test('discover maps an expired session to a login message', async () => {
  const runner: TshCommandRunner = async () => {
    throw Object.assign(new Error('exit 1'), {
      stderr: 'ERROR: Active profile expired.',
    })
  }
  const result = await discoverTeleportDatabases({}, runner)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'TSH_NOT_LOGGED_IN')
  assert.match(result.error, /tsh login/i)
})

test('discover uses the configured tsh path', async () => {
  let used = ''
  const runner: TshCommandRunner = async (binary) => {
    used = binary
    return { stdout: '[]', stderr: '' }
  }
  await discoverTeleportDatabases({ tshPath: '  /opt/teleport/tsh  ' }, runner)
  assert.equal(used, '/opt/teleport/tsh')
})
