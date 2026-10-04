import { useMemo } from 'react'
import { queryDiff } from '@lib/ai/queryDiff'
import styles from './Ai.module.css'
export function AiQueryDiff({
  before,
  after,
}: {
  before: string
  after: string
}) {
  const diff = useMemo(() => queryDiff(before, after), [before, after])
  return (
    <div className={styles.diff} role="region" aria-label="SQL proposal diff">
      {diff.slice(0, 400).map((line, index) => (
        <div key={index} data-diff-kind={line.kind} className={styles.diffLine}>
          <span
            className={styles.diffMarker}
            aria-label={
              line.kind === 'add'
                ? 'Added'
                : line.kind === 'remove'
                  ? 'Removed'
                  : 'Unchanged'
            }
          >
            {line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '}
          </span>
          <code>{line.text || ' '}</code>
        </div>
      ))}
      {diff.length > 400 && (
        <p>
          Diff preview limited to 400 lines. The complete proposed SQL is shown
          below.
        </p>
      )}
      {diff.length > 400 && (
        <details>
          <summary>Complete proposed SQL</summary>
          <pre>{after}</pre>
        </details>
      )}
    </div>
  )
}
