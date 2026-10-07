import { useMemo, useState } from 'react'
import type { ExplainNode } from '@shared/types'
import styles from './ExecutionPlanDiagram.module.css'

interface Props {
  tree: ExplainNode
  analyze?: boolean
}

function flatten(node: ExplainNode): ExplainNode[] {
  return [node, ...(node.children ?? []).flatMap(flatten)]
}

function NodeButton({
  node,
  selectedId,
  onSelect,
}: {
  node: ExplainNode
  selectedId: string
  onSelect: (id: string) => void
}) {
  const loops = node.loops && node.loops > 1 ? ` × ${node.loops} loops` : ''
  return (
    <li className={styles.branch}>
      <button
        type="button"
        className={`${styles.node} ${
          selectedId === node.id ? styles.selected : ''
        }`}
        onClick={() => onSelect(node.id)}
        aria-pressed={selectedId === node.id}
      >
        <span className={styles.nodeType}>{node.nodeType}</span>
        {(node.relation || node.index) && (
          <span className={styles.target}>
            {node.relation
              ? `${node.schema ? `${node.schema}.` : ''}${node.relation}`
              : node.index}
          </span>
        )}
        <span className={styles.metrics}>
          {node.planRows !== undefined && (
            <span>est. {node.planRows.toLocaleString()} rows</span>
          )}
          {node.actualRows !== undefined && (
            <span>
              actual {node.actualRows.toLocaleString()} rows{loops}
            </span>
          )}
          {node.actualTotalTime !== undefined && (
            <span>{node.actualTotalTime.toFixed(2)} ms</span>
          )}
        </span>
      </button>
      {!!node.children?.length && (
        <ul className={styles.children}>
          {node.children.map((child) => (
            <NodeButton
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function Detail({
  label,
  value,
}: {
  label: string
  value: string | number | undefined
}) {
  if (value === undefined || value === '') return null
  return (
    <div className={styles.detail}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export function ExecutionPlanDiagram({ tree, analyze = false }: Props) {
  const nodes = useMemo(() => flatten(tree), [tree])
  const [selectedId, setSelectedId] = useState(tree.id)
  const selected = nodes.find((node) => node.id === selectedId) ?? tree

  return (
    <section className={styles.root} aria-label="Execution plan diagram">
      <div className={styles.intro}>
        <strong>Execution plan</strong>
        <span>
          {analyze
            ? 'Actual runtime metrics from EXPLAIN ANALYZE'
            : 'Planner estimates from EXPLAIN'}
        </span>
      </div>
      <div className={styles.layout}>
        <div className={styles.diagram}>
          <ul className={styles.tree}>
            <NodeButton
              node={tree}
              selectedId={selected.id}
              onSelect={setSelectedId}
            />
          </ul>
        </div>
        <aside className={styles.inspector} aria-label="Plan node details">
          <div className={styles.inspectorHead}>
            <strong>{selected.nodeType}</strong>
            <span>{selected.plan}</span>
          </div>
          <dl className={styles.details}>
            <Detail label="Relation" value={selected.relation} />
            <Detail label="Schema" value={selected.schema} />
            <Detail label="Alias" value={selected.alias} />
            <Detail label="Index" value={selected.index} />
            <Detail label="Join type" value={selected.joinType} />
            <Detail label="Estimated rows" value={selected.planRows} />
            <Detail label="Startup cost" value={selected.startupCost} />
            <Detail label="Total cost" value={selected.totalCost} />
            <Detail label="Actual rows" value={selected.actualRows} />
            <Detail label="Loops" value={selected.loops} />
            <Detail
              label="Actual total time"
              value={
                selected.actualTotalTime === undefined
                  ? undefined
                  : `${selected.actualTotalTime} ms`
              }
            />
            <Detail label="Filter" value={selected.filter} />
            <Detail label="Index condition" value={selected.indexCond} />
            <Detail label="Hash condition" value={selected.hashCond} />
            <Detail label="Merge condition" value={selected.mergeCond} />
            <Detail label="Join filter" value={selected.joinFilter} />
            <Detail label="Sort key" value={selected.sortKey?.join(', ')} />
            <Detail label="Group key" value={selected.groupKey?.join(', ')} />
            <Detail
              label="Shared cache hits"
              value={selected.sharedHitBlocks}
            />
            <Detail label="Shared reads" value={selected.sharedReadBlocks} />
            <Detail label="Temp reads" value={selected.tempReadBlocks} />
            <Detail label="Temp writes" value={selected.tempWrittenBlocks} />
          </dl>
        </aside>
      </div>
    </section>
  )
}
