import { useEffect, useRef, useState } from 'react'
import { ConfirmationDialog } from '@components/ui/ConfirmationDialog'
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
  useEffect(() => {
    setResetTabId(null)
  }, [active.id, active.connectionProfileId])
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
      {resetTabId === active.id && (
        <ConfirmationDialog
          key={resetTabId}
          title="Reset exploration?"
          description={
            <>
              This will clear the query, Builder state, and current results in “
              {active.title}”. Your connection and time range will be kept.
            </>
          }
          confirmLabel="Reset exploration"
          onCancel={close}
          returnFocusRef={triggerRef}
          disabled={active.running || busy}
          onConfirm={() => {
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
        />
      )}
    </div>
  )
}
