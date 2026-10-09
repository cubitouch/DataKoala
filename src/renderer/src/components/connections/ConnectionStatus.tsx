import { connectionKindLabel } from '@lib/connectionKind'
import {
  selectActiveSession,
  selectActiveTabConnection,
  useStore,
} from '@store/useStore'
import styles from './ConnectionStatus.module.css'

/** The single, shared connection indicator used by each query-mode toolbar. */
type ConnectionStatusProps = { className?: string }

export function ConnectionStatus({ className }: ConnectionStatusProps) {
  const tabProfileId = useStore(
    (state) => selectActiveSession(state).connectionProfileId,
  )
  const profiles = useStore((state) => state.profiles)
  const profileConnection = useStore(selectActiveTabConnection)
  const activeProfile = profiles.find((profile) => profile.id === tabProfileId)
  const status = profileConnection?.status
  const error = profileConnection?.error ?? null
  const serverVersion = profileConnection?.serverVersion ?? null
  const live = status === 'connected' || status === 'idle'
  const connecting = status === 'connecting' || status === 'reconnecting'
  const activeName = activeProfile?.name
  const statusText = !tabProfileId
    ? 'No connection selected'
    : !profileConnection
      ? 'Restoring connection…'
      : status === 'reconnecting'
        ? 'Reconnecting…'
        : connecting
          ? 'Connecting…'
          : live && activeProfile
            ? `${activeName} · ${connectionKindLabel(activeProfile.kind)}${serverVersion ? ` ${serverVersion}` : ''}`.trim()
            : error
              ? error
              : status === 'idle'
                ? 'Idle'
                : live
                  ? 'Connected'
                  : activeName
                    ? `${activeName} · disconnected`
                    : 'Disconnected'

  const stateClass = live ? styles.connected : error ? styles.error : ''
  const stateLabel = profileConnection
    ? error
      ? 'error'
      : status
    : tabProfileId
      ? 'pending'
      : 'unassigned'
  return (
    <div
      className={[styles.root, stateClass, className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      title={statusText}
      data-state={live ? 'connected' : stateLabel}
    >
      <span className={styles.dot} />
      <span className={styles.label}>{statusText}</span>
    </div>
  )
}
