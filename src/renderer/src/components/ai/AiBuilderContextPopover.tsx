import { type AiBuilderProposal, type AiBuilderState } from '@shared/ai'
import { builderTimeRangeSummary } from '@lib/builderTimeRange'
import type { AiPreparedBuilderContext } from '@lib/ai/builderWorkflow'
import { AiProcessPopover } from './AiProcessPopover'
import styles from './Ai.module.css'

const display = (value: string | null | undefined) => value || '—'
const titleCase = (value: string) =>
  value ? value[0].toUpperCase() + value.slice(1) : value

function BuilderStateDetails({ state }: { state: AiBuilderState }) {
  const rows = [
    ['Relation', `${state.relation.schema}.${state.relation.name}`],
    ['X axis', display(state.xColumn)],
    ['Y axis', display(state.valueColumn)],
    ['Aggregation', titleCase(state.aggregation)],
    ['Time column', display(state.timeColumn)],
    ['Time bucket', titleCase(state.timeBucket)],
    [
      'Time range',
      state.timeColumn && state.timeRange
        ? builderTimeRangeSummary(state.timeRange)
        : '—',
    ],
  ]
  return (
    <dl className={styles.builderContextState}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function AiBuilderContextPopover({
  prompt,
  input,
  sent,
  proposal,
}: {
  prompt: string
  input: AiPreparedBuilderContext | null
  sent: boolean
  proposal: AiBuilderProposal | null
}) {
  return (
    <AiProcessPopover
      subtitle={
        proposal
          ? 'Review the Builder response and the context that produced it.'
          : 'Preview the Builder context DataKoala will send.'
      }
      providerLabel="PostgreSQL · OpenRouter"
      sent={sent}
      response={
        proposal && (
          <>
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
          </>
        )
      }
      responseNote="Apply changes Builder controls only. Run remains a separate action."
      privacyNote={
        <>
          Builder AI is limited to the selected relation and structured Builder
          controls. Result rows, credentials, connection strings, and hidden
          query history are not included.
        </>
      }
    >
      <section aria-label="Operation">
        <h3>Operation</h3>
        <pre>Modify structured SQL Builder</pre>
      </section>
      <section aria-label="Prompt">
        <h3>Prompt</h3>
        {prompt ? (
          <pre>{prompt}</pre>
        ) : (
          <p className={styles.notice}>Enter a prompt.</p>
        )}
      </section>
      {input ? (
        <>
          <section aria-label="Current Builder state">
            <h3>Current Builder state</h3>
            <BuilderStateDetails state={input.snapshot.state} />
          </section>
          <section aria-label="Selected relation metadata">
            <div className={styles.contextSectionHeading}>
              <h3>Selected relation metadata</h3>
              <span className={styles.contextCount}>
                {input.columns.length} columns
              </span>
            </div>
            <pre>{`${input.snapshot.state.relation.schema}.${input.snapshot.state.relation.name}\n${input.columns
              .map((column) => `  ${column.name} ${column.dataType}`)
              .join('\n')}`}</pre>
          </section>
        </>
      ) : (
        <p className={styles.notice}>
          Select a PostgreSQL table or view with loaded column metadata.
        </p>
      )}
    </AiProcessPopover>
  )
}
