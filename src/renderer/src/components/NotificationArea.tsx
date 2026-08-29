import { useEffect, useRef, useState } from 'react'
import { selectActiveSession, useStore } from '../store/useStore'
import styles from './NotificationArea.module.css'

export type NotificationDetail = { message: string; tone?: 'status' | 'error'; duration?: number }
export const NOTIFICATION_EVENT = 'datakoala:notification'

export function notify(detail: NotificationDetail): void {
  window.dispatchEvent(new CustomEvent<NotificationDetail>(NOTIFICATION_EVENT, { detail }))
}

export function NotificationArea() {
  const [notification, setNotification] = useState<NotificationDetail | null>(null)
  const timer = useRef<number | null>(null)
  const builderFilterNotice = useStore((state) => selectActiveSession(state).builderFilterNotice)
  const clearBuilderFilterNotice = useStore((state) => state.clearBuilderFilterNotice)

  const show = (detail: NotificationDetail) => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    setNotification(detail)
    timer.current = window.setTimeout(() => setNotification(null), detail.duration ?? 2600)
  }

  useEffect(() => {
    const onNotification = (event: Event) => show((event as CustomEvent<NotificationDetail>).detail)
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

  return notification ? <div className={`${styles.root}${notification.tone === 'error' ? ` ${styles.error}` : ''}`} role={notification.tone === 'error' ? 'alert' : 'status'} aria-live={notification.tone === 'error' ? 'assertive' : 'polite'}>{notification.message}</div> : null
}
