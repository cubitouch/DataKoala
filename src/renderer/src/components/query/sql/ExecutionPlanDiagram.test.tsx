// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import type { ExplainNode } from '@shared/types'
import { ExecutionPlanDiagram } from './ExecutionPlanDiagram'

afterEach(cleanup)

function planNode(
  id: string,
  nodeType: string,
  patch: Partial<ExplainNode> = {},
  children: ExplainNode[] = [],
): ExplainNode {
  return {
    id,
    nodeType,
    plan: nodeType,
    totalCost: 10,
    planRows: 100,
    ...patch,
    ...(children.length ? { children } : {}),
  }
}

describe('ExecutionPlanDiagram', () => {
  it('shows estimate/runtime cardinality and PostgreSQL per-loop timing semantics', () => {
    const tree = planNode('0', 'Nested Loop', {
      planRows: 100,
      actualRows: 10_000,
      actualTotalTime: 2.5,
      loops: 10,
      rowsRemovedByFilter: 25,
      totalCost: 250,
    })

    render(
      <ExecutionPlanDiagram
        tree={tree}
        analyze
        planningTimeMs={0.75}
        executionTimeMs={26.4}
      />,
    )

    expect(screen.getByText('100× estimate')).toBeTruthy()
    expect(screen.getByText('underestimate')).toBeTruthy()
    expect(screen.getByText('2.50 ms / loop')).toBeTruthy()
    expect(screen.getByText('10 loops')).toBeTruthy()
    expect(screen.getByText('≈25.00 ms total')).toBeTruthy()
    expect(screen.getByText(/Planning time/).textContent).toContain('0.75 ms')
    expect(screen.getByText(/Execution time/).textContent).toContain('26.40 ms')

    const inspector = screen.getByLabelText('Plan node details')
    expect(within(inspector).getByText('Runtime')).toBeTruthy()
    expect(within(inspector).getByText('Actual rows / loop')).toBeTruthy()
    expect(within(inspector).getByText('Per-loop time')).toBeTruthy()
    expect(within(inspector).getByText('Approx. total time')).toBeTruthy()
    expect(
      within(inspector).getByText('Rows removed by filter / loop'),
    ).toBeTruthy()
  })

  it('keeps plain EXPLAIN estimate-only even if runtime fields are present', () => {
    const tree = planNode('0', 'Seq Scan', {
      actualRows: 400,
      actualTotalTime: 8.2,
      loops: 3,
      rowsRemovedByFilter: 15,
      sharedReadBlocks: 9,
      totalCost: 81.5,
    })

    render(<ExecutionPlanDiagram tree={tree} analyze={false} />)

    expect(screen.getByText('Planner cost')).toBeTruthy()
    expect(screen.queryByText('Measured time')).toBeNull()
    expect(screen.queryByText('Runtime')).toBeNull()
    expect(screen.queryByText('I/O')).toBeNull()
    expect(screen.queryByText(/Actual rows/)).toBeNull()
    expect(screen.queryByText(/ms \/ loop/)).toBeNull()
  })

  it('keeps a wide/deep plan fully rendered and preserves selected node by stable id', () => {
    const deepBranch = planNode('0.0', 'Hash Join', {}, [
      planNode(
        '0.0.0',
        'Incremental Sort',
        {
          relation: 'orders_with_a_name_long_enough_to_require_safe_layout',
          sortKey: ['customer_identifier', 'created_at DESC'],
        },
        [
          planNode('0.0.0.0', 'Index Only Scan', {
            relation: 'orders',
            schema: 'analytics',
            index: 'orders_customer_created_at_idx',
          }),
        ],
      ),
      planNode('0.0.1', 'Hash', {}, [
        planNode('0.0.1.0', 'Seq Scan', {
          relation: 'customers',
          filter: "(region = ANY (ARRAY['north'::text, 'south'::text]))",
        }),
      ]),
    ])
    const tree = planNode('0', 'Nested Loop', {}, [
      deepBranch,
      planNode('0.1', 'Aggregate', {}, [
        planNode('0.1.0', 'Bitmap Heap Scan'),
        planNode('0.1.1', 'Bitmap Index Scan'),
      ]),
      planNode('0.2', 'CTE Scan', { cteName: 'recent_orders' }),
      planNode('0.3', 'Limit', {}, [planNode('0.3.0', 'Materialize')]),
    ])

    const { rerender } = render(<ExecutionPlanDiagram tree={tree} />)
    expect(screen.getAllByTestId('plan-node')).toHaveLength(12)

    fireEvent.click(screen.getByRole('button', { name: /Incremental Sort/ }))
    let inspector = screen.getByLabelText('Plan node details')
    expect(within(inspector).getAllByText('Incremental Sort')).toHaveLength(2)
    expect(
      within(inspector).getByText(
        'orders_with_a_name_long_enough_to_require_safe_layout',
      ),
    ).toBeTruthy()

    rerender(<ExecutionPlanDiagram tree={{ ...tree }} />)
    inspector = screen.getByLabelText('Plan node details')
    expect(within(inspector).getAllByText('Incremental Sort')).toHaveLength(2)
    expect(
      screen
        .getByRole('button', { name: /Incremental Sort/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('highlights referenced nodes and focuses the first AI-linked node without changing the plan', () => {
    const tree = planNode('0', 'Nested Loop', {}, [
      planNode('0.0', 'Hash Join', {}, [planNode('0.0.0', 'Seq Scan')]),
      planNode('0.1', 'Index Scan'),
    ])
    const { rerender } = render(
      <ExecutionPlanDiagram
        tree={tree}
        highlightedNodeIds={['0.0', '0.1']}
        focusNodeId="0.0"
      />,
    )
    const nodes = screen.getAllByTestId('plan-node')
    expect(nodes).toHaveLength(4)
    expect(
      nodes.filter(
        (node) => node.getAttribute('data-ai-highlighted') === 'true',
      ),
    ).toHaveLength(2)
    expect(
      screen
        .getByRole('button', { name: /Hash Join/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    rerender(<ExecutionPlanDiagram tree={tree} />)
    expect(screen.getAllByTestId('plan-node')).toHaveLength(4)
    expect(
      screen
        .getAllByTestId('plan-node')
        .filter((node) => node.getAttribute('data-ai-highlighted') === 'true'),
    ).toHaveLength(0)
  })
})
