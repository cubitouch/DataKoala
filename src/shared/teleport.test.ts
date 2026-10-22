import assert from 'node:assert/strict'
import test from 'node:test'
import type { TeleportPreConnect } from './types.ts'
import {
  DEFAULT_TUNNEL_TIMEOUT_MS,
  buildProxyDbArgs,
  formatProxyDbCommand,
  isSessionExpired,
  isValidTunnelPort,
  parseTeleportDatabases,
  parseTshStatus,
  resolveTshBinary,
  tunnelTimeout,
} from './teleport.ts'

function config(
  overrides: Partial<TeleportPreConnect> = {},
): TeleportPreConnect {
  return {
    mode: 'teleport',
    dbService: 'example-postgres',
    tunnelPort: 5433,
    ...overrides,
  }
}

test('buildProxyDbArgs produces the minimal proxy db command', () => {
  assert.deepEqual(buildProxyDbArgs(config()), [
    'proxy',
    'db',
    '--tunnel',
    '-p',
    '5433',
    'example-postgres',
  ])
})

test('buildProxyDbArgs includes every configured flag before the service', () => {
  assert.deepEqual(
    buildProxyDbArgs(
      config({
        dbUser: 'reader',
        dbName: 'example_db',
        cluster: 'example.teleport.sh',
        proxy: 'example.teleport.sh:443',
        login: 'example-user',
      }),
    ),
    [
      'proxy',
      'db',
      '--tunnel',
      '-p',
      '5433',
      '-u',
      'reader',
      '-n',
      'example_db',
      '-c',
      'example.teleport.sh',
      '--proxy',
      'example.teleport.sh:443',
      '-l',
      'example-user',
      'example-postgres',
    ],
  )
})

test('buildProxyDbArgs leaves values untouched and never builds a shell string', () => {
  const args = buildProxyDbArgs(
    config({ dbService: 'db; rm -rf /', dbUser: 'reader && whoami' }),
  )
  assert.deepEqual(args, [
    'proxy',
    'db',
    '--tunnel',
    '-p',
    '5433',
    '-u',
    'reader && whoami',
    'db; rm -rf /',
  ])
})

test('resolveTshBinary prefers an explicit path over PATH', () => {
  assert.equal(resolveTshBinary(config()), 'tsh')
  assert.equal(
    resolveTshBinary(config({ tshPath: '  /opt/teleport/tsh  ' })),
    '/opt/teleport/tsh',
  )
})

test('tunnelTimeout falls back for missing and out-of-range values', () => {
  assert.equal(tunnelTimeout(config()), DEFAULT_TUNNEL_TIMEOUT_MS)
  assert.equal(
    tunnelTimeout(config({ timeoutMs: 0 })),
    DEFAULT_TUNNEL_TIMEOUT_MS,
  )
  assert.equal(
    tunnelTimeout(config({ timeoutMs: Number.NaN })),
    DEFAULT_TUNNEL_TIMEOUT_MS,
  )
  assert.equal(tunnelTimeout(config({ timeoutMs: 5000 })), 5000)
})

test('formatProxyDbCommand previews the spawn without executing it', () => {
  assert.equal(
    formatProxyDbCommand(config()),
    'tsh proxy db --tunnel -p 5433 example-postgres',
  )
})

test('parseTshStatus reads the active session', () => {
  const status = parseTshStatus(
    JSON.stringify({
      active: {
        username: 'user@example.com',
        cluster: 'example.teleport.sh',
        roles: ['example-role', 5],
      },
    }),
  )
  assert.equal(status.loggedIn, true)
  assert.equal(status.username, 'user@example.com')
  assert.equal(status.cluster, 'example.teleport.sh')
  assert.deepEqual(status.roles, ['example-role'])
})

test('parseTshStatus reports logged out when there is no active session', () => {
  assert.deepEqual(parseTshStatus(JSON.stringify({})), {
    loggedIn: false,
    roles: [],
  })
  assert.deepEqual(parseTshStatus(JSON.stringify({ active: null })), {
    loggedIn: false,
    roles: [],
  })
})

test('isValidTunnelPort rejects non-integers, ports 0 and out-of-range', () => {
  assert.equal(isValidTunnelPort(5433), true)
  assert.equal(isValidTunnelPort(0), false)
  assert.equal(isValidTunnelPort(65536), false)
  assert.equal(isValidTunnelPort(5433.5), false)
  assert.equal(isValidTunnelPort('5433'), false)
})

test('parseTshStatus surfaces the certificate expiry', () => {
  const status = parseTshStatus(
    JSON.stringify({
      active: { valid_until: '2030-01-01T00:00:00+01:00', roles: [] },
    }),
  )
  assert.equal(status.validUntil, '2030-01-01T00:00:00+01:00')
})

test('isSessionExpired compares the certificate expiry against now', () => {
  const now = Date.parse('2026-06-01T00:00:00Z')
  assert.equal(isSessionExpired('2026-05-31T23:59:59Z', now), true)
  assert.equal(isSessionExpired('2026-06-01T00:00:00Z', now), true)
  assert.equal(isSessionExpired('2026-06-02T00:00:00Z', now), false)
  assert.equal(isSessionExpired(undefined, now), false)
  assert.equal(isSessionExpired('not-a-date', now), false)
})

test('parseTeleportDatabases keeps only named PostgreSQL services, sorted', () => {
  const input = JSON.stringify([
    { kind: 'db', metadata: { name: 'pg-b' }, spec: { protocol: 'postgres' } },
    { kind: 'db', metadata: { name: 'pg-a' }, spec: { protocol: 'postgres' } },
    { kind: 'db', metadata: { name: 'mongo' }, spec: { protocol: 'mongodb' } },
    { kind: 'db', metadata: {}, spec: { protocol: 'postgres' } },
    { kind: 'db', metadata: { name: 'no-spec' } },
  ])
  assert.deepEqual(parseTeleportDatabases(input), [
    { name: 'pg-a' },
    { name: 'pg-b' },
  ])
})

test('parseTeleportDatabases ignores non-array documents', () => {
  assert.deepEqual(parseTeleportDatabases('{}'), [])
  assert.deepEqual(parseTeleportDatabases('null'), [])
})
