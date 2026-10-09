import type { ExplainNode } from '@shared/types'
import {
  EXPLAIN_NODE_CATEGORY_LABELS,
  explainNodeCategory,
  explainNodeTiming,
} from './ExecutionPlanPresentation'
import type { ExplainDiagnostic } from './ExplainDiagnostics'
import styles from './PlanNodeInspector.module.css'

interface Item {
  label: string
  value?: string | number
}

function formatCount(value: number): string {
  return value.toLocaleString()
}

function formatMs(value: number): string {
  return `${value.toFixed(2)} ms`
}

function Section({ title, items }: { title: string; items: Item[] }) {
  const visible = items.filter(
    (item) => item.value !== undefined && item.value !== '',
  )
  if (!visible.length) return null
  return (
    <section className={styles.section}>
      <h3>{title}</h3>
      <dl>
        {visible.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function PlanNodeInspector({
  node,
  analyze,
  signals = [],
}: {
  node: ExplainNode
  analyze: boolean
  signals?: ExplainDiagnostic[]
}) {
  const timing = analyze ? explainNodeTiming(node) : null
  const relation = node.relation
    ? `${node.schema ? `${node.schema}.` : ''}${node.relation}`
    : undefined
  return (
    <aside className={styles.root} aria-label="Plan node details">
      <header className={styles.header}>
        <span>
          {EXPLAIN_NODE_CATEGORY_LABELS[explainNodeCategory(node.nodeType)]}
        </span>
        <h2>{node.nodeType}</h2>
        <p>{node.plan}</p>
      </header>
      {signals.length > 0 && (
        <section className={styles.section} aria-label="Plan signals">
          <h3>Signals</h3>
          <ul className={styles.signalList}>
            {signals.map((signal) => (
              <li key={signal.id}>
                <div className={styles.signal}>
                  <strong className={styles.signalTitle}>
                    <span aria-hidden="true">⚠</span>
                    {signal.title}
                  </strong>
                  <span>{signal.description}</span>
                  <small>{signal.evidence}</small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Section
        title="Operation"
        items={[
          { label: 'Relation', value: relation },
          { label: 'Alias', value: node.alias },
          { label: 'Index', value: node.index },
          { label: 'Join type', value: node.joinType },
          { label: 'Strategy', value: node.strategy },
          { label: 'CTE', value: node.cteName },
          { label: 'Subplan', value: node.subplanName },
          { label: 'Parent relationship', value: node.parentRelationship },
        ]}
      />
      <Section
        title="Estimates"
        items={[
          {
            label: 'Estimated rows',
            value:
              node.planRows === undefined
                ? undefined
                : formatCount(node.planRows),
          },
          { label: 'Startup cost', value: node.startupCost },
          { label: 'Total cost', value: node.totalCost },
        ]}
      />
      {analyze && (
        <Section
          title="Runtime"
          items={[
            {
              label:
                node.loops && node.loops > 1
                  ? 'Actual rows / loop'
                  : 'Actual rows',
              value:
                node.actualRows === undefined
                  ? undefined
                  : formatCount(node.actualRows),
            },
            {
              label: 'Loops',
              value:
                node.loops === undefined ? undefined : formatCount(node.loops),
            },
            {
              label:
                node.loops && node.loops > 1
                  ? 'Per-loop time'
                  : 'Measured time',
              value:
                node.actualTotalTime === undefined
                  ? undefined
                  : formatMs(node.actualTotalTime),
            },
            {
              label: 'Approx. total time',
              value:
                timing && timing.loops > 1
                  ? `≈${formatMs(timing.approxTotalMs)}`
                  : undefined,
            },
            {
              label:
                node.loops && node.loops > 1
                  ? 'Rows removed by filter / loop'
                  : 'Rows removed by filter',
              value:
                node.rowsRemovedByFilter === undefined
                  ? undefined
                  : formatCount(node.rowsRemovedByFilter),
            },
            { label: 'Hash batches', value: node.hashBatches },
            {
              label: 'Peak memory usage',
              value:
                node.peakMemoryUsage === undefined
                  ? undefined
                  : `${formatCount(node.peakMemoryUsage)} kB`,
            },
          ]}
        />
      )}
      <Section
        title="Conditions"
        items={[
          { label: 'Filter', value: node.filter },
          { label: 'Index condition', value: node.indexCond },
          { label: 'Hash condition', value: node.hashCond },
          { label: 'Merge condition', value: node.mergeCond },
          { label: 'Join filter', value: node.joinFilter },
        ]}
      />
      <Section
        title="Grouping / sorting"
        items={[
          { label: 'Group key', value: node.groupKey?.join(', ') },
          { label: 'Sort key', value: node.sortKey?.join(', ') },
          {
            label: 'Sort method',
            value: analyze ? node.sortMethod : undefined,
          },
          {
            label: 'Sort space used',
            value:
              analyze && node.sortSpaceUsed !== undefined
                ? `${formatCount(node.sortSpaceUsed)} kB`
                : undefined,
          },
          {
            label: 'Sort space type',
            value: analyze ? node.sortSpaceType : undefined,
          },
        ]}
      />
      {analyze && (
        <Section
          title="I/O"
          items={[
            { label: 'Shared cache hits', value: node.sharedHitBlocks },
            { label: 'Shared reads', value: node.sharedReadBlocks },
            { label: 'Temp reads', value: node.tempReadBlocks },
            { label: 'Temp writes', value: node.tempWrittenBlocks },
          ]}
        />
      )}
    </aside>
  )
}
