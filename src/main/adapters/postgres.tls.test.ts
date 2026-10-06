import assert from 'node:assert/strict'
import test from 'node:test'
import type { PoolConfig } from 'pg'
import type { ConnectionProfile, PostgresTlsMode } from '../../shared/types.ts'
import { __testing } from './postgres.ts'

const SYNTHETIC_CA =
  '-----BEGIN CERTIFICATE-----\nSYNTHETIC-TEST-CA\n-----END CERTIFICATE-----'

function profile(tlsMode: PostgresTlsMode, tlsCa?: string): ConnectionProfile {
  return {
    kind: 'postgres',
    version: 2,
    id: 'tls-test',
    name: 'TLS test',
    host: 'db.example',
    port: 5432,
    database: 'app',
    user: 'reader',
    password: '',
    tlsMode,
    ...(tlsCa ? { tlsCa } : {}),
    readonly: true,
  }
}

function tlsOptions(
  tlsMode: PostgresTlsMode,
  tlsCa?: string,
): Exclude<PoolConfig['ssl'], boolean | undefined> {
  const ssl = __testing.postgresTlsConfig(profile(tlsMode, tlsCa))
  assert.notEqual(ssl, false)
  assert.notEqual(ssl, true)
  assert.notEqual(ssl, undefined)
  return ssl as Exclude<PoolConfig['ssl'], boolean | undefined>
}

test('TLS disable maps to ssl false', () => {
  assert.equal(__testing.postgresTlsConfig(profile('disable')), false)
})

test('TLS require preserves compatibility encryption without verification', () => {
  assert.deepEqual(__testing.postgresTlsConfig(profile('require')), {
    rejectUnauthorized: false,
  })
})

test('verify-ca uses system roots and disables only hostname verification', () => {
  const ssl = tlsOptions('verify-ca')
  assert.equal(ssl.rejectUnauthorized, true)
  assert.equal(typeof ssl.checkServerIdentity, 'function')
  assert.equal(ssl.ca, undefined)
})

test('verify-ca passes a private CA while retaining certificate verification', () => {
  const ssl = tlsOptions('verify-ca', SYNTHETIC_CA)
  assert.equal(ssl.rejectUnauthorized, true)
  assert.equal(ssl.ca, SYNTHETIC_CA)
  assert.equal(typeof ssl.checkServerIdentity, 'function')
})

test('verify-full uses system roots and normal hostname verification', () => {
  const ssl = tlsOptions('verify-full')
  assert.equal(ssl.rejectUnauthorized, true)
  assert.equal(ssl.checkServerIdentity, undefined)
  assert.equal(ssl.ca, undefined)
})

test('verify-full passes a private CA and keeps normal hostname verification', () => {
  const ssl = tlsOptions('verify-full', SYNTHETIC_CA)
  assert.equal(ssl.rejectUnauthorized, true)
  assert.equal(ssl.ca, SYNTHETIC_CA)
  assert.equal(ssl.checkServerIdentity, undefined)
})

test('certificate-verifying modes can never disable authorization', () => {
  for (const tlsMode of ['verify-ca', 'verify-full'] as const) {
    for (const tlsCa of [undefined, SYNTHETIC_CA]) {
      const ssl = tlsOptions(tlsMode, tlsCa)
      assert.notEqual(ssl.rejectUnauthorized, false)
    }
  }
})
