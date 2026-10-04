import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LokiLogRow } from '@shared/loki'
import {
  clusterLogPatterns,
  type LogPatternCluster,
} from '@shared/log-patterns'
import { deriveLogPatternLineFilterCandidate } from '@shared/log-pattern-filter'
import { effectiveLogMessage } from '@lib/lokiLogMessage'
import { ResizableDetailPanel } from '@components/results/ResizableDetailPanel'
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

function Template({ cluster }: { cluster: LogPatternCluster }) {
  return (
    <code>
      {cluster.segments.map((segment, index) => (
        <span
          key={index}
          className={segment.variable ? styles.variable : styles.literal}
        >
          {segment.text}
          {index < cluster.segments.length - 1 ? ' ' : ''}
        </span>
      ))}
    </code>
  )
}

export function LogPatternExplorer({
  rows,
  onFilterPattern,
}: {
  rows: LokiLogRow[]
  onFilterPattern: (
    cluster: LogPatternCluster,
    lineContains: string | null,
  ) => void
}) {
  const clusters = useMemo(() => clustersFor(rows), [rows])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inspectorWidth, setInspectorWidth] = useState(390)
  const scroller = useRef<HTMLDivElement>(null)
  const selected = clusters.find((cluster) => cluster.id === selectedId) ?? null
  const messagesById = useMemo(
    () =>
      new Map(rows.map((row) => [row.id, effectiveLogMessage(row)] as const)),
    [rows],
  )
  const lineContains = useMemo(
    () =>
      selected
        ? deriveLogPatternLineFilterCandidate(
            selected,
            selected.memberIds.flatMap((id) => {
              const message = messagesById.get(id)
              return message === undefined ? [] : [message]
            }),
          )
        : null,
    [messagesById, selected],
  )
  const virtualizer = useVirtualizer({
    count: clusters.length,
    getScrollElement: () => scroller.current,
    getItemKey: (index) => clusters[index].id,
    estimateSize: () => 58,
    overscan: 8,
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

  const main = !clusters.length ? (
    <div className={styles.empty}>No logs to cluster.</div>
  ) : (
    <div
      ref={scroller}
      className={styles.scroller}
      data-pattern-scroller
      role="listbox"
      aria-label="Detected log patterns"
    >
      <div
        className={styles.spacer}
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const cluster = clusters[item.index]
          const active = cluster.id === selectedId
          const severity = Object.entries(cluster.severities).sort(
            (left, right) => right[1] - left[1],
          )[0]
          return (
            <article
              data-index={item.index}
              data-pattern-row
              className={styles.row}
              key={cluster.id}
              style={{ transform: 'translateY(' + item.start + 'px)' }}
            >
              <button
                className={styles.summary}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => setSelectedId(active ? null : cluster.id)}
              >
                <span className={styles.template}>
                  <Template cluster={cluster} />
                </span>
                {severity && (
                  <strong
                    className={styles.severityBadge}
                    data-severity={severity[0].toUpperCase()}
                    title={`${severity[1]} ${severity[0].toLowerCase()} logs`}
                  >
                    {severity[0].toUpperCase()}
                  </strong>
                )}
                <span className={styles.metrics}>
                  <strong>{cluster.count}</strong> logs ·{' '}
                  {cluster.percentage.toFixed(1)}%
                </span>
              </button>
            </article>
          )
        })}
      </div>
    </div>
  )

  const detail = selected ? (
    <div className={styles.inspector} data-pattern-inspector>
      <header>
        <strong>Pattern details</strong>
        <button
          type="button"
          className="btn ghost"
          onClick={() => setSelectedId(null)}
          aria-label="Close pattern details"
        >
          Close
        </button>
      </header>
      <div className={styles.inspectorBody}>
        <section>
          <h3>Template</h3>
          <div className={styles.fullTemplate}>
            <Template cluster={selected} />
          </div>
        </section>
        <div className={styles.inspectorMetrics}>
          <span>
            <strong>{selected.count}</strong> logs
          </span>
          <span>{selected.percentage.toFixed(1)}%</span>
        </div>
        <section>
          <h3>Severity</h3>
          <div className={styles.severities}>
            {Object.entries(selected.severities).map(([severity, count]) => (
              <span key={severity}>
                <strong
                  className={styles.severityBadge}
                  data-severity={severity.toUpperCase()}
                >
                  {severity.toUpperCase()}
                </strong>
                {count}
              </span>
            ))}
          </div>
        </section>
        <section>
          <h3>Observed</h3>
          <dl className={styles.timestamps}>
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
      <footer>
        {lineContains && (
          <span title={lineContains}>
            Query candidate: <code>{lineContains}</code>
          </span>
        )}
        <button
          type="button"
          className="btn primary"
          onClick={() => onFilterPattern(selected, lineContains)}
        >
          Filter logs
        </button>
      </footer>
    </div>
  ) : undefined

  return (
    <section className={styles.root} aria-label="Log patterns">
      <div className={styles.stats}>
        {clusters.length} patterns · {rows.length} loaded logs
      </div>
      <ResizableDetailPanel
        main={main}
        detail={detail}
        detailLabel="Pattern details"
        width={inspectorWidth}
        onWidthChange={setInspectorWidth}
      />
    </section>
  )
}
