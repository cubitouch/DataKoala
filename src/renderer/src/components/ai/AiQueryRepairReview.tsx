import { Spinner } from '@components/ui/Spinner'
import { notify } from '@components/ui/feedback/NotificationArea'
import { useAiQueryRepairController } from './AiQueryRepairProvider'
import { AiContextPopover } from './AiContextPopover'
import styles from './Ai.module.css'

export function AiQueryRepairReview({ onApplied }: { onApplied: () => void }) {
  const ai = useAiQueryRepairController()
  const review = ai.activeReview
  if (!review) return null

  const { input, proposal } = review
  const unchanged = ai.draft === input.snapshot.query

  return (
    <section
      className={styles.repairEditorBar}
      aria-label="AI query repair review"
    >
      <div className={styles.repairEditorCopy}>
        <strong>AI proposed fix</strong>
        <span>
          {ai.busy
            ? 'Generating another fix…'
            : 'Review or edit the proposed SQL. Apply keeps it in the editor; Run remains manual.'}
        </span>
      </div>
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
        {ai.busy ? (
          <button type="button" className="btn ghost" onClick={ai.cancel}>
            <Spinner />
            Cancel
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost"
            onClick={() => void ai.repair()}
          >
            Try again
          </button>
        )}
        <button
          type="button"
          className="btn ghost"
          disabled={ai.busy}
          onClick={ai.rejectDraft}
        >
          Reject
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={ai.busy || !ai.draft.trim() || unchanged}
          onClick={() => {
            if (!ai.applyDraft()) return
            notify({
              message: 'AI fix applied — review the SQL and Run when ready.',
              duration: 3200,
            })
            onApplied()
          }}
        >
          Apply
        </button>
      </div>
    </section>
  )
}
