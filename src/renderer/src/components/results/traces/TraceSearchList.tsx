import { traceResultStatus, type TraceRow } from '../../../lib/traceViewer'
import styles from './TraceSearchList.module.css'
import { traceDateTimeLabel, traceDurationLabel, traceNumber, traceText } from './tracePresentation'

interface TraceSearchListProps {
  rows: TraceRow[]
  disabled: boolean
  onOpenTrace: (traceId: string) => void
}

export function TraceSearchList({ rows, disabled, onOpenTrace }: TraceSearchListProps) {
  return <div className={styles.traceList}>{rows.map((row) => {
    const traceId = traceText(row.traceId)
    const status = traceResultStatus(row)
    return <button key={traceId} type="button" className={styles.traceResult} onClick={() => onOpenTrace(traceId)} disabled={disabled}>
      <span className={styles.resultIdentity}><span className={`${styles.resultStatus} ${status === 'error' ? styles.resultStatusError : status === 'ok' ? styles.resultStatusOk : styles.resultStatusUnknown}`} aria-label={status === 'error' ? 'Error trace' : status === 'ok' ? 'Successful trace' : 'Trace status unknown'} /><span><strong>{traceText(row.rootService) || 'unknown service'}</strong><span>{traceText(row.rootOperation) || traceId}</span></span></span>
      <span className={styles.resultMeta}><strong>{traceDurationLabel(traceNumber(row.durationMs))}</strong><span>{traceDateTimeLabel(traceNumber(row.startTimeMs))}</span><span>{traceNumber(row.matchedSpans) ? `${traceNumber(row.matchedSpans)} matched spans` : traceId}</span></span>
    </button>
  })}</div>
}
