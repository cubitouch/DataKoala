import assert from 'node:assert/strict'
import test from 'node:test'
import type { PostgresProfile, TeleportPreConnect } from '../../shared/types.ts'
import {
  applyTeleportTunnel,
  resolveTeleportConfig,
} from './effective-profile.ts'

function profile(overrides: Partial<PostgresProfile> = {}): PostgresProfile {
  return {
    kind: 'postgres',
    version: 2,
    id: 'p1',
    name: 'Example database',
    host: 'db.example.internal',
    port: 5432,
    database: 'example_db',
    user: 'example-reader@example.iam',
    password: '',
    tlsMode: 'verify-full',
    readonly: true,
    ...overrides,
  }
}

function config(
  overrides: Partial<TeleportPreConnect> = {},
): TeleportPreConnect {
  return {
    mode: 'teleport',
    dbService: 'example-postgres',
    tunnelPort: 15433,
    ...overrides,
  }
}

test('resolveTeleportConfig returns null without Teleport settings', () => {
  assert.equal(resolveTeleportConfig(profile()), null)
  assert.equal(resolveTeleportConfig(profile({ preConnect: undefined })), null)
})

test('resolveTeleportConfig fills db-user and db-name from the profile', () => {
  const resolved = resolveTeleportConfig(profile({ preConnect: config() }))
  assert.equal(resolved?.dbUser, 'example-reader@example.iam')
  assert.equal(resolved?.dbName, 'example_db')
})

test('resolveTeleportConfig keeps explicit trimmed overrides', () => {
  const resolved = resolveTeleportConfig(
    profile({ preConnect: config({ dbUser: '  other@corp  ' }) }),
  )
  assert.equal(resolved?.dbUser, 'other@corp')
})

test('applyTeleportTunnel points the pool at the loopback tunnel without TLS or a password', () => {
  const target = applyTeleportTunnel(
    profile({ password: 'secret', hasPassword: true }),
    config({ dbUser: 'reader', dbName: 'app' }),
  )
  assert.equal(target.host, '127.0.0.1')
  assert.equal(target.port, 15433)
  assert.equal(target.user, 'reader')
  assert.equal(target.database, 'app')
  assert.equal(target.tlsMode, 'disable')
  assert.equal(target.password, '')
  // The logical target details remain on the profile for reference.
  assert.equal(target.name, 'Example database')
  assert.equal(target.readonly, true)
})

test('applyTeleportTunnel falls back to the profile user and database', () => {
  const target = applyTeleportTunnel(
    profile(),
    config({ dbUser: undefined, dbName: undefined }),
  )
  assert.equal(target.user, 'example-reader@example.iam')
  assert.equal(target.database, 'example_db')
})
