import { connectionKindLabel } from '@lib/connectionKind'
import { selectActiveSession, useStore } from '@store/useStore'
import styles from './ConnectionStatus.module.css'

/** The single, shared connection indicator used by each query-mode toolbar. */
type ConnectionStatusProps = { className?: string }

export function ConnectionStatus({ className }: ConnectionStatusProps) {
  const tabProfileId = useStore(
    (state) => selectActiveSession(state).connectionProfileId,
  )
  const activeId = useStore((state) => state.activeProfileId)
  const profiles = useStore((state) => state.profiles)
  const profileConnection = useStore((state) =>
    tabProfileId ? state.connectionStateByProfileId[tabProfileId] : undefined,
  )
  const legacyConnected = useStore((state) => state.connected)
  const legacyServerVersion = useStore((state) => state.serverVersion)
  const legacyError = useStore((state) => state.connectionError)
  const legacyConnecting = useStore((state) => state.connecting)
  const legacyStatus = useStore((state) => state.connectionStatus)

  const profileId = tabProfileId ?? activeId
  const activeProfile = profiles.find((profile) => profile.id === profileId)
  const useLegacyFallback =
    !profileConnection &&
    (!tabProfileId || Boolean(profileId && activeId === profileId))
  const status =
    profileConnection?.status ??
    (useLegacyFallback ? legacyStatus : 'disconnected')
  const error =
    profileConnection?.error ?? (useLegacyFallback ? legacyError : null)
  const serverVersion =
    profileConnection?.serverVersion ??
    (useLegacyFallback ? legacyServerVersion : null)
  const live =
    status === 'connected' ||
    status === 'idle' ||
    (useLegacyFallback && legacyConnected)
  const connecting =
    status === 'connecting' ||
    status === 'reconnecting' ||
    (useLegacyFallback && legacyConnecting)
  const activeName = activeProfile?.name
  const statusText =
    status === 'reconnecting'
      ? 'Reconnecting…'
      : connecting
        ? 'Connecting…'
        : live
          ? `${activeName} · ${activeProfile ? connectionKindLabel(activeProfile.kind) : ''}${serverVersion ? ` ${serverVersion}` : ''}`.trim()
          : error
            ? error
            : activeName
              ? `${activeName} · disconnected`
              : 'Disconnected'

  const stateClass = live ? styles.connected : error ? styles.error : ''
  return (
    <div
      className={[styles.root, stateClass, className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      title={statusText}
      data-state={live ? 'connected' : error ? 'error' : status}
    >
      <span className={styles.dot} />
      <span className={styles.label}>{statusText}</span>
    </div>
  )
}
