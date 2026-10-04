const severityPriority = ['ERROR', 'WARN', 'INFO', 'DEBUG'] as const

export function representativeLogSeverity(
  severities: Readonly<Record<string, number>>,
): string | null {
  const entries = Object.entries(severities)
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => ({
      severity: severity.toUpperCase(),
      count,
    }))

  for (const severity of severityPriority) {
    if (entries.some((entry) => entry.severity === severity)) return severity
  }

  return (
    entries.sort(
      (left, right) =>
        right.count - left.count ||
        left.severity.localeCompare(right.severity),
    )[0]?.severity ?? null
  )
}
