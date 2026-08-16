import React, { useEffect, useRef, useState } from 'react'
import styles from './NotificationArea.module.css'
void React

export type NotificationDetail = { message: string; tone?: 'status' | 'error'; duration?: number }
export const NOTIFICATION_EVENT = 'datakoala:notification'

export function notify(detail: NotificationDetail): void {
  window.dispatchEvent(new CustomEvent<NotificationDetail>(NOTIFICATION_EVENT, { detail }))
}

export function NotificationArea() {
  const [notification, setNotification] = useState<NotificationDetail | null>(null)
  const timer = useRef<number | null>(null)
  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<NotificationDetail>).detail
      if (timer.current !== null) window.clearTimeout(timer.current)
      setNotification(detail)
      timer.current = window.setTimeout(() => setNotification(null), detail.duration ?? 2600)
    }
    window.addEventListener(NOTIFICATION_EVENT, show)
    return () => { window.removeEventListener(NOTIFICATION_EVENT, show); if (timer.current !== null) window.clearTimeout(timer.current) }
  }, [])
  return notification ? <div className={`${styles.root}${notification.tone === 'error' ? ` ${styles.error}` : ''}`} role={notification.tone === 'error' ? 'alert' : 'status'} aria-live={notification.tone === 'error' ? 'assertive' : 'polite'}>{notification.message}</div> : null
}
