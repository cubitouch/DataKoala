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
      preferredWidth={660}
      maxHeight={600}
      contentClassName={styles.context}
    >
      <header className={styles.contextHeader}>
        <strong>{sent ? 'Submitted context' : 'Context to send'}</strong>
        <span className={styles.notice}>PostgreSQL · OpenRouter</span>
      </header>
      <aside className={styles.contextInfo}>
        <strong>About this request</strong>
        <p>{AI_PRIVACY_NOTICE} Current SQL may contain sensitive literals.</p>
        <p>Selection is bounded. Some relations or columns may be omitted.</p>
      </aside>
      <div className={styles.contextPayload}>
        <div className={styles.contextLabel}>
          {sent ? 'Sent to the model' : 'Request content'}
        </div>
        <section aria-label="Prompt">
          <h3>Prompt</h3>
          {prompt ? (
            <pre>{prompt}</pre>
          ) : (
            <p className={styles.notice}>Enter a prompt.</p>
          )}
        </section>
        <section aria-label="Current SQL">
          <h3>Current SQL</h3>
          {query.trim() ? (
            <pre>{query}</pre>
          ) : (
            <p className={styles.notice}>Not included — the editor is empty.</p>
          )}
        </section>
        <section aria-label="Schema metadata">
          <h3>Schema metadata</h3>
          {context && (
            <p className={styles.notice}>
              {context.relations.length} relations ·{' '}
              {context.relations.reduce((sum, r) => sum + r.columns.length, 0)}{' '}
              columns
            </p>
          )}
          {preparing ? (
            <p className={styles.notice}>Preparing schema context…</p>
          ) : !context ? (
            <p className={styles.notice}>Context is not ready yet.</p>
          ) : !context.relations.length ? (
            <p className={styles.notice}>
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
        </section>
      </div>
    </Popover>
  )
}
