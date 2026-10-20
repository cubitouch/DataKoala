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
