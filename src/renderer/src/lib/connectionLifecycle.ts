import type { ConnectionStateEvent, QueryResult } from '@shared/types'

export interface DisconnectableState {
  activeProfileId: string | null
  connectionGeneration: number
  sql: string
  connected: boolean
  running: boolean
  connectionError: string | null
  result: QueryResult | null
  pendingResult?: QueryResult | null
  isResultStale?: boolean
  isMetadataStale?: boolean
  disconnectedAt?: number | null
}

export function unexpectedDisconnectPatch(state: DisconnectableState, event: ConnectionStateEvent): Partial<DisconnectableState> | null {
  if (event.profileId !== state.activeProfileId || event.generation < state.connectionGeneration) return null
  if (event.state !== 'failed' && event.state !== 'disconnected') return { connectionGeneration: event.generation }
  return {
    connectionGeneration: event.generation, connected: false, running: false,
    connectionError: event.expected ? null : event.message,
    pendingResult: null,
    isResultStale: Boolean(state.result),
    isMetadataStale: true,
    disconnectedAt: event.timestamp
  }
}
