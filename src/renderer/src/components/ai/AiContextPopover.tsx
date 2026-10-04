import { Popover } from '@components/ui/Popover'
import { AI_PRIVACY_NOTICE, type AiQueryContext } from '@shared/ai'
import styles from './Ai.module.css'
export function AiContextPopover({
  prompt,
  query,
  context,
  preparing,
  sent,
}: {
  prompt: string
  query: string
  context: AiQueryContext | null
  preparing: boolean
  sent: boolean
}) {
  return (
    <Popover
      trigger={<span aria-hidden="true">ⓘ</span>}
      ariaLabel="View AI context"
      preferredWidth={480}
      maxHeight={420}
      contentClassName={styles.context}
    >
      <strong>
        PostgreSQL · {sent ? 'Submitted context' : 'Context to send'}
      </strong>
      <p>Prompt: {prompt || '(enter a prompt)'}</p>
      <p>Current query: {query.trim() ? 'included' : 'not included'}</p>
      {!!query.trim() && <pre>{query}</pre>}
      <p>{AI_PRIVACY_NOTICE} Current SQL may contain sensitive literals.</p>
      <p>
        Schema context
        {context
          ? `: ${context.relations.length} relations · ${context.relations.reduce((sum, r) => sum + r.columns.length, 0)} columns`
          : ''}
      </p>
      {preparing ? (
        <p>Preparing schema context…</p>
      ) : !context ? (
        <p>Context is not ready yet.</p>
      ) : !context.relations.length ? (
        <p>
          No eligible metadata is loaded. Refresh connection metadata for
          table-based queries.
        </p>
      ) : (
        context.relations.map((r) => (
          <pre
            key={`${r.schema}.${r.name}`}
          >{`${r.schema}.${r.name}\n${r.columns.map((c) => `  ${c.name} ${c.dataType}`).join('\n')}`}</pre>
        ))
      )}
      <p>Selection is bounded. Some relations or columns may be omitted.</p>
    </Popover>
  )
}
