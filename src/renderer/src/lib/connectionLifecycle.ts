import type { ConnectionStateEvent } from '@shared/types'
import type { ProfileConnectionState } from '@store/useStore'

/** Connection event generations are scoped to their profile, never the selected profile. */
export function isCurrentProfileConnectionEvent(
  current: ProfileConnectionState | undefined,
  event: ConnectionStateEvent,
): boolean {
  return !current || event.generation >= current.generation
}

/** Metadata and async work belong only to the captured usable generation. */
export function isUsableProfileConnection(
  current: ProfileConnectionState | undefined,
  generation: number,
): boolean {
  return (
    current?.generation === generation &&
    (current.status === 'connected' || current.status === 'idle')
  )
}

// Renderer request ownership is separate from backend connection generations:
// a newer request owns pending feedback before it has received a generation.
let connectionIntent = 0
const connectionIntents = new Map<string, number>()

export function beginConnectionIntent(profileId: string): number {
  const intent = ++connectionIntent
  connectionIntents.set(profileId, intent)
  return intent
}

export function isConnectionIntentCurrent(
  profileId: string,
  intent: number,
): boolean {
  return connectionIntents.get(profileId) === intent
}
