import React, { useEffect, useId, useRef } from 'react'
void React
import type { DataSourceProfile } from '@shared/types'
import styles from './DeleteConnectionDialog.module.css'

interface Props {
  profile: DataSourceProfile
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteConnectionDialog({ profile, onCancel, onConfirm }: Props) {
  const titleId = useId()
  const descriptionId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCancel() }
    }
    window.addEventListener('keydown', dismiss)
    return () => window.removeEventListener('keydown', dismiss)
  }, [onCancel])

  return <div className={styles.modalOverlay} onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
    <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onMouseDown={(event) => event.stopPropagation()}>
      <h2 id={titleId}>Delete connection?</h2>
      <p id={descriptionId}>Delete <span className={styles.connectionName} title={profile.name} aria-label={profile.name}>“{profile.name}”</span>? This removes the saved connection from DataKoala.</p>
      <div className={styles.actions}>
        <button ref={cancelRef} type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn danger" onClick={onConfirm}>Delete connection</button>
      </div>
    </div>
  </div>
}
