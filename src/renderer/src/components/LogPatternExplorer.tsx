import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LokiLogRow } from '@shared/loki'
import { clusterLogPatterns } from '@shared/log-patterns'
import { effectiveLogMessage } from '../lib/lokiLogMessage'
import styles from './LogPatternExplorer.module.css'

export function LogPatternExplorer({ rows, onViewLogs }: { rows: LokiLogRow[]; onViewLogs: (template: string, memberIds: string[]) => void }) {
  const records = useMemo(() => rows.map((row) => ({ id: row.id, message: effectiveLogMessage(row), timestampMs: row.timestampMs, severity: row.severity })), [rows])
  const clusters = useMemo(() => clusterLogPatterns(records), [records])
  const [expanded, setExpanded] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: clusters.length,
    getScrollElement: () => scroller.current,
    getItemKey: (index) => clusters[index].id,
    estimateSize: () => 104,
    overscan: 5,
    gap: 9,
    initialRect: { width: 800, height: 600 }
  })
  useEffect(() => { virtualizer.measure() }, [expanded, virtualizer])

  return <section className={styles.root} aria-label="Log patterns">
    <header><div><h2>Patterns</h2><p>{clusters.length} patterns across {rows.length} loaded logs</p></div></header>
    {!clusters.length ? <div className={styles.empty}>No logs to cluster.</div> : <div ref={scroller} className={styles.scroller} data-pattern-scroller>
      <div className={styles.spacer} style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const cluster = clusters[item.index], open = expanded === cluster.id
          return <article ref={virtualizer.measureElement} data-index={item.index} data-pattern-card className={styles.card} key={cluster.id} data-expanded={open || undefined} style={{ transform: `translateY(${item.start}px)` }}>
            <button className={styles.summary} type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : cluster.id)}>
              <code>{cluster.segments.map((segment, index) => <span key={index} className={segment.variable ? styles.variable : styles.literal}>{segment.text}{index < cluster.segments.length - 1 ? ' ' : ''}</span>)}</code>
              <span className={styles.metrics}><strong>{cluster.count}</strong> logs · {cluster.percentage.toFixed(1)}%</span>
            </button>
            <div className={styles.meta}><span>First {new Date(cluster.firstTimestampMs).toLocaleString()}</span><span>Last {new Date(cluster.lastTimestampMs).toLocaleString()}</span>{Object.entries(cluster.severities).map(([severity, count]) => <span key={severity}>{severity.toUpperCase()} {count}</span>)}</div>
            {open && <div className={styles.details} data-pattern-details><div><h3>Example messages</h3><ul>{cluster.examples.map((example) => <li key={example.id}>{example.message}</li>)}</ul></div>{cluster.variables.some(({ values }) => values.length) && <div><h3>Variable samples</h3><dl>{cluster.variables.filter(({ values }) => values.length).map((variable, index) => <div key={index}><dt>{variable.placeholder}</dt><dd>{variable.values.join(', ')}</dd></div>)}</dl></div>}<button type="button" className="btn primary" onClick={() => onViewLogs(cluster.template, cluster.memberIds)}>View logs</button></div>}
          </article>
        })}
      </div>
    </div>}
  </section>
}
