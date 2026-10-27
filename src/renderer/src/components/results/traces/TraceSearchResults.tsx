import { ChartPicker } from '@components/results/ChartPicker'
import type { ReactNode } from 'react'
import type { TraceRow } from '@lib/traceViewer'
import type { TraceResultView } from '@lib/tempoQueryState'
export type { TraceResultView } from '@lib/tempoQueryState'
import styles from './TraceSearchResults.module.css'

interface TraceSearchResultsProps {
  rows: TraceRow[]
  fetchedTraceCount?: number
  locallyFiltered?: boolean
  sampled?: boolean
  notice: string
  loading: 'search' | 'trace' | null
  resultView: TraceResultView
  onResultViewChange: (view: TraceResultView) => void
  listView: ReactNode
  scatterView: ReactNode
  serviceMapView: ReactNode
}

export function TraceSearchResults({
  rows,
  fetchedTraceCount = rows.length,
  locallyFiltered = false,
  sampled = false,
  notice,
  loading,
  resultView,
  onResultViewChange,
  listView,
  scatterView,
  serviceMapView,
}: TraceSearchResultsProps) {
  const hasResults = fetchedTraceCount > 0

  return (
    <div
      className={styles.searchResults}
      aria-busy={loading !== null}
      style={{ gridRow: 5 }}
    >
      <div className={styles.viewBar} data-trace-view-bar>
        <ChartPicker
          value={resultView}
          onChange={onResultViewChange}
          availableViews={['list', 'scatter', 'service-map']}
          disabledViews={loading === 'search' ? ['service-map'] : []}
        />
        <strong
          className={styles.count}
          data-trace-count
          title={notice || undefined}
        >
          {rows.length} {sampled ? 'sampled ' : ''}
          {rows.length === 1 ? 'trace' : 'traces'}
          {loading === 'search' ? ' so far' : ''}
        </strong>
      </div>
      {loading !== 'search' &&
        notice &&
        !notice.startsWith('Tempo search ·') && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
      {locallyFiltered && rows.length === 0 && resultView !== 'scatter' ? (
        <div className={styles.empty}>
          No retrieved traces in this local interval. Remove the filter to
          restore results.
        </div>
      ) : !hasResults ? (
        <div className={styles.empty}>
          {loading === 'search'
            ? 'Waiting for the first Tempo trace summaries…'
            : 'Search for a trace by service, operation, status or duration; use Trace ID above when you already know the exact trace.'}
        </div>
      ) : resultView === 'scatter' ? (
        <div className={styles.scatter} data-trace-scatter="">
          {locallyFiltered && rows.length === 0 && (
            <p role="status">
              No retrieved traces in this local interval. Remove the filter to
              restore results.
            </p>
          )}
          {scatterView}
        </div>
      ) : resultView === 'service-map' ? (
        serviceMapView
      ) : (
        listView
      )}
    </div>
  )
}
