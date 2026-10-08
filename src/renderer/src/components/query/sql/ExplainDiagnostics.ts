import type { ExplainNode } from '@shared/types'
import {
  compareCardinality,
  explainNodeTiming,
  EXPLAIN_DIAGNOSTIC_LIMITS,
} from './ExecutionPlanPresentation'

export interface ExplainDiagnostic {
  id: string
  title: string
  description: string
  evidence: string
  nodeIds: string[]
  severity: 'info' | 'warning'
}

function flatten(node: ExplainNode): ExplainNode[] {
  return [node, ...(node.children ?? []).flatMap(flatten)]
}

function count(value: number): string {
  return value.toLocaleString()
}

function milliseconds(value: number): string {
  return `${value.toFixed(value >= 100 ? 0 : 1)} ms`
}

export function getExplainDiagnostics(
  tree: ExplainNode,
  analyze: boolean,
): ExplainDiagnostic[] {
  if (!analyze) return []
  const diagnostics: ExplainDiagnostic[] = []
  for (const node of flatten(tree)) {
    const cardinality = compareCardinality(node)
    if (cardinality && cardinality.relation !== 'close') {
      diagnostics.push({
        id: `cardinality:${node.id}`,
        title: 'Material row estimate mismatch',
        description: `PostgreSQL estimated ${count(node.planRows!)} rows and observed ${count(node.actualRows!)} rows per loop.`,
        evidence: `${cardinality.label}.`,
        nodeIds: [node.id],
        severity: 'warning',
      })
    }

    const timing = explainNodeTiming(node)
    if (
      timing &&
      timing.approxTotalMs >= EXPLAIN_DIAGNOSTIC_LIMITS.highMeasuredWorkMs
    ) {
      diagnostics.push({
        id: `measured-work:${node.id}`,
        title: 'High measured work',
        description:
          'Node timings are inclusive, so this approximate work includes descendant time.',
        evidence: `${milliseconds(timing.perLoopMs)} per loop × ${count(timing.loops)} loops ≈ ${milliseconds(timing.approxTotalMs)} total measured work.`,
        nodeIds: [node.id],
        severity: 'info',
      })
    }

    if (
      node.sortMethod?.toLowerCase().includes('external merge') &&
      (node.tempWrittenBlocks ?? 0) >=
        EXPLAIN_DIAGNOSTIC_LIMITS.minimumTemporaryWriteBlocks
    ) {
      diagnostics.push({
        id: `external-sort:${node.id}`,
        title: 'External sort used temporary storage',
        description: `PostgreSQL reported ${node.sortMethod}.`,
        evidence: `${count(node.tempWrittenBlocks!)} temporary blocks written${node.tempReadBlocks ? ` · ${count(node.tempReadBlocks)} temporary blocks read` : ''}.`,
        nodeIds: [node.id],
        severity: 'warning',
      })
    }
  }
  return diagnostics
}
