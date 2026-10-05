import { Popover } from '@components/ui/Popover'
import {
  AI_PRIVACY_NOTICE,
  type AiContextRequest,
  type AiQueryContext,
  type AiQueryProposal,
} from '@shared/ai'
import styles from './Ai.module.css'

function SchemaMetadata({
  ariaLabel,
  title,
  context,
  preparing = false,
}: {
  ariaLabel: string
  title: string
  context: AiQueryContext | null
  preparing?: boolean
}) {
  return (
    <section aria-label={ariaLabel}>
      <div className={styles.contextSectionHeading}>
        <h3>{title}</h3>
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
          >{`${relation.schema}.${relation.name}\n${relation.columns
            .map((column) => `  ${column.name} ${column.dataType}`)
            .join('\n')}`}</pre>
        ))
      )}
    </section>
  )
}

export function AiContextPopover({
  operation = 'Ask AI',
  datasourceError,
  queryLabel = 'Current SQL',
  prompt,
  query,
  context,
  discovery,
  preparing,
  sent,
  proposal,
}: {
  operation?: string
  datasourceError?: string
  queryLabel?: string
  prompt: string
  query: string
  context: AiQueryContext | null
  discovery: {
    initialContext: AiQueryContext
    request: AiContextRequest
    addedRelations: string[]
  } | null
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
        <section aria-label="Operation">
          <h3>Operation</h3>
          <pre>{operation}</pre>
        </section>
        {datasourceError !== undefined && (
          <section aria-label="Sanitized datasource error">
            <h3>Sanitized datasource error</h3>
            <pre>{datasourceError}</pre>
          </section>
        )}
        <section aria-label="Prompt">
          <h3>Prompt</h3>
          {prompt ? (
            <pre>{prompt}</pre>
          ) : (
            <p className={styles.notice}>Enter a prompt.</p>
          )}
        </section>
        <section aria-label={queryLabel}>
          <h3>{queryLabel}</h3>
          {query.trim() ? (
            <pre>{query}</pre>
          ) : (
            <p className={styles.notice}>Not included — the editor is empty.</p>
          )}
        </section>
        {discovery ? (
          <>
            <SchemaMetadata
              ariaLabel="Initial schema metadata"
              title="Initial schema metadata"
              context={discovery.initialContext}
            />
            <section aria-label="Metadata discovery">
              <h3>Metadata discovery</h3>
              <p className={styles.notice}>
                Requested concepts: {discovery.request.searchTerms.join(', ')}
              </p>
              <p className={styles.notice}>
                Reason: {discovery.request.reason}
              </p>
              <p className={styles.notice}>
                Added relations:{' '}
                {discovery.addedRelations.length
                  ? discovery.addedRelations.join(', ')
                  : 'None within the disclosure budget'}
              </p>
            </section>
            <SchemaMetadata
              ariaLabel="Final schema metadata"
              title="Final schema metadata"
              context={context}
            />
          </>
        ) : (
          <SchemaMetadata
            ariaLabel="Schema metadata"
            title="Schema metadata"
            context={context}
            preparing={preparing}
          />
        )}
      </div>

      <aside className={styles.contextInfo}>
        <strong>About this request</strong>
        <p>{AI_PRIVACY_NOTICE} Current SQL may contain sensitive literals.</p>
        <p>
          Selection is bounded. Discovery can add metadata once, but the total
          disclosure remains within the same relation, column, and context
          limits.
        </p>
      </aside>
    </Popover>
  )
}
