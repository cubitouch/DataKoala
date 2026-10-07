import { ExecutionPlanDiagram } from './ExecutionPlanDiagram'
import { selectActiveSession, useStore } from '@store/useStore'
import styles from './ExplainPane.module.css'

export function ExplainPane() {
  const session = useStore(selectActiveSession)
  const show = session.showExplain
  const text = session.explainText
  const tree = session.explainTree
  const snapshot = session.explainSnapshot
  const setShow = useStore((s) => s.setShowExplain)
  const activeExplainRequest = session.activeExplainRequest
  const loadingMessage =
    activeExplainRequest === 'analyze'
      ? 'Running EXPLAIN ANALYZE…'
      : activeExplainRequest === 'explain'
        ? 'Generating query plan…'
        : null

  if (!show || (!text && !tree && !loadingMessage)) return null

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <span>
          {snapshot?.mode === 'analyze' ? 'EXPLAIN ANALYZE' : 'EXPLAIN'}
        </span>
        <div className={styles.spacer} />
        <button className="btn ghost" onClick={() => setShow(false)}>
          close
        </button>
      </div>
      {loadingMessage && (
        <div className={styles.status} role="status" aria-live="polite">
          {loadingMessage}
        </div>
      )}
      <div className={styles.content}>
        {tree && (
          <ExecutionPlanDiagram
            tree={tree}
            analyze={snapshot?.mode === 'analyze'}
          />
        )}
        {snapshot && snapshot.query !== session.sql && (
          <p className={styles.status}>
            The editor has changed. This plan belongs to the SQL captured when
            Explain was run.
          </p>
        )}
        {text && (
          <details className={styles.textPlan}>
            <summary>Text plan</summary>
            <pre className={styles.plan}>{text}</pre>
          </details>
        )}
      </div>
    </div>
  )
}
