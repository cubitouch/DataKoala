import type { ConnectionStateEvent } from '@shared/types'
import type { ProfileConnectionState } from '@store/useStore'

/** Connection event generations are scoped to their profile, never the selected profile. */
export function isCurrentProfileConnectionEvent(
  current: ProfileConnectionState | undefined,
  event: ConnectionStateEvent,
): boolean {
  return !current || event.generation >= current.generation
}
