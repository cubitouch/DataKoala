import styles from './LogRowPresentation.module.css'

export function LogSeverityBadge({ severity }: { severity: string }) {
  const level = severity.toUpperCase()
  return (
    <strong
      className={styles.severityBadge}
      data-log-severity={level}
      data-severity={level}
    >
      {level}
    </strong>
  )
}

/** A fixed slot exists even when a row has no reported level. */
export function LogSeverityCell({ severity }: { severity?: string | null }) {
  return (
    <span className={styles.severityCell} data-log-level-cell>
      {severity ? <LogSeverityBadge severity={severity} /> : null}
    </span>
  )
}
