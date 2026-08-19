import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { QueryResult } from '@shared/types'
import { api } from '../lib/api'
import styles from './TraceExplorer.module.css'

interface TraceExplorerProps {
  connectionId: string
}

type TraceRow = Record<string, unknown>

const DEFAULT_TRACEQL = '{ duration > 100ms }'
const MAX_RENDERED_SPANS = 500

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function durationLabel(milliseconds: number): string {
  if (milliseconds >= 1_000) return `${(milliseconds / 1_000).toFixed(milliseconds >= 10_000 ? 1 : 2)}s`
  if (milliseconds >= 1) return `${milliseconds.toFixed(milliseconds >= 100 ? 0 : 1)}ms`
  return `${Math.max(0, milliseconds * 1_000).toFixed(0)}µs`
}

function isSpanResult(result: QueryResult): boolean {
  return result.columns.some((column) => column.name === 'spanId')
}

function traceDepths(rows: TraceRow[]): Map<string, number> {
  const byId = new Map(rows.map((row) => [text(row.spanId), row]))
  const depths = new Map<string, number>()
  const visit = (id: string, seen = new Set<string>()): number => {
    if (!id) return 0
    const cached = depths.get(id)
    if (cached !== undefined) return cached
    if (seen.has(id)) return 0
    const row = byId.get(id)
    if (!row) return 0
    const parentId = text(row.parentSpanId)
    if (!parentId || !byId.has(parentId)) { depths.set(id, 0); return 0 }
    seen.add(id)
    const depth = Math.min(12, visit(parentId, seen) + 1)
    depths.set(id, depth)
    return depth
  }
  for (const id of byId.keys()) visit(id)
  return depths
}

