import { describe, expect, it } from 'vitest'
import type { ExplainNode } from '@shared/types'
import { EXPLAIN_DIAGNOSTIC_LIMITS } from './ExecutionPlanPresentation'
import { getExplainDiagnostics } from './ExplainDiagnostics'

function node(overrides: Partial<ExplainNode> = {}): ExplainNode {
  return {
    id: '0',
    plan: 'Seq Scan',
    nodeType: 'Seq Scan',
    children: [],
    ...overrides,
  }
}

describe('getExplainDiagnostics', () => {
  it('ignores close estimates and surfaces material cardinality mismatches', () => {
    expect(
      getExplainDiagnostics(node({ planRows: 100, actualRows: 101 }), true),
    ).toEqual([])
    const mismatch = getExplainDiagnostics(
      node({ planRows: 120, actualRows: 84_000 }),
      true,
    )[0]
    expect(mismatch).toMatchObject({
      title: 'Material row estimate mismatch',
      description:
        'PostgreSQL estimated 120 rows and observed 84,000 rows per loop.',
      evidence: '700× estimate.',
    })
    expect(mismatch?.description).not.toMatch(/review|check|consider|increase/i)
  })

  it('includes loops in measured work and exposes external sorts with temporary writes', () => {
    const diagnostics = getExplainDiagnostics(
      node({
        actualTotalTime: EXPLAIN_DIAGNOSTIC_LIMITS.highMeasuredWorkMs / 10,
        loops: 10,
        sortMethod: 'external merge',
        tempWrittenBlocks: 4,
      }),
      true,
    )
    expect(diagnostics.map((item) => item.title)).toEqual([
      'High measured work',
      'External sort used temporary storage',
    ])
    expect(diagnostics[0]!.evidence).toMatch(/10 loops/)
    expect(diagnostics[1]).toMatchObject({
      description: 'PostgreSQL reported external merge.',
      evidence: '4 temporary blocks written.',
    })
    expect(
      diagnostics.map(({ description }) => description).join(' '),
    ).not.toMatch(/review|check|consider|increase/i)
  })

  it('does not show runtime diagnostics for plain EXPLAIN', () => {
    expect(
      getExplainDiagnostics(
        node({ planRows: 1, actualRows: 1000, actualTotalTime: 2000 }),
        false,
      ),
    ).toEqual([])
  })
})
