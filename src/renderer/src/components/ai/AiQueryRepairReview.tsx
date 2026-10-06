import { Spinner } from '@components/ui/Spinner'
import { notify } from '@components/ui/feedback/NotificationArea'
import { useAiQueryRepairController } from './AiQueryRepairProvider'
import { AiContextPopover } from './AiContextPopover'
import { AiQueryDiff } from './AiQueryDiff'
import styles from './Ai.module.css'

export function AiQueryRepairReview({ onApplied }: { onApplied: () => void }) {
  const ai = useAiQueryRepairController()
  const review = ai?.review
  if (!ai || !review) return null

  const { input, proposal, stale } = review

  return (
    <section className={styles.copilot} aria-label="AI query repair review">
      <div className={styles.composer}>
        <div className={styles.promptSlot}>
          <div className={styles.composerOverlay}>
            <div className={styles.overlayHeading}>
              {ai.busy ? (
                <span role="status">
                  <Spinner /> Generating fix…
                </span>
              ) : (
                <strong>Proposed changes</strong>
              )}
            </div>
            <div className={styles.actions}>
              {ai.busy && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={ai.cancel}
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                className="btn ghost"
                disabled={ai.busy || stale}
                onClick={() => void ai.repair()}
              >
                Try again
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={ai.busy}
                onClick={ai.reject}
              >
                Reject
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={
                  ai.busy ||
                  stale ||
                  input.snapshot.query === proposal.query
                }
                onClick={() => {
                  if (!ai.apply()) return
                  notify({
                    message:
                      'AI fix applied — review the SQL and Run when ready.',
                    duration: 3200,
                  })
                  onApplied()
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
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
      </div>
      {ai.error && (
        <div role="alert" className={`inline-error ${styles.copilotMessage}`}>
          {ai.error}
        </div>
      )}
      <div className={styles.review}>
        <div className={styles.reviewBody}>
          <AiQueryDiff
            before={input.snapshot.query}
            after={proposal.query}
          />
          {stale && (
            <div role="status" className={styles.warning}>
              The failed SQL, tab, or connection changed. Run the current SQL,
              then use Fix with AI again if it still fails.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
