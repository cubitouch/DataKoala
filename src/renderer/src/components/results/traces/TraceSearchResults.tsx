import type { ReactNode } from 'react'
import type { TraceRow } from '@lib/traceViewer'
import styles from './TraceSearchResults.module.css'

export type TraceResultView = 'list' | 'scatter' | 'service-map'

interface TraceSearchResultsProps {
  rows: TraceRow[]
  notice: string
  loading: 'search' | 'trace' | null
  resultView: TraceResultView
  onResultViewChange: (view: TraceResultView) => void
  listView: ReactNode
  scatterView: ReactNode
  serviceMapView: ReactNode
}

export function TraceSearchResults({ rows, notice, loading, resultView, onResultViewChange, listView, scatterView, serviceMapView }: TraceSearchResultsProps) {
  const hasResults = rows.length > 0

  return <div className={styles.searchResults} aria-busy={loading !== null} style={{ gridRow: 5 }}>
    <header className={styles.resultsHeader}>
      <div><h2>Trace search</h2><p>{notice || 'Use the Builder or TraceQL to find candidate traces.'}</p></div>
      <div className={styles.resultsHeaderActions}>
        {hasResults && <div className={styles.resultViewSwitch} role="group" aria-label="Trace search result view">
          <button type="button" className={resultView === 'list' ? styles.modeActive : ''} aria-pressed={resultView === 'list'} onClick={() => onResultViewChange('list')}>List</button>
          <button type="button" className={resultView === 'scatter' ? styles.modeActive : ''} aria-pressed={resultView === 'scatter'} onClick={() => onResultViewChange('scatter')}>Scatter</button>
          <button type="button" className={resultView === 'service-map' ? styles.modeActive : ''} aria-pressed={resultView === 'service-map'} disabled={loading === 'search'} onClick={() => onResultViewChange('service-map')}>Service map</button>
        </div>}
        {hasResults && <strong>{rows.length} traces{loading === 'search' ? ' so far' : ''}</strong>}
      </div>
    </header>
    {!hasResults
      ? <div className={styles.empty}>{loading === 'search' ? 'Waiting for the first Tempo trace summaries…' : 'Search for a trace by service, operation, status or duration; use Trace ID above when you already know the exact trace.'}</div>
      : resultView === 'scatter'
        ? <div className={styles.scatter} data-trace-scatter="">{scatterView}</div>
        : resultView === 'service-map' ? serviceMapView : listView}
  </div>
}
