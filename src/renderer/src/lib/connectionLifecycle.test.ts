import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { ConnectionStateEvent } from '@shared/types.ts'
import { isCurrentProfileConnectionEvent } from './connectionLifecycle.ts'

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
