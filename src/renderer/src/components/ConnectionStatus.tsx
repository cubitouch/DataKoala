import { connectionKindLabel } from '../lib/connectionKind'
import { useStore } from '../store/useStore'

/** The single, shared connection indicator used by each query-mode toolbar. */
export function ConnectionStatus() {
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

  return <div className={`conn-pill ${connected ? 'on' : error ? 'err' : connectionStatus}`}
    role="status" aria-live="polite" title={statusText}>
    <span className="dot" />
    <span className="conn-pill-label">{statusText}</span>
  </div>
}
