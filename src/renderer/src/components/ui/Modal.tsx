import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './Modal.module.css'

const focusable = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ open, onClose, labelledBy, returnFocusRef, children }: { open: boolean; onClose: () => void; labelledBy: string; returnFocusRef: React.RefObject<HTMLElement | null>; children: ReactNode }) {
  const dialog = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const origin = returnFocusRef.current
    const frame = requestAnimationFrame(() => (dialog.current?.querySelector<HTMLElement>(focusable) ?? dialog.current)?.focus())
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab' || !dialog.current) return
      const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(focusable))
      if (!items.length) { event.preventDefault(); dialog.current.focus(); return }
      const first = items[0], last = items.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', keydown); requestAnimationFrame(() => origin?.focus()) }
  }, [open, returnFocusRef])
  if (!open) return null
  return createPortal(<div className={styles.backdrop} data-modal-backdrop onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>{children}</div>
  </div>, document.body)
}
