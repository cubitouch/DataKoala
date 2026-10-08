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
  const ai = useAiPlanAnalysis()
  const [selectedNodeId, setSelectedNodeId] = useState(tree?.id ?? '')
  const [selectedDiagnosticId, setSelectedDiagnosticId] = useState<
    string | null
  >(null)
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
  const selectedDiagnostic = diagnostics.find(
    (item) => item.id === selectedDiagnosticId,
  )
  const loadingMessage =
    activeExplainRequest === 'analyze'
      ? 'Running EXPLAIN ANALYZE…'
      : activeExplainRequest === 'explain'
        ? 'Generating query plan…'
        : null

  useEffect(() => {
    setSelectedNodeId(tree?.id ?? '')
    setSelectedDiagnosticId(null)
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
  const selectedId = selected?.id ?? ''
  const highlightedIds = [
    ...(ai.highlightedNodeIds ?? []),
    ...(selectedDiagnostic?.nodeIds ?? []),
  ]
  const focusNodeId = ai.focusNodeId ?? selectedDiagnostic?.nodeIds[0] ?? null

  return (
    <section className={styles.root} aria-label="Explain results">
      <header className={styles.head}>
        <div className={styles.titleGroup}>
          <span className={styles.eyebrow}>PostgreSQL</span>
          <h1>{analyze ? 'EXPLAIN ANALYZE' : 'EXPLAIN'}</h1>
        </div>
        <div className={styles.summary} aria-label="Plan summary">
          {snapshot?.planningTimeMs !== undefined && (
            <div>
              <span>Planning</span>
              <strong>{snapshot.planningTimeMs.toFixed(2)} ms</strong>
            </div>
          )}
          {snapshot?.executionTimeMs !== undefined && (
            <div>
              <span>Execution</span>
              <strong>{snapshot.executionTimeMs.toFixed(2)} ms</strong>
            </div>
          )}
          {tree && (
            <div>
              <span>Nodes</span>
              <strong>{nodes.length}</strong>
            </div>
          )}
          {tree && (
            <div>
              <span>Diagnostics</span>
              <strong>{diagnostics.length}</strong>
            </div>
          )}
        </div>
        <div className={styles.actions}>
          {text && (
            <button
              className="btn ghost"
              onClick={() => void copy(text, 'Text plan')}
            >
              Copy text plan
            </button>
          )}
          {tree && (
            <button
              className="btn ghost"
              onClick={() =>
                void copy(JSON.stringify(tree, null, 2), 'Plan JSON')
              }
            >
              Copy plan JSON
            </button>
          )}
          {ai.configured && ai.plan && ai.context && (
            <>
              <button
                className="btn primary"
                disabled={ai.busy}
                onClick={() => void ai.analyze()}
              >
                {ai.busy ? 'Analyzing…' : 'Analyze performance'}
              </button>
              {ai.busy && (
                <button className="btn ghost" onClick={ai.cancel}>
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
          <button className="btn ghost" onClick={() => setShow(false)}>
            Close
          </button>
        </div>
      </header>
      {loadingMessage && (
        <div className={styles.status} role="status" aria-live="polite">
          {loadingMessage}
        </div>
      )}
      {snapshot && snapshot.query !== session.sql && (
        <p className={styles.snapshotNotice}>
          The editor has changed. This plan belongs to the SQL captured when
          Explain was run.
        </p>
      )}
      <div className={styles.content}>
        {tree && selected && (
          <>
            <p className={styles.planNote}>
              {analyze
                ? 'Node timing is inclusive and averaged per loop. Relative emphasis uses approximate total measured work; it does not add up to query execution time.'
                : 'Planner cost is a relative unit, not milliseconds. Plain EXPLAIN does not include runtime measurements.'}
            </p>
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
              <PlanNodeInspector node={selected} analyze={analyze} />
            </div>
          </>
        )}
        {diagnostics.length > 0 && (
          <section
            className={styles.panel}
            aria-label="Deterministic diagnostics"
          >
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.eyebrow}>From PostgreSQL metrics</span>
                <h2>Plan diagnostics</h2>
              </div>
              <p>Deterministic observations from the captured plan.</p>
            </div>
            <div className={styles.cards}>
              {diagnostics.map((diagnostic) => (
                <button
                  type="button"
                  key={diagnostic.id}
                  className={`${styles.diagnostic} ${selectedDiagnosticId === diagnostic.id ? styles.activeCard : ''}`}
                  aria-pressed={selectedDiagnosticId === diagnostic.id}
                  onClick={() => {
                    setSelectedDiagnosticId((current) =>
                      current === diagnostic.id ? null : diagnostic.id,
                    )
                    setSelectedNodeId(diagnostic.nodeIds[0] ?? selectedId)
                    setFocusRequestId((current) => current + 1)
                  }}
                >
                  <strong>{diagnostic.title}</strong>
                  <span>{diagnostic.description}</span>
                  <small>
                    {diagnostic.evidence} · node {diagnostic.nodeIds.join(', ')}
                  </small>
                </button>
              ))}
            </div>
          </section>
        )}
        {ai.configured && ai.plan && (
          <section className={styles.panel} aria-label="AI performance hints">
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.eyebrow}>Optional AI analysis</span>
                <h2>Performance hints</h2>
              </div>
              <div className={styles.inlineActions}>
                {ai.selectedHint && (
                  <button className="btn ghost" onClick={ai.clearHint}>
                    Clear selected hint
                  </button>
                )}
                {ai.error && (
                  <span className={styles.aiError} role="alert">
                    {ai.error}
                  </span>
                )}
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
                        className={`${styles.hint} ${ai.selectedHint === hint ? styles.activeCard : ''}`}
                        aria-pressed={ai.selectedHint === hint}
                        onClick={() => {
                          ai.selectHint(index)
                          if (ai.selectedHint !== hint && hint.nodeIds[0]) {
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
                Analyze this captured plan to get optional AI hints.
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
    </section>
  )
}
