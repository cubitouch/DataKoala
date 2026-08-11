import React from 'react'
void React
import { selectActiveSession, useStore, type QueryMode } from '../store/useStore'

export function ModeSwitch() {
  const mode = useStore((s) => selectActiveSession(s).queryMode)
  const setMode = useStore((s) => s.setQueryMode)
  const disabled = useStore((s) => selectActiveSession(s).activeExplainRequest !== null)
  return <div className="segmented" aria-label="Query mode">
    {(['sql', 'builder'] as QueryMode[]).map((value) => <button key={value} className={mode === value ? 'active' : ''} onClick={() => setMode(value)} disabled={disabled} aria-disabled={disabled}>{value === 'sql' ? 'SQL' : 'Builder'}</button>)}
  </div>
}
