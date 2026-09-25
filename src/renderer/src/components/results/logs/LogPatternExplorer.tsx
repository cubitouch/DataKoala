import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LokiLogRow } from '@shared/loki'
import { clusterLogPatterns, type LogPatternCluster } from '@shared/log-patterns'
import { effectiveLogMessage } from '@lib/lokiLogMessage'
import styles from './LogPatternExplorer.module.css'

const clusterCache = new WeakMap<LokiLogRow[], LogPatternCluster[]>()

function clustersFor(rows: LokiLogRow[]): LogPatternCluster[] {
  const cached = clusterCache.get(rows)
  if (cached) return cached
  const records = rows.map((row) => ({ id: row.id, message: effectiveLogMessage(row), timestampMs: row.timestampMs, severity: row.severity }))
  const clusters = clusterLogPatterns(records)
  clusterCache.set(rows, clusters)
  return clusters
}

export function LogPatternExplorer({ rows, onViewLogs }: { rows: LokiLogRow[]; onViewLogs: (template: string, memberIds: string[]) => void }) {
  const clusters = useMemo(() => clustersFor(rows), [rows])
  const [expanded, setExpanded] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const cards = useRef(new Map<string, HTMLElement>())
  const previouslyExpanded = useRef<string | null>(null)
  const virtualizer = useVirtualizer({
    count: clusters.length,
    getScrollElement: () => scroller.current,
    getItemKey: (index) => clusters[index].id,
    estimateSize: () => 104,
    overscan: 5,
    gap: 9,
    initialRect: { width: 800, height: 600 }
  })
  const measureCard = useCallback((clusterId: string, element: HTMLElement | null) => {
    if (!element) { cards.current.delete(clusterId); return }
    cards.current.set(clusterId, element)
    virtualizer.measureElement(element)
  }, [virtualizer])
  useLayoutEffect(() => {
    const ids = [...new Set([previouslyExpanded.current, expanded].filter((id): id is string => Boolean(id)))]
    previouslyExpanded.current = expanded
    const frame = requestAnimationFrame(() => {
      for (const id of ids) {
        const element = cards.current.get(id)
        if (element) virtualizer.measureElement(element)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [expanded, virtualizer])

  return <section className={styles.root} aria-label="Log patterns">
    <header><div><h2>Patterns</h2><p>{clusters.length} patterns across {rows.length} loaded logs</p></div></header>
    {!clusters.length ? <div className={styles.empty}>No logs to cluster.</div> : <div ref={scroller} className={styles.scroller} data-pattern-scroller>
      <div className={styles.spacer} style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const cluster = clusters[item.index], open = expanded === cluster.id
          return <article ref={(element) => measureCard(cluster.id, element)} data-index={item.index} data-pattern-card className={styles.card} key={cluster.id} data-expanded={open || undefined} style={{ transform: 'translateY(' + item.start + 'px)' }}>
            <button className={styles.summary} type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : cluster.id)}>
              <code>{cluster.segments.map((segment, index) => <span key={index} className={segment.variable ? styles.variable : styles.literal}>{segment.text}{index < cluster.segments.length - 1 ? ' ' : ''}</span>)}</code>
              <span className={styles.metrics}><strong>{cluster.count}</strong> logs · {cluster.percentage.toFixed(1)}%</span>
            </button>
            <div className={styles.meta}><div className={styles.metaInfo}><div className={styles.severities}>{Object.keys(cluster.severities).map((severity) => <strong key={severity} className={styles.severityBadge} data-severity={severity.toUpperCase()}>{severity.toUpperCase()}</strong>)}</div><div className={styles.metaTimes}><span>First {new Date(cluster.firstTimestampMs).toLocaleString()}</span><span>Last {new Date(cluster.lastTimestampMs).toLocaleString()}</span></div></div><button type="button" className="btn primary" onClick={() => onViewLogs(cluster.template, cluster.memberIds)}>View logs</button></div>
            {open && <div className={styles.details} data-pattern-details><div><h3>Example messages</h3><ul>{cluster.examples.map((example) => <li key={example.id}>{example.message}</li>)}</ul></div>{cluster.variables.some(({ values }) => values.length) && <div><h3>Variable samples</h3><dl>{cluster.variables.filter(({ values }) => values.length).map((variable, index) => <div key={index}><dt>{variable.placeholder}</dt><dd>{variable.values.join(', ')}</dd></div>)}</dl></div>}</div>}
          </article>
        })}
      </div>
    </div>}
  </section>
}
