import { Popover } from '@components/ui/Popover'
import {
  AI_PRIVACY_NOTICE,
  type AiQueryContext,
  type AiQueryProposal,
} from '@shared/ai'
import styles from './Ai.module.css'

export function AiContextPopover({
  prompt,
  query,
  context,
  preparing,
  sent,
  proposal,
}: {
  prompt: string
  query: string
  context: AiQueryContext | null
  preparing: boolean
  sent: boolean
  proposal: AiQueryProposal | null
}) {
  return (
    <Popover
      trigger={
        <span className={styles.contextTriggerIcon} aria-hidden="true">
          i
        </span>
      }
      ariaLabel="View AI details"
      preferredWidth={720}
      maxHeight={680}
      contentClassName={styles.context}
    >
      <header className={styles.contextHeader}>
        <div>
          <strong>AI details</strong>
          <div className={styles.contextHeaderSubtitle}>
            {proposal
              ? 'Review the response and the context that produced it.'
              : 'Preview the context DataKoala will send.'}
          </div>
        </div>
        <span className={styles.contextProvider}>PostgreSQL · OpenRouter</span>
      </header>

      {proposal && (
        <section className={styles.responseCard} aria-label="AI response">
          <div className={styles.contextLabel}>AI response</div>
          <div className={styles.responseContent}>
            <section>
              <h3>Explanation</h3>
              <p>{proposal.explanation}</p>
            </section>
            {!!proposal.assumptions.length && (
              <section>
                <h3>Assumptions</h3>
                <ul className={styles.assumptions}>
                  {proposal.assumptions.map((assumption, index) => (
                    <li key={index}>{assumption}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          <p className={styles.responseHint}>
            Review the proposed SQL before applying it. Run remains a separate
            action.
          </p>
        </section>
      )}

      <div className={styles.contextDivider} />

      <div className={styles.contextLabel}>
        {sent ? 'Submitted context' : 'Context to send'}
      </div>
      <div className={styles.contextPayload}>
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
          <div className={styles.contextSectionHeading}>
            <h3>Schema metadata</h3>
            {context && (
              <span className={styles.contextCount}>
                {context.relations.length} relations ·{' '}
                {context.relations.reduce(
                  (sum, relation) => sum + relation.columns.length,
                  0,
                )}{' '}
                columns
              </span>
            )}
          </div>
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
            context.relations.map((relation) => (
              <pre
                key={`${relation.schema}.${relation.name}`}
              >{`${relation.schema}.${relation.name}\n${relation.columns.map((column) => `  ${column.name} ${column.dataType}`).join('\n')}`}</pre>
            ))
          )}
        </section>
      </div>

      <aside className={styles.contextInfo}>
        <strong>About this request</strong>
        <p>{AI_PRIVACY_NOTICE} Current SQL may contain sensitive literals.</p>
        <p>Selection is bounded. Some relations or columns may be omitted.</p>
      </aside>
    </Popover>
  )
}
