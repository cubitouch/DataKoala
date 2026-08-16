import React from 'react'
void React
import { selectActiveSession, useStore } from '../store/useStore'
import styles from './ExplainPane.module.css'

export function ExplainPane() {
  const show = useStore((s) => selectActiveSession(s).showExplain)
  const text = useStore((s) => selectActiveSession(s).explainText)
  const setShow = useStore((s) => s.setShowExplain)
  const activeExplainRequest = useStore((s) => selectActiveSession(s).activeExplainRequest)
  const loadingMessage = activeExplainRequest === 'analyze' ? 'Running EXPLAIN ANALYZE…' : activeExplainRequest === 'explain' ? 'Generating query plan…' : null
  if (!show || (!text && !loadingMessage)) return null
  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <span>EXPLAIN</span>
        <div className={styles.spacer} />
        <button className="btn ghost" onClick={() => setShow(false)}>close</button>
      </div>
      {loadingMessage && <div className={styles.status} role="status" aria-live="polite">{loadingMessage}</div>}
      {text && <pre className={styles.plan}>{text}</pre>}
    </div>
  )
}
