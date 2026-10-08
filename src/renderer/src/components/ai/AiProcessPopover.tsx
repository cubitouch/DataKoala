import type { ReactNode } from 'react'
import { Popover } from '@components/ui/Popover'
import { AI_PRIVACY_NOTICE } from '@shared/ai'
import styles from './Ai.module.css'

export function AiProcessPopover({
  ariaLabel = 'View AI details',
  subtitle,
  providerLabel,
  sent,
  response,
  responseNote,
  privacyNote,
  children,
}: {
  ariaLabel?: string
  subtitle: string
  providerLabel: string
  sent: boolean
  response?: ReactNode
  responseNote?: ReactNode
  privacyNote: ReactNode
  children: ReactNode
}) {
  return (
    <Popover
      trigger={<span className={styles.contextTriggerIcon}>i</span>}
      ariaLabel={ariaLabel}
      className={styles.processPopover}
      triggerClassName={styles.processTrigger}
      preferredWidth={720}
      maxHeight={680}
      contentClassName={styles.context}
    >
      <header className={styles.contextHeader}>
        <div>
          <strong>AI details</strong>
          <div className={styles.contextHeaderSubtitle}>{subtitle}</div>
        </div>
        <span className={styles.contextProvider}>{providerLabel}</span>
      </header>

      {response && (
        <section className={styles.responseCard} aria-label="AI response">
          <div className={styles.contextLabel}>AI response</div>
          <div className={styles.responseContent}>{response}</div>
          {responseNote && (
            <p className={styles.responseHint}>{responseNote}</p>
          )}
        </section>
      )}

      <div className={styles.contextDivider} />
      <div className={styles.contextLabel}>
        {sent ? 'Submitted context' : 'Context to send'}
      </div>
      <div className={styles.contextPayload}>{children}</div>

      <aside className={styles.contextInfo}>
        <strong>About this request</strong>
        <p>{AI_PRIVACY_NOTICE}</p>
        <p>{privacyNote}</p>
      </aside>
    </Popover>
  )
}
