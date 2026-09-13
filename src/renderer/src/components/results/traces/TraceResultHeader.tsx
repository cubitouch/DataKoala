import { traceDurationLabel } from './tracePresentation'
import { traceSpanKindLabel } from '../../../lib/traceViewer'
import styles from './TraceResultHeader.module.css'

interface TraceResultHeaderProps {
  traceId: string
  service: string
  operation: string
  durationMs: number
  visibleSpanCount: number
  totalSpanCount: number
  serviceCount: number
  errorCount: number
  spanKinds: string[]
  spanKindCounts: Record<string, number>
  hiddenSpanKinds: Set<string>
  hideAsyncBranches: boolean
  asyncPrunedCount: number
  hasAsyncKinds: boolean
  compressIdleGaps: boolean
  showBackToResults: boolean
  onBackToResults: () => void
  onExploreSimilar: () => void
  onToggleSpanKind: (kind: string) => void
  onToggleAsyncBranches: () => void
  onToggleIdleCompression: () => void
  onShowAllKinds: () => void
}

export function TraceResultHeader({ traceId, service, operation, durationMs, visibleSpanCount, totalSpanCount, serviceCount, errorCount, spanKinds, spanKindCounts, hiddenSpanKinds, hideAsyncBranches, asyncPrunedCount, hasAsyncKinds, compressIdleGaps, showBackToResults, onBackToResults, onExploreSimilar, onToggleSpanKind, onToggleAsyncBranches, onToggleIdleCompression, onShowAllKinds }: TraceResultHeaderProps) {
  return <>
    <header className={styles.traceHeader}>
      <div className={styles.traceTitle}>
        {showBackToResults && <button type="button" className="btn ghost" onClick={onBackToResults}>← Search results</button>}
        <div><h2>{service || 'Trace'} · {operation || traceId}</h2><code>{traceId}</code></div>
        <button type="button" className="btn ghost" onClick={onExploreSimilar}>Explore similar traces</button>
      </div>
      <dl className={styles.summary}>
        <div><dt>Duration</dt><dd>{traceDurationLabel(durationMs)}</dd></div>
        <div><dt>Spans</dt><dd>{visibleSpanCount === totalSpanCount ? totalSpanCount : `${visibleSpanCount}/${totalSpanCount}`}</dd></div>
        <div><dt>Services</dt><dd>{serviceCount}</dd></div>
        <div><dt>Errors</dt><dd>{errorCount}</dd></div>
      </dl>
    </header>

    {spanKinds.length > 0 && <div className={styles.filterToolbar}>
      <span>Span kind</span>
      <div className={styles.modeSwitch} role="group" aria-label="Visible span kinds">
        {spanKinds.map((kind) => {
          const visible = !hiddenSpanKinds.has(kind)
          return <button key={kind} type="button" className={visible ? styles.modeActive : ''} aria-pressed={visible} onClick={() => onToggleSpanKind(kind)} title={kind === 'INTERNAL' ? 'In-process/code spans; turn this off to reduce application-code noise.' : `Show or hide ${kind} spans`}><span>{traceSpanKindLabel(kind)}</span><strong>{spanKindCounts[kind] ?? 0}</strong></button>
        })}
      </div>
      <span>{visibleSpanCount}/{totalSpanCount} shown{hideAsyncBranches && asyncPrunedCount > 0 ? ` · ${asyncPrunedCount} async-branch spans hidden` : ''}.</span>
      {hasAsyncKinds && <button type="button" className="btn ghost" aria-pressed={hideAsyncBranches} onClick={onToggleAsyncBranches} title="Hide non-root Producer/Consumer branches and their descendants so delayed messaging work does not dominate the waterfall.">{hideAsyncBranches ? 'Show async branches' : 'Hide async branches'}</button>}
      <button type="button" className="btn ghost" aria-pressed={compressIdleGaps} onClick={onToggleIdleCompression} title="Compress long periods with no visible leaf-span activity. Span ordering and real duration labels remain unchanged; shaded breaks mark transformed idle time.">{compressIdleGaps ? 'Use wall-clock scale' : 'Compress idle gaps'}</button>
      {hiddenSpanKinds.size > 0 && <button type="button" className="btn ghost" onClick={onShowAllKinds}>Show all kinds</button>}
    </div>}
  </>
}
