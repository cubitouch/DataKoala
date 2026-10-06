import { Spinner } from '@components/ui/Spinner'
import { notify } from '@components/ui/feedback/NotificationArea'
import { useAiQueryRepair } from '@lib/ai/useAiQueryRepair'
import { AiContextPopover } from './AiContextPopover'
import { AiQueryDiff } from './AiQueryDiff'
import styles from './Ai.module.css'

function RepairFailure({ message }: { message: string }) {
  return (
    <div className={styles.repairFailure} role="status" aria-live="polite">
      <strong>AI repair</strong>
      <div>{message}</div>
    </div>
  )
}

export function AiQueryRepair() {
  const ai = useAiQueryRepair()
  if (!ai.visible && !ai.busy && !ai.review) return null
  if (ai.busy)
    return (
      <div className={styles.repairBusy} role="status">
        <span className={styles.repairBusyLabel}>
          <Spinner />
          <span>Fixing with AI…</span>
        </span>
        <button type="button" className="btn ghost" onClick={ai.cancel}>
          Cancel
        </button>
      </div>
    )
  if (!ai.review)
    return (
      <>
        <button
          type="button"
          className={`btn ghost ${styles.repairControl}`}
          onClick={() => void ai.repair()}
        >
          Fix with AI
        </button>
        {ai.error && <RepairFailure message={ai.error} />}
      </>
    )
  const { input, proposal, stale } = ai.review
  return (
    <section
      className={`${styles.review} ${styles.repairReview}`}
      aria-label="AI query repair proposal"
    >
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
      {ai.error && <RepairFailure message={ai.error} />}
      <div className={styles.actions}>
        <AiContextPopover
          operation="Fix with AI"
          datasourceError={input.error}
          queryLabel="Failed SQL"
          showPrompt={false}
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
            if (ai.apply())
              notify({
                message: 'AI fix applied — review the SQL and Run when ready.',
                duration: 3200,
              })
          }}
        >
          Apply
        </button>
      </div>
    </section>
  )
}
