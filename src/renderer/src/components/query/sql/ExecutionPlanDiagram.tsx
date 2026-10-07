import { useMemo, useState } from 'react'
import type { ExplainNode } from '@shared/types'
import {
  EXPLAIN_NODE_CATEGORY_LABELS,
  compareCardinality,
  explainNodeCategory,
  explainNodeTiming,
  explainNodeWorkValue,
  type ExplainNodeCategory,
} from './ExecutionPlanPresentation'
import styles from './ExecutionPlanDiagram.module.css'

interface Props {
  tree: ExplainNode
  analyze?: boolean
  planningTimeMs?: number
  executionTimeMs?: number
}

function flatten(node: ExplainNode): ExplainNode[] {
  return [node, ...(node.children ?? []).flatMap(flatten)]
}

function formatCount(value: number): string {
  return value.toLocaleString()
}

function formatMetric(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function formatMs(value: number): string {
  return `${value.toFixed(2)} ms`
}

function nodeTarget(node: ExplainNode): string | undefined {
  if (node.relation)
    return `${node.schema ? `${node.schema}.` : ''}${node.relation}`
  if (node.cteName) return `CTE ${node.cteName}`
  return node.subplanName ?? node.index
}

function categoryClass(category: ExplainNodeCategory): string {
  return {
    scan: styles.categoryScan,
    join: styles.categoryJoin,
    aggregate: styles.categoryAggregate,
    sort: styles.categorySort,
    limit: styles.categoryLimit,
    hash: styles.categoryHash,
    materialize: styles.categoryMaterialize,
    subquery: styles.categorySubquery,
    other: styles.categoryOther,
  }[category]
}

function ratioClass(
  relation: 'match' | 'underestimate' | 'overestimate',
): string {
  return {
    match: styles.ratioMatch,
    underestimate: styles.ratioUnderestimate,
    overestimate: styles.ratioOverestimate,
  }[relation]
}

function NodeButton({
  node,
  analyze,
  selectedId,
  maxWork,
  onSelect,
}: {
  node: ExplainNode
  analyze: boolean
  selectedId: string
  maxWork: number
  onSelect: (id: string) => void
}) {
  const category = explainNodeCategory(node.nodeType)
  const target = nodeTarget(node)
  const timing = analyze ? explainNodeTiming(node) : null
  const cardinality = analyze ? compareCardinality(node) : null
  const workValue = explainNodeWorkValue(node, analyze)
  const workShare =
    workValue !== undefined && maxWork > 0
      ? Math.min(100, Math.max(0, (workValue / maxWork) * 100))
      : 0

  return (
    <li className={styles.branch}>
      <button
        type="button"
        data-testid="plan-node"
        data-node-id={node.id}
        className={`${styles.node} ${categoryClass(category)} ${
          selectedId === node.id ? styles.selected : ''
        }`}
        onClick={() => onSelect(node.id)}
        aria-pressed={selectedId === node.id}
        title={node.plan}
      >
        <span className={styles.nodeHead}>
          <span className={styles.categoryBadge}>
            {EXPLAIN_NODE_CATEGORY_LABELS[category]}
          </span>
          <span className={styles.nodeType}>{node.nodeType}</span>
        </span>
        {target && (
          <span className={styles.target} title={target}>
            {target}
          </span>
        )}
        {node.index && node.relation && (
          <span className={styles.indexTarget} title={node.index}>
            using {node.index}
          </span>
        )}
        <span className={styles.cardinality}>
          {node.planRows !== undefined && (
            <span>
              Estimated <strong>{formatCount(node.planRows)}</strong>
            </span>
          )}
          {analyze && node.actualRows !== undefined && (
            <span>
              Actual <strong>{formatCount(node.actualRows)}</strong>
            </span>
          )}
          {cardinality && (
            <span
              className={`${styles.ratio} ${ratioClass(cardinality.relation)}`}
            >
              {cardinality.label}
              <span className={styles.ratioKind}>{cardinality.relation}</span>
            </span>
          )}
        </span>
        {timing && (
          <span className={styles.timing}>
            {timing.loops > 1 ? (
              <>
                <span>{formatMs(timing.perLoopMs)} / loop</span>
                <span>{formatCount(timing.loops)} loops</span>
                <span>≈{formatMs(timing.approxTotalMs)} total</span>
              </>
            ) : (
              <span>{formatMs(timing.perLoopMs)} measured</span>
            )}
          </span>
        )}
        {workValue !== undefined && (
          <span
            className={styles.work}
            aria-label={`${analyze ? 'Measured time' : 'Planner cost'}: ${
              analyze
                ? timing && timing.loops > 1
                  ? `approximately ${formatMs(workValue)} total`
                  : formatMs(workValue)
                : formatMetric(workValue)
            }`}
          >
            <span className={styles.workCaption}>
              <span>{analyze ? 'Measured time' : 'Planner cost'}</span>
              <span>
                {analyze
                  ? `${timing && timing.loops > 1 ? '≈' : ''}${formatMs(workValue)}`
                  : formatMetric(workValue)}
              </span>
            </span>
            <span className={styles.workTrack} aria-hidden="true">
              <span
                className={styles.workFill}
                style={{ width: `${workShare}%` }}
              />
            </span>
          </span>
        )}
      </button>
      {!!node.children?.length && (
        <ul className={styles.children}>
          {node.children.map((child) => (
            <NodeButton
              key={child.id}
              node={child}
              analyze={analyze}
              selectedId={selectedId}
              maxWork={maxWork}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

interface DetailItem {
  label: string
  value: string | number | undefined
}

function DetailSection({
  title,
  items,
}: {
  title: string
  items: DetailItem[]
}) {
  const visible = items.filter(
    (item) => item.value !== undefined && item.value !== '',
  )
  if (!visible.length) return null

  return (
    <section className={styles.detailSection}>
      <h3>{title}</h3>
      <dl className={styles.details}>
        {visible.map((item) => (
          <div className={styles.detail} key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function ExecutionPlanDiagram({
  tree,
  analyze = false,
  planningTimeMs,
  executionTimeMs,
}: Props) {
  const nodes = useMemo(() => flatten(tree), [tree])
  const [selectedId, setSelectedId] = useState(tree.id)
  const selected = nodes.find((node) => node.id === selectedId) ?? tree
  const maxWork = useMemo(
    () =>
      Math.max(
        0,
        ...nodes.map((node) => explainNodeWorkValue(node, analyze) ?? 0),
      ),
    [analyze, nodes],
  )
  const selectedTiming = analyze ? explainNodeTiming(selected) : null
  const selectedLoops = selectedTiming?.loops ?? selected.loops ?? 1
  const relation = selected.relation
    ? `${selected.schema ? `${selected.schema}.` : ''}${selected.relation}`
    : undefined

  return (
    <section className={styles.root} aria-label="Execution plan diagram">
      <div className={styles.intro}>
        <div className={styles.introCopy}>
          <strong>Execution plan</strong>
          <span>
            {analyze
              ? 'Measured node times are PostgreSQL per-loop averages; relative bars use approximate total measured time and are inclusive.'
              : 'Planner estimates from EXPLAIN; planner cost is a relative unit, not milliseconds.'}
          </span>
        </div>
        {(planningTimeMs !== undefined || executionTimeMs !== undefined) && (
          <div className={styles.planSummary} aria-label="Plan timing summary">
            {planningTimeMs !== undefined && (
              <span>
                Planning time <strong>{formatMs(planningTimeMs)}</strong>
              </span>
            )}
            {executionTimeMs !== undefined && (
              <span>
                Execution time <strong>{formatMs(executionTimeMs)}</strong>
              </span>
            )}
          </div>
        )}
      </div>
      <div className={styles.layout}>
        <div className={styles.diagram}>
          <ul className={styles.tree}>
            <NodeButton
              node={tree}
              analyze={analyze}
              selectedId={selected.id}
              maxWork={maxWork}
              onSelect={setSelectedId}
            />
          </ul>
        </div>
        <aside className={styles.inspector} aria-label="Plan node details">
          <div className={styles.inspectorHead}>
            <span className={styles.inspectorCategory}>
              {
                EXPLAIN_NODE_CATEGORY_LABELS[
                  explainNodeCategory(selected.nodeType)
                ]
              }
            </span>
            <strong>{selected.nodeType}</strong>
            <span>{selected.plan}</span>
          </div>
          <DetailSection
            title="Operation"
            items={[
              { label: 'Relation', value: relation },
              { label: 'Alias', value: selected.alias },
              { label: 'Index', value: selected.index },
              { label: 'Join type', value: selected.joinType },
              { label: 'Strategy', value: selected.strategy },
              { label: 'CTE', value: selected.cteName },
              { label: 'Subplan', value: selected.subplanName },
              {
                label: 'Parent relationship',
                value: selected.parentRelationship,
              },
            ]}
          />
          <DetailSection
            title="Estimates"
            items={[
              {
                label: 'Estimated rows',
                value:
                  selected.planRows === undefined
                    ? undefined
                    : formatCount(selected.planRows),
              },
              {
                label: 'Startup cost',
                value:
                  selected.startupCost === undefined
                    ? undefined
                    : formatMetric(selected.startupCost),
              },
              {
                label: 'Total cost',
                value:
                  selected.totalCost === undefined
                    ? undefined
                    : formatMetric(selected.totalCost),
              },
            ]}
          />
          {analyze && (
            <DetailSection
              title="Runtime"
              items={[
                {
                  label:
                    selectedLoops > 1 ? 'Actual rows / loop' : 'Actual rows',
                  value:
                    selected.actualRows === undefined
                      ? undefined
                      : formatCount(selected.actualRows),
                },
                {
                  label: 'Loops',
                  value:
                    selected.loops === undefined
                      ? undefined
                      : formatCount(selected.loops),
                },
                {
                  label: selectedLoops > 1 ? 'Per-loop time' : 'Measured time',
                  value:
                    selected.actualTotalTime === undefined
                      ? undefined
                      : formatMs(selected.actualTotalTime),
                },
                {
                  label: 'Approx. total time',
                  value:
                    selectedTiming && selectedTiming.loops > 1
                      ? `≈${formatMs(selectedTiming.approxTotalMs)}`
                      : undefined,
                },
                {
                  label:
                    selectedLoops > 1
                      ? 'Rows removed by filter / loop'
                      : 'Rows removed by filter',
                  value:
                    selected.rowsRemovedByFilter === undefined
                      ? undefined
                      : formatCount(selected.rowsRemovedByFilter),
                },
                {
                  label: 'Hash batches',
                  value: selected.hashBatches,
                },
                {
                  label: 'Peak memory usage',
                  value:
                    selected.peakMemoryUsage === undefined
                      ? undefined
                      : `${formatCount(selected.peakMemoryUsage)} kB`,
                },
              ]}
            />
          )}
          <DetailSection
            title="Conditions"
            items={[
              { label: 'Filter', value: selected.filter },
              { label: 'Index condition', value: selected.indexCond },
              { label: 'Hash condition', value: selected.hashCond },
              { label: 'Merge condition', value: selected.mergeCond },
              { label: 'Join filter', value: selected.joinFilter },
            ]}
          />
          <DetailSection
            title="Grouping / sorting"
            items={[
              { label: 'Group key', value: selected.groupKey?.join(', ') },
              { label: 'Sort key', value: selected.sortKey?.join(', ') },
              {
                label: 'Sort method',
                value: analyze ? selected.sortMethod : undefined,
              },
              {
                label: 'Sort space used',
                value:
                  analyze && selected.sortSpaceUsed !== undefined
                    ? `${formatCount(selected.sortSpaceUsed)} kB`
                    : undefined,
              },
              {
                label: 'Sort space type',
                value: analyze ? selected.sortSpaceType : undefined,
              },
            ]}
          />
          {analyze && (
            <DetailSection
              title="I/O"
              items={[
                {
                  label: 'Shared cache hits',
                  value: selected.sharedHitBlocks,
                },
                { label: 'Shared reads', value: selected.sharedReadBlocks },
                { label: 'Temp reads', value: selected.tempReadBlocks },
                { label: 'Temp writes', value: selected.tempWrittenBlocks },
              ]}
            />
          )}
        </aside>
      </div>
    </section>
  )
}
