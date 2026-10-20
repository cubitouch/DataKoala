import { useId, useRef, useState, type ReactNode } from 'react'
import { Modal } from './Modal'
import styles from './ConfirmationDialog.module.css'

/** The caller captures a target and owns its validity; key by target identity. */
export function ConfirmationDialog({
  open = true,
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
  returnFocusRef,
  disabled = false,
  restoreFocus = true,
}: {
  open?: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void | Promise<void>
  returnFocusRef?: React.RefObject<HTMLElement | null>
  disabled?: boolean
  restoreFocus?: boolean
}) {
  const titleId = useId()
  const descriptionId = useId()
  const locked = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirm = async () => {
    if (locked.current || disabled) return
    locked.current = true
    setPending(true)
    setError(null)
    try {
      await onConfirm()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      locked.current = false
      setPending(false)
    }
  }
  const cancel = () => {
    if (!locked.current) onCancel()
  }
  return (
    <Modal
      open={open}
      onClose={cancel}
      labelledBy={titleId}
      describedBy={descriptionId}
      returnFocusRef={returnFocusRef}
      restoreFocus={restoreFocus}
      dialogClassName={styles.dialog}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      {error && (
        <p role="alert">
          {confirmLabel} failed: {error} Try again.
        </p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className="btn ghost"
          onClick={cancel}
          disabled={pending}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn danger"
          onClick={() => void confirm()}
          disabled={disabled || pending}
          aria-busy={pending}
        >
          {pending ? `${confirmLabel}…` : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
