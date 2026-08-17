import React from 'react'
void React
import { selectActiveSession, useStore, type QueryMode } from '../store/useStore'
import styles from './ModeSwitch.module.css'

export function ModeSwitch() {
  const mode = useStore((s) => selectActiveSession(s).queryMode)
  const setMode = useStore((s) => s.setQueryMode)
  const connectionId = useStore((s) => selectActiveSession(s).connectionProfileId)
  const prometheus = useStore((s) => s.profiles.find((profile) => profile.id === connectionId)?.kind === 'prometheus')
  const disabled = useStore((s) => selectActiveSession(s).activeExplainRequest !== null)
  return <div className={`segmented ${styles.root}`} aria-label="Query mode">
    {(['sql', 'builder'] as QueryMode[]).map((value) => {
      const active = mode === value
      return <button key={value} className={`${styles.button} ${active ? `${styles.active} active` : ''}`} onClick={() => setMode(value)} disabled={disabled} aria-disabled={disabled} aria-pressed={active}>{value === 'sql' ? (prometheus ? 'PromQL' : 'SQL') : 'Builder'}</button>
    })}
  </div>
}