export function TraceExplorer({ connectionId }: TraceExplorerProps) {
  const [query, setQuery] = useState(DEFAULT_TRACEQL)
  const [searchRows, setSearchRows] = useState<TraceRow[]>([])
  const [spans, setSpans] = useState<TraceRow[]>([])
  const [searchNotice, setSearchNotice] = useState('')
  const [selectedSpanId, setSelectedSpanId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setSearchRows([])
    setSpans([])
    setSelectedSpanId('')
    setError('')
  }, [connectionId])

  const execute = async (value: string) => {
    const request = value.trim()
    if (!request) return
    setLoading(true)
    setError('')
    try {
      const result = await api.query.run(connectionId, request)
      if (isSpanResult(result)) {
        setSpans(result.rows)
        setSelectedSpanId('')
      } else {
        setSearchRows(result.rows)
        setSearchNotice(result.notice ?? '')
        setSpans([])
        setSelectedSpanId('')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void execute(query)
  }

  const sortedSpans = useMemo(() => [...spans].sort((left, right) => number(left.startTimeMs) - number(right.startTimeMs)), [spans])
  const renderedSpans = sortedSpans.slice(0, MAX_RENDERED_SPANS)
  const depths = useMemo(() => traceDepths(sortedSpans), [sortedSpans])
  const traceStart = sortedSpans.length ? Math.min(...sortedSpans.map((row) => number(row.startTimeMs))) : 0
  const traceEnd = sortedSpans.length ? Math.max(...sortedSpans.map((row) => number(row.startTimeMs) + number(row.durationMs))) : 0
  const traceDuration = Math.max(0, traceEnd - traceStart)
  const services = useMemo(() => new Set(sortedSpans.map((row) => text(row.service)).filter(Boolean)), [sortedSpans])
  const errorCount = useMemo(() => sortedSpans.filter((row) => text(row.status).toUpperCase().includes('ERROR')).length, [sortedSpans])
  const rootSpan = sortedSpans.find((row) => !text(row.parentSpanId)) ?? sortedSpans[0]
  const selectedSpan = sortedSpans.find((row) => text(row.spanId) === selectedSpanId)

  return (
    <section className={styles.root} aria-label="Trace explorer">
      <form className={styles.queryBar} onSubmit={submit}>
        <label className={styles.queryLabel} htmlFor="traceql-query">TraceQL or trace ID</label>
        <input id="traceql-query" className={styles.queryInput} value={query} onChange={(event) => setQuery(event.target.value)}
          spellCheck={false} placeholder="{ duration > 100ms }" />
        <button className="btn primary" type="submit" disabled={loading || !query.trim()}>{loading ? 'Running…' : 'Search traces'}</button>
      </form>

      <div className={styles.hint}>Tempo via gcx · searches use the last hour and return up to 20 traces in this MVP.</div>
      {error && <div className={styles.error} role="alert">{error}</div>}

      {spans.length > 0 ? (
        <div className={styles.traceView}>
          <header className={styles.traceHeader}>
            <div>
              {searchRows.length > 0 && <button type="button" className="btn ghost" onClick={() => { setSpans([]); setSelectedSpanId('') }}>← Search results</button>}
              <h2>{text(rootSpan?.service) || 'Trace'} · {text(rootSpan?.name) || text(rootSpan?.traceId)}</h2>
            </div>
            <dl className={styles.summary}>
              <div><dt>Duration</dt><dd>{durationLabel(traceDuration)}</dd></div>
              <div><dt>Spans</dt><dd>{spans.length}</dd></div>
              <div><dt>Services</dt><dd>{services.size}</dd></div>
              <div><dt>Errors</dt><dd>{errorCount}</dd></div>
            </dl>
          </header>

          {spans.length > MAX_RENDERED_SPANS && <div className={styles.warning}>Showing the first {MAX_RENDERED_SPANS} of {spans.length} spans. Virtualised rendering is tracked as follow-up work in #88.</div>}

          <div className={styles.waterfall}>
            <div className={styles.waterfallHeader}><span>Span</span><span>Timeline · {durationLabel(traceDuration)}</span></div>
            {renderedSpans.map((span) => {
              const spanId = text(span.spanId)
              const offset = traceDuration > 0 ? ((number(span.startTimeMs) - traceStart) / traceDuration) * 100 : 0
              const width = traceDuration > 0 ? Math.max(.35, (number(span.durationMs) / traceDuration) * 100) : 100
              const depth = depths.get(spanId) ?? 0
              const isError = text(span.status).toUpperCase().includes('ERROR')
              return (
                <button key={spanId || `${text(span.name)}-${number(span.startTimeMs)}`} type="button"
                  className={`${styles.spanRow} ${selectedSpanId === spanId ? styles.selected : ''}`}
                  onClick={() => setSelectedSpanId(spanId)} aria-pressed={selectedSpanId === spanId}>
                  <span className={styles.spanLabel} style={{ paddingLeft: `${10 + depth * 14}px` }}>
                    <strong>{text(span.service) || 'unknown'}</strong>
                    <span>{text(span.name) || spanId}</span>
                  </span>
                  <span className={styles.timeline}>
                    <span className={`${styles.bar} ${isError ? styles.errorBar : ''}`} style={{ left: `${offset}%`, width: `${Math.min(width, 100 - offset)}%` }}>
                      <span>{durationLabel(number(span.durationMs))}</span>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {selectedSpan && (
            <aside className={styles.details} aria-label="Selected span details">
              <div><strong>{text(selectedSpan.service)}</strong> · {text(selectedSpan.name)}</div>
              <div>{durationLabel(number(selectedSpan.durationMs))} · {text(selectedSpan.kind) || 'unknown kind'} · {text(selectedSpan.status) || 'no status'}</div>
              <code>span {text(selectedSpan.spanId)}{text(selectedSpan.parentSpanId) ? ` · parent ${text(selectedSpan.parentSpanId)}` : ''}</code>
              {text(selectedSpan.attributes) && <pre>{text(selectedSpan.attributes)}</pre>}
            </aside>
          )}
        </div>
      ) : (
        <div className={styles.searchResults}>
          <header className={styles.resultsHeader}>
            <div><h2>Trace search</h2><p>{searchNotice || 'Run TraceQL to find Tempo traces.'}</p></div>
            {searchRows.length > 0 && <strong>{searchRows.length} traces</strong>}
          </header>
          {searchRows.length === 0 ? (
            <div className={styles.empty}>{loading ? 'Searching Tempo…' : 'Search by TraceQL, or paste a 32-character trace ID to open it directly.'}</div>
          ) : (
            <div className={styles.traceList}>
              {searchRows.map((row) => (
                <button key={text(row.traceId)} type="button" className={styles.traceResult} onClick={() => void execute(text(row.traceId))} disabled={loading}>
                  <span><strong>{text(row.rootService) || 'unknown service'}</strong><span>{text(row.rootOperation) || text(row.traceId)}</span></span>
                  <span className={styles.resultMeta}><strong>{durationLabel(number(row.durationMs))}</strong><span>{number(row.matchedSpans) ? `${number(row.matchedSpans)} matched spans` : text(row.traceId)}</span></span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}