import { AiQueryExplanation } from '@components/ai/AiQueryExplanation'
import { useAiConfigured } from '@lib/ai/useAiConfigured'
import { selectActiveSession, useStore } from '@store/useStore'
import styles from './ExplainPane.module.css'

export function ExplainPane() {
  const configured = useAiConfigured()
  const session = useStore(selectActiveSession)
  const snapshot = session.explainSnapshot
  const postgres = useStore(
    (s) =>
      s.profiles.find((p) => p.id === session.connectionProfileId)?.kind ===
      'postgres',
  )
  const show = useStore((s) => selectActiveSession(s).showExplain)
  const text = useStore((s) => selectActiveSession(s).explainText)
  const setShow = useStore((s) => s.setShowExplain)
  const activeExplainRequest = useStore(
    (s) => selectActiveSession(s).activeExplainRequest,
  )
  const loadingMessage =
    activeExplainRequest === 'analyze'
      ? 'Running EXPLAIN ANALYZE…'
      : activeExplainRequest === 'explain'
        ? 'Generating query plan…'
        : null
  if (!show || (!text && !loadingMessage && !snapshot)) return null
  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <span>
          {snapshot?.mode === 'analyze'
            ? 'EXPLAIN ANALYZE'
            : snapshot?.mode === 'semantic'
              ? 'EXPLAIN QUERY'
              : 'EXPLAIN'}
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
        {snapshot && postgres && configured && !activeExplainRequest && (
          <AiQueryExplanation
            key={`${session.id}:${session.connectionProfileId}:${snapshot.mode}:${snapshot.query}`}
            snapshot={{
              tabId: session.id,
              profileId: session.connectionProfileId,
              query: snapshot.query,
            }}
          />
        )}
        {snapshot && snapshot.query !== session.sql && (
          <p className={styles.status}>
            The editor has changed. This view describes the SQL captured when
            you opened it.
          </p>
        )}
        {text && (
          <details open>
            <summary className={styles.status}>Database plan</summary>
            <pre className={styles.plan}>{text}</pre>
          </details>
        )}
      </div>
    </div>
  )
}
