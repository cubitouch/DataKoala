import React from 'react'
void React
import { selectActiveSession, useStore } from '../store/useStore'

export function ExplainPane() {
  const show = useStore((s) => selectActiveSession(s).showExplain)
  const text = useStore((s) => selectActiveSession(s).explainText)
  const setShow = useStore((s) => s.setShowExplain)
  const activeExplainRequest = useStore((s) => selectActiveSession(s).activeExplainRequest)
  const loadingMessage = activeExplainRequest === 'analyze' ? 'Running EXPLAIN ANALYZE…' : activeExplainRequest === 'explain' ? 'Generating query plan…' : null
  if (!show || (!text && !loadingMessage)) return null
  return (
    <div className="explain-pane">
      <div className="head">
        <span>EXPLAIN</span>
        <div className="spacer" />
        <button className="btn ghost" onClick={() => setShow(false)}>close</button>
      </div>
      {loadingMessage && <div className="explain-status" role="status" aria-live="polite">{loadingMessage}</div>}
      {text && <pre>{text}</pre>}
    </div>
  )
}
