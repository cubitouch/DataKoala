import type { ExplainNode } from '@shared/types'
import {
  compareCardinality,
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
        description: `${count(node.planRows!)} estimated → ${count(node.actualRows!)} actual / loop`,
        evidence: `${cardinality.label}.`,
        nodeIds: [node.id],
        severity: 'warning',
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
        description: node.sortMethod ?? 'External sort',
        evidence: `${count(node.tempWrittenBlocks!)} temp blocks written${node.tempReadBlocks ? ` · ${count(node.tempReadBlocks)} read` : ''}`,
        nodeIds: [node.id],
        severity: 'warning',
      })
    }
  }
  return diagnostics
}
