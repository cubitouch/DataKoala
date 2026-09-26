import type { DataSourceKind } from '@shared/types'
import styles from './ConnectionModal.module.css'
import { CONNECTION_SOURCE_DESCRIPTORS, SourceIcon } from './connectionSources'

export function ConnectionFormHeader({ kind, editing, onBack }: { kind: DataSourceKind; editing: boolean; onBack?: () => void }) {
  const descriptor = CONNECTION_SOURCE_DESCRIPTORS.find((item) => item.kind === kind)!
  return <header className={[styles.connectionFormHeader].join(' ')}>
    {onBack && <button type="button" className={['btn', 'ghost', styles.connectionBack].join(' ')} onClick={onBack} aria-label="Back to connection types">← Back</button>}
    <span className={[styles.sourceIcon].join(' ')}><SourceIcon type={descriptor.icon} /></span>
    <div><div className={[styles.wizardSteps].join(' ')}>{editing ? 'Connection type' : 'Step 2 of 2 · Details'}</div><h2 id={`${kind}-connection-title`}>{editing ? `Edit ${descriptor.label} connection` : descriptor.label}</h2></div>
    {editing && <span className={[styles.sourceKindBadge].join(' ')}>Fixed type</span>}
  </header>
}
