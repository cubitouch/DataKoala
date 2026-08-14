import React from 'react'
void React
import { selectActiveSession, useStore, type QueryMode } from '../store/useStore'

export function ModeSwitch() {
  const mode = useStore((s) => selectActiveSession(s).queryMode)
  const setMode = useStore((s) => s.setQueryMode)
  const connectionId = useStore((s) => selectActiveSession(s).connectionProfileId)
  const prometheus = useStore((s) => s.profiles.find((profile) => profile.id === connectionId)?.kind === 'prometheus')
  const disabled = useStore((s) => selectActiveSession(s).activeExplainRequest !== null)
  return <div className="segmented" aria-label="Query mode">
    {(['sql', 'builder'] as QueryMode[]).map((value) => {
      const unavailable = prometheus && value === 'builder'
      return <button key={value} className={(prometheus ? value === 'sql' : mode === value) ? 'active' : ''} onClick={() => setMode(value)} disabled={disabled || unavailable} aria-disabled={disabled || unavailable}>{value === 'sql' ? (prometheus ? 'PromQL' : 'SQL') : 'Builder'}</button>
    })}
  </div>
}
