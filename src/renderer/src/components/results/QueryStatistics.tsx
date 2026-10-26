import { useId, useRef, useState } from 'react'
import { Modal } from '@components/ui/Modal'
import type { QueryResult } from '@shared/types'
import styles from './QueryStatistics.module.css'

const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** Read only the displayed result. No provider requests or independent metadata state. */
export function QueryStatistics({
  result,
  visibleRowCount = result.rowCount,
  className,
}: {
  result: QueryResult
  visibleRowCount?: number
  className?: string
}) {
  const [detailsResult, setDetailsResult] = useState<QueryResult | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const execution = result.execution
  const rows =
    visibleRowCount === result.rowCount
      ? String(result.rowCount)
      : `${visibleRowCount} of ${result.rowCount}`
  if (execution?.provider !== 'bigquery')
    return (
      <span className={className}>
        {rows} rows · {result.columns.length} cols · {result.durationMs} ms
      </span>
    )
  const script = execution.statisticsScope === 'script'
  const scope = script ? 'Script job' : 'Job'
  const metrics = [
    count(execution.totalRows)
      ? `${execution.totalRows} total ${script ? 'final-statement ' : ''}rows`
      : null,
    execution.truncated ? 'capped · more rows available' : null,
    count(result.durationMs) ? `${result.durationMs} ms request` : null,
    count(execution.providerDurationMs)
      ? `${scope}: ${execution.providerDurationMs} ms elapsed`
      : null,
    count(execution.bytesProcessed)
      ? `${scope}: ${execution.bytesProcessed} B processed`
      : null,
    count(execution.bytesBilled)
      ? `${scope}: ${execution.bytesBilled} B billed`
      : null,
    count(execution.slotMs) ? `${scope}: ${execution.slotMs} slot-ms` : null,
    typeof execution.cacheHit === 'boolean'
      ? `${scope}: cache ${execution.cacheHit ? 'hit' : 'miss'}`
      : null,
  ].filter((metric): metric is string => metric !== null)
  return (
    <span
      className={`${styles.statistics}${className ? ` ${className}` : ''}`}
      data-query-statistics
    >
      <span>
        {rows} returned {script ? 'final-statement ' : ''}rows ·{' '}
        {result.columns.length} cols
        {count(result.durationMs) ? ` · ${result.durationMs} ms request` : ''}
        {execution.truncated ? ' · capped' : ''}
      </span>
      <button
        ref={trigger}
        type="button"
        className="btn ghost"
        aria-label="Query statistics"
        onClick={() => setDetailsResult(result)}
      >
        Query statistics
      </button>
      <Modal
        open={detailsResult === result}
        labelledBy={titleId}
        returnFocusRef={trigger}
        onClose={() => setDetailsResult(null)}
      >
        <h2 id={titleId}>Query statistics</h2>
        <p>
          {rows} returned {script ? 'final-statement ' : ''}rows ·{' '}
          {result.columns.length} cols
        </p>
        {script && (
          <p>
            Processing, billing and elapsed metrics describe the parent Script
            job; output rows describe its final statement.
          </p>
        )}
        <ul className={styles.details}>
          {metrics.map((metric) => (
            <li key={metric}>{metric}</li>
          ))}
        </ul>
        <button
          type="button"
          className="btn ghost"
          onClick={() => setDetailsResult(null)}
        >
          Close
        </button>
      </Modal>
    </span>
  )
}
