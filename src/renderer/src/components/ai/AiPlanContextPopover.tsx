import { type AiExecutionPlanContext, type AiPlanAnalysis } from '@shared/ai'
import { AiProcessPopover } from './AiProcessPopover'
import styles from './Ai.module.css'

export function AiPlanContextPopover({
  mode,
  sql,
  plan,
  response,
  sent,
}: {
  mode: 'explain' | 'analyze'
  sql: string
  plan: AiExecutionPlanContext
  response: AiPlanAnalysis | null
  sent: boolean
}) {
  return (
    <AiProcessPopover
      ariaLabel="Inspect Analyze performance request"
      subtitle={
        response
          ? 'Review the performance hints and the plan context that produced them.'
          : 'Inspect the captured SQL and plan context for this request.'
      }
      providerLabel="PostgreSQL · OpenRouter"
      sent={sent}
      response={
        response && (
          <>
            <section>
              <h3>Summary</h3>
              <p>{response.summary}</p>
            </section>
            <section>
              <h3>Performance hints</h3>
              {response.hints.length ? (
                <ul className={styles.planHints}>
                  {response.hints.map((hint, index) => (
                    <li key={`${hint.title}:${index}`}>
                      <strong>{hint.title}</strong>
                      {hint.action && <strong>{hint.action}</strong>}
                      <p>{hint.detail}</p>
                      <small>
                        Evidence: {hint.evidence} · node{' '}
                        {hint.nodeIds.join(', ')}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No specific performance hints were returned.</p>
              )}
            </section>
          </>
        )
      }
      responseNote="Hints are grounded in the submitted plan and link only to nodes in that plan."
      privacyNote="SQL and plan predicates may contain sensitive literals. Result rows and credentials are not included."
    >
      <section aria-label="Operation">
        <h3>Operation</h3>
        <pre>Analyze performance</pre>
      </section>
      <section aria-label="Plan mode">
        <h3>Plan mode</h3>
        <pre>{mode === 'analyze' ? 'EXPLAIN ANALYZE' : 'EXPLAIN'}</pre>
      </section>
      <section aria-label="Captured SQL">
        <h3>Captured SQL</h3>
        <pre>{sql}</pre>
      </section>
      <section aria-label="Submitted plan context">
        <h3>Submitted plan context</h3>
        <pre>{JSON.stringify(plan, null, 2)}</pre>
        <p className={styles.notice}>
          {plan.nodes.length} nodes submitted
          {plan.truncated ? ' · plan truncated to fit the AI limit' : ''}
        </p>
      </section>
    </AiProcessPopover>
  )
}
