import { useEffect, useRef, useState } from 'react'
import { selectActiveSession, useStore } from '@store/useStore'
import styles from './NotificationArea.module.css'

export type NotificationDetail = {
  message: string
  tone?: 'status' | 'error'
  details?: string
  duration?: number
}
export const NOTIFICATION_EVENT = 'datakoala:notification'

export function notify(detail: NotificationDetail): void {
  window.dispatchEvent(
    new CustomEvent<NotificationDetail>(NOTIFICATION_EVENT, { detail }),
  )
}

export function NotificationArea() {
  const [notification, setNotification] = useState<NotificationDetail | null>(
    null,
  )
  const timer = useRef<number | null>(null)
  const root = useRef<HTMLDivElement | null>(null)
  const sourceFocus = useRef<HTMLElement | null>(null)
  const builderFilterNotice = useStore(
    (state) => selectActiveSession(state).builderFilterNotice,
  )
  const clearBuilderFilterNotice = useStore(
    (state) => state.clearBuilderFilterNotice,
  )

  const show = (detail: NotificationDetail) => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    if (
      document.activeElement instanceof HTMLElement &&
      !root.current?.contains(document.activeElement)
    )
      sourceFocus.current = document.activeElement
    setNotification(detail)
    // Interactive diagnostics stay available until explicitly dismissed or replaced.
    if (!detail.details)
      timer.current = window.setTimeout(
        () => setNotification(null),
        detail.duration ?? 2600,
      )
  }

  useEffect(() => {
    const onNotification = (event: Event) =>
      show((event as CustomEvent<NotificationDetail>).detail)
    window.addEventListener(NOTIFICATION_EVENT, onNotification)
    return () => {
      window.removeEventListener(NOTIFICATION_EVENT, onNotification)
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  useEffect(() => {
    if (!builderFilterNotice) return
    show({ message: builderFilterNotice.message })
    clearBuilderFilterNotice(builderFilterNotice.id)
  }, [builderFilterNotice, clearBuilderFilterNotice])

  const dismiss = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    const restoreFocus = root.current?.contains(document.activeElement)
    setNotification(null)
    if (restoreFocus && sourceFocus.current?.isConnected)
      sourceFocus.current.focus({ preventScroll: true })
  }

  return notification ? (
    <div
      ref={root}
      className={`${styles.root}${notification.tone === 'error' ? ` ${styles.error}` : ''}`}
      role={notification.tone === 'error' ? 'alert' : 'status'}
      aria-live={notification.tone === 'error' ? 'assertive' : 'polite'}
    >
      <div className={styles.messageRow}>
        <span>{notification.message}</span>
        {notification.details && (
          <button
            type="button"
            className="btn ghost"
            aria-label="Dismiss notification"
            onClick={dismiss}
          >
            Dismiss
          </button>
        )}
      </div>
      {notification.details && (
        <details className={styles.details}>
          <summary>Details</summary>
          <div>{notification.details}</div>
        </details>
      )}
    </div>
  ) : null
}
