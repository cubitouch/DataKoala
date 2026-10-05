import { Spinner } from '@components/ui/Spinner'
import { notify } from '@components/ui/feedback/NotificationArea'
import { useAiQueryRepair } from '@lib/ai/useAiQueryRepair'
import { AiContextPopover } from './AiContextPopover'
import { AiQueryDiff } from './AiQueryDiff'
import styles from './Ai.module.css'

export function AiQueryRepair() {
  const ai = useAiQueryRepair()
  if (!ai.visible && !ai.busy && !ai.review) return null
  if (ai.busy)
    return (
      <div className={styles.actions} role="status">
        <span>
          <Spinner /> Fixing with AI…
        </span>
        <button type="button" className="btn ghost" onClick={ai.cancel}>
          Cancel
        </button>
      </div>
    )
  if (!ai.review)
    return (
      <div>
        <button
          type="button"
          className="btn ghost"
          onClick={() => void ai.repair()}
        >
          Fix with AI
        </button>
        {ai.error && <div role="alert">{ai.error}</div>}
      </div>
    )
  const { input, proposal, stale } = ai.review
  return (
    <section className={styles.review} aria-label="AI query repair proposal">
      <strong>Proposed fix</strong>
      <div className={styles.reviewBody}>
        <AiQueryDiff before={input.snapshot.query} after={proposal.query} />
      </div>
      {stale && (
        <div role="status" className={styles.warning}>
          The failed SQL, tab, or connection changed. Try again against the
          latest failure.
        </div>
      )}
      <div className={styles.actions}>
        <AiContextPopover
          operation="Fix with AI"
          datasourceError={input.error}
          queryLabel="Failed SQL"
          prompt=""
          query={input.snapshot.query}
          context={input.context}
          discovery={input.discovery ?? null}
          preparing={false}
          sent
          proposal={proposal}
        />
        <button
          type="button"
          className="btn ghost"
          onClick={() => void ai.repair()}
        >
          Try again
        </button>
        <button type="button" className="btn ghost" onClick={ai.reject}>
          Reject
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={stale}
          onClick={() => {
            ai.apply()
            notify({
              message: 'AI fix applied — review the SQL and Run when ready.',
              duration: 3200,
            })
          }}
        >
          Apply
        </button>
      </div>
      {ai.error && <div role="alert">{ai.error}</div>}
    </section>
  )
}
