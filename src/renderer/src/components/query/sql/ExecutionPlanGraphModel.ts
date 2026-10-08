import type { ExplainNode } from '@shared/types'
import {
  compareCardinality,
  explainNodeTiming,
  explainNodeWorkValue,
  EXPLAIN_NODE_CATEGORY_LABELS,
  explainNodeCategory,
} from './ExecutionPlanPresentation'

export interface ExecutionPlanGraphNode {
  id: string
  node: ExplainNode
  parentId?: string
  order: number
}

export interface ExecutionPlanGraphEdge {
  id: string
  source: string
  target: string
  order: number
}

export interface ExecutionPlanPosition {
  x: number
  y: number
}

export function mapExecutionPlan(tree: ExplainNode): {
  nodes: ExecutionPlanGraphNode[]
  edges: ExecutionPlanGraphEdge[]
} {
  const nodes: ExecutionPlanGraphNode[] = []
  const edges: ExecutionPlanGraphEdge[] = []
  const visit = (node: ExplainNode, parentId?: string, order = 0) => {
    nodes.push({ id: node.id, node, parentId, order })
    node.children?.forEach((child, index) => {
      edges.push({
        id: `${node.id}->${child.id}`,
        source: node.id,
        target: child.id,
        order: index,
      })
      visit(child, node.id, index)
    })
  }
  visit(tree)
  return { nodes, edges }
}

export function layoutExecutionPlan(
  tree: ExplainNode,
  nodeWidth: number,
  nodeHeight: number,
  rankGap: number,
  siblingGap: number,
): Map<string, ExecutionPlanPosition> {
  const positions = new Map<string, ExecutionPlanPosition>()
  let nextLeafCenter = nodeHeight / 2
  const place = (node: ExplainNode, depth: number): number => {
    let centerY: number
    if (!node.children?.length) {
      centerY = nextLeafCenter
      nextLeafCenter += nodeHeight + siblingGap
    } else {
      const childCenters = node.children.map((child) => place(child, depth + 1))
      centerY = (childCenters[0]! + childCenters[childCenters.length - 1]!) / 2
    }
    positions.set(node.id, {
      x: depth * (nodeWidth + rankGap),
      y: centerY - nodeHeight / 2,
    })
    return centerY
  }
  place(tree, 0)
  return positions
}

export function graphNodeLabel(node: ExplainNode, analyze: boolean): string {
  const category =
    EXPLAIN_NODE_CATEGORY_LABELS[explainNodeCategory(node.nodeType)]
  const target = node.relation
    ? `${node.schema ? `${node.schema}.` : ''}${node.relation}`
    : node.cteName
      ? `CTE ${node.cteName}`
      : (node.subplanName ?? node.index)
  const rows = [
    node.planRows === undefined
      ? null
      : `Estimated ${compactCount(node.planRows)}`,
    analyze && node.actualRows !== undefined
      ? `Actual ${compactCount(node.actualRows)}`
      : null,
  ].filter(Boolean)
  const ratio = analyze ? compareCardinality(node)?.label : undefined
  const timing = analyze ? explainNodeTiming(node) : null
  const work = explainNodeWorkValue(node, analyze)
  const measured =
    timing && work !== undefined ? `≈${compactMs(work)} total` : undefined
  return [
    `${category} · ${node.nodeType}`,
    target,
    ...rows,
    ratio,
    measured ??
      (!analyze && node.totalCost !== undefined
        ? `Cost ${compactMetric(node.totalCost)}`
        : undefined),
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n')
}

function compactCount(value: number): string {
  return value.toLocaleString()
}

function compactMetric(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function compactMs(value: number): string {
  return `${value.toFixed(value >= 100 ? 0 : 1)} ms`
}
