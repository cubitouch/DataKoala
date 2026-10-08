import {
  AI_PRIVACY_NOTICE,
  type AiExecutionPlanContext,
  type AiPlanAnalysis,
} from '@shared/ai'
import { Popover } from '@components/ui/Popover'
import styles from './Ai.module.css'

export function AiPlanContextPopover({
  mode,
  sql,
  plan,
  response,
}: {
  mode: 'explain' | 'analyze'
  sql: string
  plan: AiExecutionPlanContext
  response: AiPlanAnalysis | null
}) {
  return (
    <Popover
      ariaLabel="Inspect Analyze performance request"
      trigger={<span aria-hidden="true">i</span>}
      preferredWidth={680}
      maxHeight={560}
      contentClassName={styles.dialog}
    >
      <div className={styles.contextPayload}>
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
        {response && (
          <section aria-label="AI response">
            <h3>AI response</h3>
            <pre>{JSON.stringify(response, null, 2)}</pre>
          </section>
        )}
        <aside className={styles.contextInfo}>
          <strong>About this request</strong>
          <p>
            {AI_PRIVACY_NOTICE} SQL and plan predicates may contain sensitive
            literals. Result rows and credentials are not included.
          </p>
        </aside>
      </div>
    </Popover>
  )
}
