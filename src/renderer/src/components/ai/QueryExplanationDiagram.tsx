import { useId, useRef, useState } from 'react'
import type { AiQueryExplanation } from '@shared/ai'
import styles from './QueryExplanation.module.css'

// Deterministic ranks for the validated DAG; wrap wide ranks to keep labels readable.
function layout(explanation: AiQueryExplanation) {
  const ranks = new Map<string, number>()
  const rank = (id: string): number => {
    if (ranks.has(id)) return ranks.get(id)!
    const parents = explanation.edges.filter((edge) => edge.to === id)
    const value = parents.length
      ? Math.max(...parents.map((edge) => rank(edge.from))) + 1
      : 0
    ranks.set(id, value)
    return value
  }
  explanation.nodes.forEach((node) => rank(node.id))
  const positions = new Map<string, { x: number; y: number }>()
  let y = 16,
    width = 260
  for (let level = 0; level <= Math.max(...ranks.values()); level++) {
    const row = explanation.nodes.filter((node) => ranks.get(node.id) === level)
    row.forEach((node, index) =>
      positions.set(node.id, {
        x: 16 + (index % 5) * 240,
        y: y + Math.floor(index / 5) * 120,
      }),
    )
    width = Math.max(width, Math.min(row.length, 5) * 240 + 16)
    y += Math.ceil(row.length / 5) * 120
  }
  return { positions, width, height: y }
}
export function QueryExplanationDiagram({
  explanation,
  query,
}: {
  explanation: AiQueryExplanation
  query: string
}) {
  const [selected, setSelected] = useState<string[]>([])
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const marker = useId()
  const graph = layout(explanation)
  const node = explanation.nodes.find((item) => item.id === selected[0])
  const start = node ? query.indexOf(node.sqlFragment) : -1
  return (
    <>
      <p>{explanation.summary}</p>
      <div className={styles.explanation}>
        <div className={styles.graphScroll} aria-label="Query diagram">
          <div
            className={styles.graph}
            style={{ width: graph.width, height: graph.height }}
          >
            <svg
              width={graph.width}
              height={graph.height}
              className={styles.edges}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id={marker}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                </marker>
              </defs>
              {explanation.edges.map((edge) => {
                const a = graph.positions.get(edge.from)!,
                  b = graph.positions.get(edge.to)!
                return (
                  <path
                    key={`${edge.from}:${edge.to}`}
                    d={`M ${a.x + 104} ${a.y + 76} C ${a.x + 104} ${a.y + 98}, ${b.x + 104} ${b.y - 22}, ${b.x + 104} ${b.y}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    markerEnd={`url(#${marker})`}
                  />
                )
              })}
            </svg>
            {explanation.nodes.map((item) => (
              <button
                key={item.id}
                ref={(element) => {
                  if (element) buttons.current.set(item.id, element)
                  else buttons.current.delete(item.id)
                }}
                className={styles.node}
                style={{
                  left: graph.positions.get(item.id)!.x,
                  top: graph.positions.get(item.id)!.y,
                }}
                aria-label={`${item.kind} ${item.label}`}
                aria-pressed={selected.includes(item.id)}
                onClick={() => setSelected([item.id])}
                title={item.sqlFragment}
              >
                <span className={styles.kind}>{item.kind}</span>
                <strong>{item.label}</strong>
              </button>
            ))}
          </div>
        </div>
        <aside className={styles.highlights} aria-label="AI highlights">
          <h3>AI highlights</h3>
          {explanation.highlights.map((highlight, index) => (
            <button
              key={index}
              className={styles.highlight}
              onClick={() => {
                setSelected(highlight.nodeIds)
                buttons.current
                  .get(highlight.nodeIds[0])
                  ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
              }}
            >
              <strong>{highlight.title}</strong>
              <span>{highlight.detail}</span>
            </button>
          ))}
        </aside>
      </div>
      <p className={styles.hint}>
        Select a node or highlight to locate its SQL. AI explanations can be
        incomplete; verify them against the query.
      </p>
      <pre className={styles.sql} aria-label="Explained SQL">
        {start < 0 || !node ? (
          query
        ) : (
          <>
            {query.slice(0, start)}
            <mark>{node.sqlFragment}</mark>
            {query.slice(start + node.sqlFragment.length)}
          </>
        )}
      </pre>
      {!!explanation.assumptions.length && (
        <details>
          <summary>Assumptions and simplifications</summary>
          <ul>
            {explanation.assumptions.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}
