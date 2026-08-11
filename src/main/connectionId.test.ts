import { test } from 'node:test'
import assert from 'node:assert/strict'

/**
 * Regression tests for connection-id handling.
 *
 * The renderer sends `id: ''` when creating a profile. An earlier implementation used
 * `profile.id ?? randomUUID()`, and because `??` only falls back on null/undefined the
 * empty string survived. That produced a falsy connection id, which made the Run
 * button silently do nothing. These tests pin the resolution rule.
 *
 * The logic is duplicated here rather than imported because connections-store.ts
 * imports `electron`, which cannot load outside an Electron process.
 */

function isUsableId(id: unknown): id is string {
  return typeof id === 'string' && id.trim() !== ''
}

function resolveId(incoming: unknown, generate: () => string): string {
  return isUsableId(incoming) ? incoming : generate()
}

const GEN = () => 'generated-uuid'

test('an empty-string id is replaced, not preserved', () => {
  // This is the exact bug: '' must not survive.
  assert.equal(resolveId('', GEN), 'generated-uuid')
})

test('a whitespace-only id is replaced', () => {
  assert.equal(resolveId('   ', GEN), 'generated-uuid')
})

test('undefined and null ids are replaced', () => {
  assert.equal(resolveId(undefined, GEN), 'generated-uuid')
  assert.equal(resolveId(null, GEN), 'generated-uuid')
})

test('a real id is preserved so editing a profile does not duplicate it', () => {
  assert.equal(resolveId('abc-123', GEN), 'abc-123')
})

test('non-string ids are replaced rather than trusted', () => {
  assert.equal(resolveId(42, GEN), 'generated-uuid')
  assert.equal(resolveId({}, GEN), 'generated-uuid')
})

test('every resolved id is truthy, so falsy-guard checks cannot misfire', () => {
  for (const bad of ['', '  ', undefined, null, 0, false, {}, []]) {
    const id = resolveId(bad, GEN)
    assert.ok(id, `resolved id must be truthy for input ${JSON.stringify(bad)}`)
    assert.equal(typeof id, 'string')
  }
})

test('the migration path assigns ids to previously-broken stored profiles', () => {
  // Simulates load(): profiles persisted by the buggy build carry id ''.
  const stored = [
    { id: '', name: 'broken one' },
    { id: 'good-id', name: 'fine' },
    { name: 'missing entirely' }
  ]
  let counter = 0
  const repaired = stored.map((p) => ({
    ...p,
    id: isUsableId((p as { id?: string }).id) ? (p as { id: string }).id : `uuid-${++counter}`
  }))
  assert.deepEqual(
    repaired.map((p) => p.id),
    ['uuid-1', 'good-id', 'uuid-2']
  )
  // And they must all be distinct, or the Map would collapse them.
  assert.equal(new Set(repaired.map((p) => p.id)).size, 3)
})

test('saving several new profiles does not collapse them onto one key', () => {
  // The severe half of the bug: every new profile resolved to id '', so
  // `profiles.set('', p)` meant each save silently overwrote the previous
  // connection. Two distinct saves must produce two distinct stored entries.
  const store = new Map<string, { id: string; name: string }>()
  let n = 0
  const generate = () => `uuid-${++n}`

  const save = (incoming: { id?: string; name: string }) => {
    const id = resolveId(incoming.id, generate)
    store.set(id, { ...incoming, id })
    return id
  }

  const first = save({ id: '', name: 'prod' })
  const second = save({ id: '', name: 'staging' })

  assert.notEqual(first, second, 'two new profiles must not share an id')
  assert.equal(store.size, 2, 'the second save overwrote the first')
  assert.deepEqual([...store.values()].map((p) => p.name).sort(), ['prod', 'staging'])
})

test('re-saving an existing profile updates in place instead of duplicating', () => {
  const store = new Map<string, { id: string; name: string }>()
  let n = 0
  const generate = () => `uuid-${++n}`
  const save = (incoming: { id?: string; name: string }) => {
    const id = resolveId(incoming.id, generate)
    store.set(id, { ...incoming, id })
    return id
  }

  const id = save({ id: '', name: 'original' })
  save({ id, name: 'renamed' })
  assert.equal(store.size, 1, 'editing should not create a second entry')
  assert.equal(store.get(id)!.name, 'renamed')
})
