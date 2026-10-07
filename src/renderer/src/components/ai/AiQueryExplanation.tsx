import { useEffect, useRef, useState } from 'react'
import { api } from '@lib/api'
import {
  prepareAiQueryContext,
  type AiQuerySnapshot,
  type AiPreparedContext,
} from '@lib/ai/workflow'
import { AI_LIMITS, type AiQueryExplanation as Explanation } from '@shared/ai'
import { AiContextPopover } from './AiContextPopover'
import { QueryExplanationDiagram } from './QueryExplanationDiagram'
import styles from './QueryExplanation.module.css'

export function AiQueryExplanation({
  snapshot,
}: {
  snapshot: AiQuerySnapshot
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [input, setInput] = useState<AiPreparedContext | null>(null)
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const flight = useRef<{ id: string; sent: boolean } | null>(null)
  const cancel = () => {
    const current = flight.current
    flight.current = null
    if (current?.sent) void api.ai.cancel(current.id)
    setBusy(false)
  }
  useEffect(
    () => () => {
      const current = flight.current
      flight.current = null
      if (current?.sent) void api.ai.cancel(current.id)
    },
    [],
  )
  const explain = async () => {
    if (flight.current) return
    const current = { id: crypto.randomUUID(), sent: false }
    flight.current = current
    setBusy(true)
    setError('')
    setInput(null)
    setExplanation(null)
    try {
      const prepared = await prepareAiQueryContext(snapshot, '')
      if (flight.current !== current) return
      setInput(prepared)
      current.sent = true
      const response = await api.ai.explainQuery({
        requestId: current.id,
        currentQuery: snapshot.query,
        context: prepared.context,
      })
      if (flight.current !== current) return
      if (response.ok) setExplanation(response.value)
      else if (response.code !== 'cancelled') setError(response.message)
    } catch {
      if (flight.current === current)
        setError(
          'Could not explain this query. Refresh metadata and try again.',
        )
    } finally {
      if (flight.current === current) {
        flight.current = null
        setBusy(false)
      }
    }
  }
  return (
    <section className={styles.root} aria-label="AI query explanation">
      <div className={styles.toolbar}>
        <button
          className="btn"
          onClick={() => void explain()}
          disabled={
            busy ||
            !snapshot.query.trim() ||
            snapshot.query.length > AI_LIMITS.query
          }
        >
          {busy
            ? 'Explaining query…'
            : explanation
              ? 'Regenerate diagram'
              : 'Generate AI diagram'}
        </button>
        {busy && (
          <button className="btn ghost" onClick={cancel}>
            Cancel
          </button>
        )}
        <AiContextPopover
          operation="Explain Query (semantic diagram)"
          showPrompt={false}
          prompt=""
          query={snapshot.query}
          context={input?.context ?? null}
          discovery={null}
          preparing={busy && !input}
          sent={!!input}
          proposal={null}
        />
      </div>
      <p className={styles.hint}>
        AI explains the SQL structure, not the execution plan or measured
        performance. SQL and bounded schema metadata are sent to OpenRouter only
        when you generate a diagram. No query is executed.
      </p>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Preparing the query diagram…</p>}
      {explanation && (
        <QueryExplanationDiagram
          explanation={explanation}
          query={snapshot.query}
        />
      )}
    </section>
  )
}
