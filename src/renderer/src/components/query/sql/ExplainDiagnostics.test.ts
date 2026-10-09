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
      description: '120 estimated → 84,000 actual / loop',
      evidence: '700× estimate.',
    })
    expect(mismatch?.description).not.toMatch(/review|check|consider|increase/i)
  })

  it('surfaces external sorts with temporary writes and reads', () => {
    const diagnostics = getExplainDiagnostics(
      node({
        sortMethod: 'external merge',
        tempWrittenBlocks: 4,
        tempReadBlocks: 3,
      }),
      true,
    )
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({
      title: 'External sort used temporary storage',
      description: 'external merge',
      evidence: '4 temp blocks written · 3 read',
    })
    expect(
      diagnostics.map(({ description }) => description).join(' '),
    ).not.toMatch(/review|check|consider|increase/i)
  })

  it('does not create repeated measured-work signals for a slow chain', () => {
    const chain = node({
      actualTotalTime: EXPLAIN_DIAGNOSTIC_LIMITS.highMeasuredWorkMs * 2,
      children: [
        node({
          id: '0.0',
          actualTotalTime: EXPLAIN_DIAGNOSTIC_LIMITS.highMeasuredWorkMs * 2,
          children: [
            node({
              id: '0.0.0',
              actualTotalTime: EXPLAIN_DIAGNOSTIC_LIMITS.highMeasuredWorkMs * 2,
            }),
          ],
        }),
      ],
    })
    expect(getExplainDiagnostics(chain, true)).toEqual([])
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
