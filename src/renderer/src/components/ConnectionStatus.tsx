import { connectionKindLabel } from '../lib/connectionKind'
import { useStore } from '../store/useStore'
import styles from './ConnectionStatus.module.css'

/** The single, shared connection indicator used by each query-mode toolbar. */
type ConnectionStatusProps = { className?: string }

export function ConnectionStatus({ className }: ConnectionStatusProps) {
  const connected = useStore((state) => state.connected)
  const serverVersion = useStore((state) => state.serverVersion)
  const activeId = useStore((state) => state.activeProfileId)
  const profiles = useStore((state) => state.profiles)
  const error = useStore((state) => state.connectionError)
  const connecting = useStore((state) => state.connecting)
  const connectionStatus = useStore((state) => state.connectionStatus)
  const activeProfile = profiles.find((profile) => profile.id === activeId)
  const activeName = activeProfile?.name
  const statusText = connectionStatus === 'reconnecting'
    ? 'Reconnecting…'
    : connecting
      ? 'Connecting…'
      : connected
        ? `${activeName} · ${activeProfile ? connectionKindLabel(activeProfile.kind) : ''}${serverVersion ? ` ${serverVersion}` : ''}`.trim()
        : error
          ? error
          : connectionStatus === 'idle' ? 'Idle' : activeName ? `${activeName} · disconnected` : 'Disconnected'

  const stateClass = connected ? styles.connected : error ? styles.error : styles[connectionStatus]
  return <div className={`${styles.root} ${stateClass}${className ? ` ${className}` : ''}`}
    role="status" aria-live="polite" title={statusText} data-state={connected ? 'connected' : error ? 'error' : connectionStatus}>
    <span className={styles.dot} />
    <span className={styles.label}>{statusText}</span>
  </div>
}
