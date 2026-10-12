import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { ConnectionStateEvent } from '@shared/types.ts'
import {
  isCurrentProfileConnectionEvent,
  isUsableProfileConnection,
} from './connectionLifecycle.ts'

const event = (
  profileId: string,
  generation: number,
): ConnectionStateEvent => ({
  profileId,
  generation,
  state: 'failed',
  expected: false,
  message: 'connection failed',
  code: 'CONNECTION_LOST',
  timestamp: 1,
  recoverable: true,
})

test('connection events compare generations only within their profile', () => {
  const generationTwo = {
    status: 'reconnecting' as const,
    generation: 2,
    error: null,
    serverVersion: null,
  }
  assert.equal(
    isCurrentProfileConnectionEvent(generationTwo, event('a', 1)),
    false,
  )
  assert.equal(isCurrentProfileConnectionEvent(undefined, event('b', 1)), true)
  assert.equal(
    isCurrentProfileConnectionEvent(generationTwo, event('a', 2)),
    true,
  )
})

test.each([
  ['connected', true],
  ['idle', true],
  ['connecting', false],
  ['reconnecting', false],
  ['disconnected', false],
  ['error', false],
] as const)('generation-scoped work accepts %s=%s', (status, usable) => {
  assert.equal(
    isUsableProfileConnection(
      { status, generation: 2, error: null, serverVersion: null },
      2,
    ),
    usable,
  )
})

test('generation-scoped work rejects missing state and a different generation', () => {
  assert.equal(isUsableProfileConnection(undefined, 2), false)
  assert.equal(
    isUsableProfileConnection(
      { status: 'connected', generation: 3, error: null, serverVersion: null },
      2,
    ),
    false,
  )
})
