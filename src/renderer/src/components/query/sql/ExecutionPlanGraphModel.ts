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

export interface ExecutionPlanNodeContent {
  category: string
  nodeType: string
  target?: string
  estimatedRows?: string
  actualRows?: string
  ratio?: string
  work?: string
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
  let nextLeafCenterX = nodeWidth / 2
  const place = (node: ExplainNode, depth: number): number => {
    let centerX: number
    if (!node.children?.length) {
      centerX = nextLeafCenterX
      nextLeafCenterX += nodeWidth + siblingGap
    } else {
      const childCentersX = node.children.map((child) =>
        place(child, depth + 1),
      )
      centerX = (childCentersX[0]! + childCentersX.at(-1)!) / 2
    }
    positions.set(node.id, {
      x: centerX - nodeWidth / 2,
      y: depth * (nodeHeight + rankGap),
    })
    return centerX
  }
  place(tree, 0)
  return positions
}

const GRAPH_TARGET_MAX_LENGTH = 32
const GRAPH_NODE_TYPE_MAX_LENGTH = 30

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1).trimEnd()}…`
}

export function executionPlanNodeContent(
  node: ExplainNode,
  analyze: boolean,
): ExecutionPlanNodeContent {
  const target = node.relation
    ? `${node.schema ? `${node.schema}.` : ''}${node.relation}`
    : node.cteName
      ? `CTE ${node.cteName}`
      : (node.subplanName ?? node.index)
  const timing = analyze ? explainNodeTiming(node) : null
  const work = explainNodeWorkValue(node, analyze)
  return {
    category: EXPLAIN_NODE_CATEGORY_LABELS[explainNodeCategory(node.nodeType)],
    nodeType: truncate(node.nodeType, GRAPH_NODE_TYPE_MAX_LENGTH),
    target: target ? truncate(target, GRAPH_TARGET_MAX_LENGTH) : undefined,
    estimatedRows:
      node.planRows === undefined
        ? undefined
        : `Estimated ${compactCount(node.planRows)}`,
    actualRows:
      analyze && node.actualRows !== undefined
        ? `Actual ${compactCount(node.actualRows)} / loop`
        : undefined,
    ratio: analyze ? compareCardinality(node)?.label : undefined,
    work:
      timing && work !== undefined
        ? `≈${compactMs(work)} total measured work`
        : !analyze && node.totalCost !== undefined
          ? `Planner cost ${compactMetric(node.totalCost)}`
          : undefined,
  }
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
