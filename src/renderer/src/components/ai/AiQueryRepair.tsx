import { Spinner } from '@components/ui/Spinner'
import { useAiQueryRepairController } from './AiQueryRepairProvider'
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
  const ai = useAiQueryRepairController()

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

  if (ai.activeReview)
    return ai.error ? <RepairFailure message={ai.error} /> : null

  if (!ai.visible) return null

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
}
