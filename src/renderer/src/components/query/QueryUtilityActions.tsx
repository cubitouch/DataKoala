import { useId, useRef, useState } from 'react'
import { Modal } from '@components/ui/Modal'
import { selectActiveSession, useStore } from '@store/useStore'
import styles from './QueryUtilityActions.module.css'
import { PresetManagerAction } from './PresetManagerAction'

/** Secondary, tab-scoped actions shared by editor and Builder toolbars. */
interface QueryUtilityActionsProps {
  busy?: boolean
  onBeforeReset?: () => void
  onPresetLoaded?: () => void
}

export function QueryUtilityActions({
  busy = false,
  onBeforeReset,
  onPresetLoaded,
}: QueryUtilityActionsProps = {}) {
  const active = useStore(selectActiveSession)
  const resetQuery = useStore((state) => state.resetActiveQuery)
  const [resetTabId, setResetTabId] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const close = () => setResetTabId(null)

  return (
    <div
      className={`query-utility-actions ${styles.root}`}
      aria-label="Query utilities"
    >
      <PresetManagerAction onPresetLoaded={onPresetLoaded} />
      <button
        ref={triggerRef}
        type="button"
        className="btn ghost"
        aria-label="Reset query"
        disabled={active.running || busy}
        onClick={() => setResetTabId(active.id)}
        title="Clear the current tab's query, Builder state, and results."
      >
        Reset
      </button>
      <Modal
        open={resetTabId === active.id}
        onClose={close}
        labelledBy={titleId}
        returnFocusRef={triggerRef}
        dialogClassName={styles.resetDialog}
      >
        <h2 id={titleId}>Reset exploration?</h2>
        <p>
          This will clear the query, Builder state, and current results in “
          {active.title}”. Your connection and time range will be kept.
        </p>
        <div className={styles.dialogActions}>
          <button type="button" className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={active.running || busy}
            onClick={() => {
              if (
                busy ||
                useStore.getState().activeTabId !== resetTabId ||
                selectActiveSession(useStore.getState()).running
              )
                return
              onBeforeReset?.()
              resetQuery()
              close()
            }}
          >
            Reset exploration
          </button>
        </div>
      </Modal>
    </div>
  )
}
