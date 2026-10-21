import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './Modal.module.css'

const focusable =
  'button:not([disabled]):not([tabindex="-1"]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({
  open,
  onClose,
  labelledBy,
  returnFocusRef,
  restoreFocus = true,
  describedBy,
  initialFocus = 'first',
  dialogClassName,
  children,
}: {
  open: boolean
  onClose: () => void
  labelledBy: string
  returnFocusRef?: React.RefObject<HTMLElement | null>
  restoreFocus?: boolean
  describedBy?: string
  initialFocus?: 'first' | 'dialog'
  dialogClassName?: string
  children: ReactNode
}) {
  const dialog = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useLayoutEffect(() => {
    if (!open) return
    const origin =
      returnFocusRef?.current ?? (document.activeElement as HTMLElement | null)
    const isTop = () =>
      dialog.current?.parentElement ===
      Array.from(document.querySelectorAll('[data-modal-backdrop]')).at(-1)
    const items = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(focusable) ?? [],
      ).filter(
        (item) =>
          !item.closest('[hidden], [inert], [aria-hidden="true"]') &&
          getComputedStyle(item).display !== 'none' &&
          getComputedStyle(item).visibility !== 'hidden' &&
          (typeof item.checkVisibility !== 'function' ||
            item.checkVisibility({ visibilityProperty: true })),
      )
    {
      const target =
        initialFocus === 'dialog'
          ? dialog.current
          : (items()[0] ?? dialog.current)
      target?.focus()
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isTop()) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog.current) return
      const controls = items()
      if (!controls.length) {
        event.preventDefault()
        dialog.current.focus()
        return
      }
      const first = controls[0],
        last = controls.at(-1)!
      if (
        event.shiftKey &&
        (document.activeElement === dialog.current ||
          document.activeElement === first ||
          !dialog.current.contains(document.activeElement))
      ) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.current.contains(document.activeElement) ||
          document.activeElement === dialog.current)
      ) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    window.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      window.removeEventListener('keydown', keydown)
      if (restoreFocus)
        requestAnimationFrame(() => {
          if (
            origin?.isConnected &&
            !document.querySelector('[data-modal-backdrop]')
          )
            origin.focus()
        })
    }
  }, [initialFocus, open, restoreFocus, returnFocusRef])
  if (!open) return null
  return createPortal(
    <div
      className={styles.backdrop}
      data-modal-backdrop
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialog}
        className={`${styles.dialog}${dialogClassName ? ` ${dialogClassName}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
