import {
  DEFAULT_DETAIL_PANEL_WIDTH,
  ResizableDetailPanel,
} from '@components/ui/ResizableDetailPanel'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LokiLogRow } from '@shared/loki'
import {
  clusterLogPatterns,
  type LogPatternCluster,
} from '@shared/log-patterns'
import { effectiveLogMessage } from '@lib/lokiLogMessage'
import {
  LogRowChevron,
  LogSeverityBadge,
} from './LogRowPresentation'
import { representativeLogSeverity } from './logSeverity'
import styles from './LogPatternExplorer.module.css'

const clusterCache = new WeakMap<LokiLogRow[], LogPatternCluster[]>()

function clustersFor(rows: LokiLogRow[]): LogPatternCluster[] {
  const cached = clusterCache.get(rows)
  if (cached) return cached
  const records = rows.map((row) => ({
    id: row.id,
    message: effectiveLogMessage(row),
    timestampMs: row.timestampMs,
    severity: row.severity,
  }))
  const clusters = clusterLogPatterns(records)
  clusterCache.set(rows, clusters)
  return clusters
}

function PatternTemplate({ cluster }: { cluster: LogPatternCluster }) {
  return (
    <>
      {cluster.segments.map((segment, index) => (
        <span
          key={index}
          className={segment.variable ? styles.variable : styles.literal}
        >
          {segment.text}
          {index < cluster.segments.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  )
}

function severityEntries(cluster: LogPatternCluster) {
  return Object.entries(cluster.severities).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )
}

export function LogPatternExplorer({
  rows,
  onViewLogs,
}: {
  rows: LokiLogRow[]
  onViewLogs: (cluster: LogPatternCluster) => void
}) {
  const clusters = useMemo(() => clustersFor(rows), [rows])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inspectorWidth, setInspectorWidth] = useState(
    DEFAULT_DETAIL_PANEL_WIDTH,
  )
  const scroller = useRef<HTMLDivElement>(null)
  const selected = clusters.find((cluster) => cluster.id === selectedId) ?? null
  const virtualizer = useVirtualizer({
    count: clusters.length,
    getScrollElement: () => scroller.current,
    getItemKey: (index) => clusters[index].id,
    estimateSize: () => 58,
    overscan: 6,
    gap: 0,
    initialRect: { width: 800, height: 600 },
  })

  useEffect(() => {
    if (selectedId && !clusters.some((cluster) => cluster.id === selectedId))
      setSelectedId(null)
  }, [clusters, selectedId])

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])

  const inspector = selected ? (
    <div className={styles.inspector} data-pattern-inspector>
      <header>
        <strong>Pattern details</strong>
        <div className={styles.inspectorActions}>
          <button
            type="button"
            className="btn primary"
            onClick={() => onViewLogs(selected)}
          >
            View logs
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setSelectedId(null)}
            aria-label="Close pattern details"
          >
            Close
          </button>
        </div>
      </header>
      <div className={styles.inspectorBody}>
        <section>
          <h3>Template</h3>
          <code className={styles.fullTemplate}>
            <PatternTemplate cluster={selected} />
          </code>
        </section>
        <section className={styles.inspectorMetrics}>
          <div>
            <strong>{selected.count}</strong>
            <span>logs</span>
          </div>
          <div>
            <strong>{selected.percentage.toFixed(1)}%</strong>
            <span>of loaded logs</span>
          </div>
        </section>
        <section>
          <h3>Severity</h3>
          <div className={styles.severities}>
            {severityEntries(selected).map(([severity]) => (
              <LogSeverityBadge key={severity} severity={severity} />
            ))}
          </div>
        </section>
        <section>
          <h3>Seen</h3>
          <dl className={styles.times}>
            <div>
              <dt>First</dt>
              <dd>{new Date(selected.firstTimestampMs).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Last</dt>
              <dd>{new Date(selected.lastTimestampMs).toLocaleString()}</dd>
            </div>
          </dl>
        </section>
        <section>
          <h3>Example messages</h3>
          <ul className={styles.examples}>
            {selected.examples.map((example) => (
              <li key={example.id}>{example.message}</li>
            ))}
          </ul>
        </section>
        {selected.variables.some(({ values }) => values.length) && (
          <section>
            <h3>Variable samples</h3>
            <dl className={styles.variables}>
              {selected.variables
                .filter(({ values }) => values.length)
                .map((variable, index) => (
                  <div key={index}>
                    <dt>{variable.placeholder}</dt>
                    <dd>{variable.values.join(', ')}</dd>
                  </div>
                ))}
            </dl>
          </section>
        )}
      </div>
    </div>
  ) : undefined

  return (
    <section className={styles.root} aria-label="Log patterns">
      <div className={styles.stats}>
        {clusters.length} patterns · {rows.length} loaded logs
      </div>
      {!clusters.length ? (
        <div className={styles.empty}>No logs to cluster.</div>
      ) : (
        <ResizableDetailPanel
          detailLabel="Selected pattern details"
          detail={inspector}
          width={inspectorWidth}
          onWidthChange={setInspectorWidth}
        >
          <div ref={scroller} className={styles.scroller} data-pattern-scroller>
            <div
              className={styles.spacer}
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((item) => {
                const cluster = clusters[item.index]
                const active = cluster.id === selectedId
                return (
                  <article
                    data-index={item.index}
                    data-pattern-row
                    className={styles.row}
                    key={cluster.id}
                    style={{ transform: `translateY(${item.start}px)` }}
                  >
                    <button
                      className={styles.summary}
                      type="button"
                      aria-selected={active}
                      onClick={() => setSelectedId(active ? null : cluster.id)}
                    >
                      <span className={styles.metrics}>
                        <strong>{cluster.count}</strong> logs ·{' '}
                        {cluster.percentage.toFixed(1)}%
                      </span>
                      <span className={styles.severitySlot}>
                        {representativeLogSeverity(cluster.severities) && (
                          <LogSeverityBadge
                            severity={
                              representativeLogSeverity(cluster.severities)!
                            }
                          />
                        )}
                      </span>
                      <code>
                        <PatternTemplate cluster={cluster} />
                      </code>
                      <LogRowChevron />
                    </button>
                  </article>
                )
              })}
            </div>
          </div>
        </ResizableDetailPanel>
      )}
    </section>
  )
}
