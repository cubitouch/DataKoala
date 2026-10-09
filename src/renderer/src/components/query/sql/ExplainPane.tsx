import { useEffect, useMemo, useState } from 'react'
import { AiPlanContextPopover } from '@components/ai/AiPlanContextPopover'
import { useAiPlanAnalysis } from '@lib/ai/useAiPlanAnalysis'
import { copyTextToClipboard } from '@lib/clipboardText'
import { selectActiveSession, useStore } from '@store/useStore'
import { getExplainDiagnostics } from './ExplainDiagnostics'
import { ExecutionPlanGraph } from './ExecutionPlanGraph'
import { PlanNodeInspector } from './PlanNodeInspector'
import styles from './ExplainPane.module.css'

export function ExplainPane() {
  const session = useStore(selectActiveSession)
  const show = session.showExplain
  const text = session.explainText
  const tree = session.explainTree
  const snapshot = session.explainSnapshot
  const setShow = useStore((state) => state.setShowExplain)
  const activeExplainRequest = session.activeExplainRequest
  const displayedMode = activeExplainRequest ?? snapshot?.mode
  const requestLoading = activeExplainRequest !== null
  const ai = useAiPlanAnalysis()
  const [selectedNodeId, setSelectedNodeId] = useState(tree?.id ?? '')
  const [focusRequestId, setFocusRequestId] = useState(0)
  const [copied, setCopied] = useState('')
  const analyze = snapshot?.mode === 'analyze'
  const nodes = useMemo(() => {
    if (!tree) return []
    const result = [tree]
    for (let index = 0; index < result.length; index++)
      result.push(...(result[index]?.children ?? []))
    return result
  }, [tree])
  const diagnostics = useMemo(
    () => (tree ? getExplainDiagnostics(tree, analyze) : []),
    [analyze, tree],
  )
  const selected = nodes.find((node) => node.id === selectedNodeId) ?? tree
  const selectedId = selected?.id ?? ''
  const selectedSignals = diagnostics.filter((signal) =>
    signal.nodeIds.includes(selectedId),
  )
  const loadingMessage =
    activeExplainRequest === 'analyze'
      ? 'Running EXPLAIN ANALYZE…'
      : activeExplainRequest === 'explain'
        ? 'Generating query plan…'
        : null

  useEffect(() => {
    setSelectedNodeId(tree?.id ?? '')
  }, [tree])

  if (!show || (!text && !tree && !loadingMessage)) return null

  const copy = async (value: string, label: string) => {
    try {
      await copyTextToClipboard(value)
      setCopied(`${label} copied`)
      window.setTimeout(() => setCopied(''), 2200)
    } catch {
      setCopied('Clipboard access is unavailable')
    }
  }
  const highlightedIds = ai.highlightedNodeIds
  const focusNodeId = ai.focusNodeId

  return (
    <section className={styles.root} aria-label="Explain results">
      <header className={styles.head}>
        <div className={styles.titleGroup}>
          <span className={styles.eyebrow}>PostgreSQL</span>
          <h1>{displayedMode === 'analyze' ? 'EXPLAIN ANALYZE' : 'EXPLAIN'}</h1>
        </div>
        <div className={styles.summary} aria-label="Plan summary">
          {!requestLoading && snapshot?.planningTimeMs !== undefined && (
            <div>
              <span>Planning</span>
              <strong>{snapshot.planningTimeMs.toFixed(2)} ms</strong>
            </div>
          )}
          {!requestLoading && snapshot?.executionTimeMs !== undefined && (
            <div>
              <span>Execution</span>
              <strong>{snapshot.executionTimeMs.toFixed(2)} ms</strong>
            </div>
          )}
          {!requestLoading && tree && (
            <div>
              <span>Nodes</span>
              <strong>{nodes.length}</strong>
            </div>
          )}
          {!requestLoading && tree && (
            <div>
              <span>Signals</span>
              <strong>{diagnostics.length}</strong>
            </div>
          )}
        </div>
        <div className={styles.actions}>
          {text && (
            <button
              className="btn ghost"
              disabled={requestLoading}
              onClick={() => void copy(text, 'Text plan')}
            >
              Copy text plan
            </button>
          )}
          {tree && (
            <button
              className="btn ghost"
              disabled={requestLoading}
              onClick={() =>
                void copy(JSON.stringify(tree, null, 2), 'Plan JSON')
              }
            >
              Copy plan JSON
            </button>
          )}
          <button className="btn ghost" onClick={() => setShow(false)}>
            Close
          </button>
        </div>
      </header>
      <div className={styles.content} aria-busy={requestLoading}>
        <div
          className={`${styles.contentBody} ${requestLoading ? styles.staleContent : ''}`}
          inert={requestLoading || undefined}
          data-testid="explain-content-body"
        >
          {snapshot && snapshot.query !== session.sql && (
            <p className={styles.snapshotNotice}>
              The editor has changed. This plan belongs to the SQL captured when
              Explain was run.
            </p>
          )}
          {tree && selected && (
            <div className={styles.planLayout}>
              <ExecutionPlanGraph
                tree={tree}
                analyze={analyze}
                selectedNodeId={selectedId}
                highlightedNodeIds={highlightedIds}
                focusNodeId={focusNodeId}
                focusRequestId={focusRequestId}
                onSelectNode={(id) => setSelectedNodeId(id)}
              />
              <PlanNodeInspector
                node={selected}
                analyze={analyze}
                signals={selectedSignals}
              />
            </div>
          )}
          {ai.configured && ai.plan && (
            <section className={styles.panel} aria-label="Performance hints">
              <div className={styles.panelHeading}>
                <div>
                  <span className={styles.eyebrow}>Optional AI analysis</span>
                  <h2>Performance hints</h2>
                </div>
                <div className={styles.inlineActions}>
                  {ai.selectedHint && (
                    <button
                      className="btn ghost"
                      disabled={requestLoading}
                      onClick={ai.clearHint}
                    >
                      Clear selected hint
                    </button>
                  )}
                  {ai.error && (
                    <span className={styles.aiError} role="alert">
                      {ai.error}
                    </span>
                  )}
                  {ai.busy ? (
                    <button
                      className="btn ghost"
                      disabled={requestLoading}
                      onClick={ai.cancel}
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      className={ai.analysis ? 'btn ghost' : 'btn primary'}
                      disabled={requestLoading}
                      onClick={() => void ai.analyze()}
                    >
                      {ai.analysis ? 'Run again' : 'Run analysis'}
                    </button>
                  )}
                  <AiPlanContextPopover
                    mode={ai.plan.mode}
                    sql={ai.plan.query}
                    plan={ai.context!}
                    response={ai.analysis}
                    sent={ai.busy || Boolean(ai.analysis) || Boolean(ai.error)}
                  />
                </div>
              </div>
              {ai.busy ? (
                <p className={styles.panelMessage} role="status">
                  Analyzing the captured execution plan…
                </p>
              ) : ai.analysis ? (
                <>
                  <p className={styles.panelMessage}>{ai.analysis.summary}</p>
                  {ai.analysis.hints.length ? (
                    <div className={styles.cards}>
                      {ai.analysis.hints.map((hint, index) => (
                        <button
                          type="button"
                          key={`${hint.title}:${index}`}
                          disabled={requestLoading}
                          className={`${styles.hint} ${ai.selectedHint === hint ? styles.activeCard : ''}`}
                          aria-pressed={ai.selectedHint === hint}
                          onClick={() => {
                            ai.selectHint(index)
                            if (hint.nodeIds[0]) {
                              setSelectedNodeId(hint.nodeIds[0])
                              setFocusRequestId((current) => current + 1)
                            }
                          }}
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
                          {hint.action && (
                            <strong className={styles.hintAction}>
                              {hint.action}
                            </strong>
                          )}
                          <span>{hint.detail}</span>
                          <small>
                            Evidence: {hint.evidence} · node{' '}
                            {hint.nodeIds.join(', ')}
                          </small>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.panelMessage}>
                      No specific performance hints found in this plan.
                    </p>
                  )}
                </>
              ) : (
                <p className={styles.panelMessage}>
                  Analyze the captured plan for possible performance
                  improvements.
                </p>
              )}
            </section>
          )}
          {text && (
            <details className={styles.textPlan}>
              <summary>Text plan reference</summary>
              <pre>{text}</pre>
            </details>
          )}
          {copied && (
            <span className={styles.copyStatus} role="status">
              {copied}
            </span>
          )}
        </div>
        {requestLoading && (
          <div
            className={styles.loadingOverlay}
            role="status"
            aria-live="polite"
            data-testid="explain-loading-overlay"
          >
            <span className={styles.spinner} aria-hidden="true" />
            <strong>{loadingMessage}</strong>
          </div>
        )}
      </div>
    </section>
  )
}
