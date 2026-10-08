import { ExecutionPlanDiagram } from './ExecutionPlanDiagram'
import { useAiPlanAnalysis } from '@lib/ai/useAiPlanAnalysis'
import { AiPlanContextPopover } from '@components/ai/AiPlanContextPopover'
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
  const ai = useAiPlanAnalysis()
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
        {ai.configured && ai.plan && ai.context && (
          <>
            <button
              className={`btn ghost ${styles.performanceAction}`}
              disabled={ai.busy}
              onClick={() => void ai.analyze()}
            >
              {ai.busy ? 'Analyzing…' : 'Analyze performance'}
            </button>
            {ai.busy && (
              <button
                className={`btn ghost ${styles.cancelAction}`}
                onClick={ai.cancel}
              >
                Cancel
              </button>
            )}
            <AiPlanContextPopover
              mode={ai.plan.mode}
              sql={ai.plan.query}
              plan={ai.context}
              response={ai.analysis}
              sent={ai.busy || Boolean(ai.analysis) || Boolean(ai.error)}
            />
          </>
        )}
        <button
          className={`btn ghost ${styles.closeAction}`}
          onClick={() => setShow(false)}
        >
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
            planningTimeMs={snapshot?.planningTimeMs}
            executionTimeMs={snapshot?.executionTimeMs}
            highlightedNodeIds={ai.highlightedNodeIds}
            focusNodeId={ai.focusNodeId}
          />
        )}
        {ai.configured && ai.plan && (
          <section className={styles.aiHints} aria-label="AI performance hints">
            <div className={styles.aiHintsHeader}>
              <strong>AI performance hints</strong>
              {ai.selectedHint && (
                <button
                  className="btn ghost"
                  onClick={ai.clearHint}
                  aria-label="Clear selected performance hint"
                >
                  Clear selection
                </button>
              )}
            </div>
            {ai.busy ? (
              <p role="status">Analyzing the captured execution plan…</p>
            ) : ai.error ? (
              <p className={styles.aiError} role="alert">
                {ai.error}
              </p>
            ) : ai.analysis ? (
              <>
                <p>{ai.analysis.summary}</p>
                {ai.analysis.hints.length ? (
                  <div className={styles.hints}>
                    {ai.analysis.hints.map((hint, index) => (
                      <button
                        type="button"
                        key={`${hint.title}:${index}`}
                        className={`${styles.hint} ${
                          ai.selectedHint === hint ? styles.activeHint : ''
                        }`}
                        aria-pressed={ai.selectedHint === hint}
                        onClick={() => ai.selectHint(index)}
                      >
                        <span className={styles.hintTitle}>
                          <span
                            className={
                              hint.severity === 'warning'
                                ? styles.warning
                                : styles.info
                            }
                            aria-hidden="true"
                          >
                            {hint.severity === 'warning' ? '⚠' : 'ⓘ'}
                          </span>
                          {hint.title}
                        </span>
                        <span>{hint.detail}</span>
                        <small>
                          Evidence: {hint.evidence} · node{' '}
                          {hint.nodeIds.join(', ')}
                        </small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>No specific performance hints found in this plan.</p>
                )}
              </>
            ) : (
              <p>Analyze this captured plan to get optional AI hints.</p>
            )}
          </section>
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
