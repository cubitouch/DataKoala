// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ExplainNode } from '@shared/types'
import { ExplainPane } from './ExplainPane'
import { patchActiveTestSession, resetTestStore } from '@test/sessionTestUtils'

const { getAiSettings, analyzePlan, cancelPlan } = vi.hoisted(() => ({
  getAiSettings: vi.fn(),
  analyzePlan: vi.fn(),
  cancelPlan: vi.fn(),
}))

vi.mock('@lib/api', () => ({
  api: {
    ai: {
      settings: { get: getAiSettings },
      analyzePlan,
      cancel: cancelPlan,
    },
  },
}))

vi.mock('./ExecutionPlanGraph', () => ({
  ExecutionPlanGraph: ({
    selectedNodeId,
    highlightedNodeIds = [],
    focusNodeId,
    onSelectNode,
  }: {
    selectedNodeId: string
    highlightedNodeIds?: readonly string[]
    focusNodeId?: string | null
    onSelectNode(nodeId: string): void
  }) => (
    <section
      aria-label="Execution plan diagram"
      data-selected-node-id={selectedNodeId}
      data-highlighted-node-ids={highlightedNodeIds.join(',')}
      data-focus-node-id={focusNodeId ?? ''}
    >
      <button type="button" onClick={() => onSelectNode('0.1')}>
        Select graph node 0.1
      </button>
      <button type="button" onClick={() => onSelectNode('0.2')}>
        Select graph node 0.2
      </button>
      <button type="button" onClick={() => onSelectNode('0.4')}>
        Select graph node 0.4
      </button>
    </section>
  ),
}))

const tree: ExplainNode = {
  id: '0',
  plan: 'Limit',
  nodeType: 'Limit',
  planRows: 120,
  actualRows: 84_000,
  loops: 1,
  children: [
    {
      id: '0.1',
      plan: 'Sort',
      nodeType: 'Sort',
      planRows: 1_000,
      actualRows: 10_000,
      loops: 1,
      sortMethod: 'external merge',
      tempWrittenBlocks: 4,
      tempReadBlocks: 3,
      children: [],
    },
    {
      id: '0.2',
      plan: 'Seq Scan',
      nodeType: 'Seq Scan',
      planRows: 100,
      actualRows: 101,
      loops: 1,
      children: [],
    },
    {
      id: '0.4',
      plan: 'Hash Join',
      nodeType: 'Hash Join',
      planRows: 10,
      actualRows: 900,
      loops: 1,
      children: [],
    },
  ],
}

function graph() {
  return screen.getByLabelText('Execution plan diagram')
}

function inspector() {
  return screen.getByLabelText('Plan node details')
}

function performanceHints() {
  return screen.getByLabelText('Performance hints')
}

beforeEach(() => {
  getAiSettings.mockReset().mockResolvedValue({
    ok: true,
    value: { provider: 'openrouter', model: 'preview/model', hasApiKey: true },
  })
  analyzePlan.mockReset().mockResolvedValue({
    ok: true,
    value: {
      summary: 'Review the scan.',
      hints: [
        {
          title: 'AI finds a filtered scan',
          action: 'Review the filtered rows.',
          detail: 'The scan may affect the plan choice.',
          severity: 'warning',
          nodeIds: ['0.1'],
          evidence: '10,000 actual rows.',
        },
        {
          title: 'A hint without a proposed action',
          action: null,
          detail: 'Supporting explanation remains visible.',
          severity: 'info',
          nodeIds: ['0.2'],
          evidence: '101 actual rows.',
        },
      ],
    },
  })
  cancelPlan.mockReset().mockResolvedValue({ ok: true, value: undefined })

  resetTestStore({
    profiles: [
      {
        kind: 'postgres',
        version: 2,
        id: 'pg',
        name: 'PostgreSQL',
        host: 'localhost',
        port: 5432,
        database: 'db',
        user: 'user',
        password: '',
        tlsMode: 'disable',
        readonly: true,
      },
    ],
    activeProfileId: 'pg',
  })
  patchActiveTestSession({
    connectionProfileId: 'pg',
    sql: 'select * from events',
    explainText: 'analyzed plan',
    explainTree: tree,
    explainSnapshot: {
      query: 'select * from events',
      mode: 'analyze',
      executionTimeMs: 30,
    },
    showExplain: true,
    activeExplainRequest: null,
  })
})

afterEach(() => {
  cleanup()
  resetTestStore()
})

describe('Explain node signals and AI performance hints', () => {
  it('shows only signals for the selected node, including multiple facts on one node', () => {
    render(<ExplainPane />)
    const details = within(inspector())

    expect(details.getByRole('heading', { name: 'Signals' })).toBeTruthy()
    expect(inspector().contains(screen.getByLabelText('Plan signals'))).toBe(
      true,
    )
    expect(within(inspector()).queryAllByRole('button')).toHaveLength(0)
    expect(details.getByText('Material row estimate mismatch')).toBeTruthy()
    expect(
      details.queryByText('External sort used temporary storage'),
    ).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'Select graph node 0.1' }),
    )
    expect(details.getByText('Material row estimate mismatch')).toBeTruthy()
    expect(
      details.getByText('External sort used temporary storage'),
    ).toBeTruthy()
    expect(details.getByText('4 temp blocks written · 3 read')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Select graph node 0.2' }),
    )
    expect(details.queryByRole('heading', { name: 'Signals' })).toBeNull()
    expect(details.queryByText('Material row estimate mismatch')).toBeNull()
    expect(
      details.queryByText('External sort used temporary storage'),
    ).toBeNull()
  })

  it('offers optional analysis in Performance hints and selecting an AI hint updates the inspector node', async () => {
    render(<ExplainPane />)
    const heading = screen.getByText('EXPLAIN ANALYZE').closest('header')
    expect(heading).toBeTruthy()
    expect(
      within(heading!).queryByRole('button', { name: /Analyze performance/ }),
    ).toBeNull()
    expect(analyzePlan).not.toHaveBeenCalled()

    const runButton = await screen.findByRole('button', {
      name: 'Run analysis',
    })
    expect(performanceHints().contains(runButton)).toBe(true)
    expect(
      within(performanceHints()).getByRole('button', {
        name: 'Inspect Analyze performance request',
      }),
    ).toBeTruthy()
    expect(inspector().contains(screen.getByLabelText('Plan signals'))).toBe(
      true,
    )

    fireEvent.click(runButton)
    const hint = await screen.findByRole('button', {
      name: /AI finds a filtered scan/,
    })
    expect(analyzePlan).toHaveBeenCalledTimes(1)
    fireEvent.click(hint)

    await waitFor(() => {
      expect(graph().dataset.selectedNodeId).toBe('0.1')
      expect(graph().dataset.highlightedNodeIds).toBe('0.1')
      expect(graph().dataset.focusNodeId).toBe('0.1')
      expect(
        within(inspector()).getByText('External sort used temporary storage'),
      ).toBeTruthy()
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Select graph node 0.4' }),
    )
    expect(graph().dataset.selectedNodeId).toBe('0.4')
    expect(graph().dataset.highlightedNodeIds).toBe('0.1')
    expect(graph().dataset.focusNodeId).toBe('0.1')
    expect(
      within(inspector()).getByText('Material row estimate mismatch'),
    ).toBeTruthy()
    expect(hint.getAttribute('aria-pressed')).toBe('true')

    const noActionHint = screen.getByRole('button', {
      name: /A hint without a proposed action/,
    })
    expect(noActionHint.querySelectorAll('strong')).toHaveLength(0)
  })

  it('shows replacement Explain requests over the stale plan and updates the mode immediately', async () => {
    patchActiveTestSession({
      explainSnapshot: {
        query: 'select * from events',
        mode: 'explain',
      },
      explainText: 'old EXPLAIN plan',
    })
    render(<ExplainPane />)

    expect(screen.getByRole('heading', { name: 'EXPLAIN' })).toBeTruthy()
    expect(graph()).toBeTruthy()
    expect(screen.getByText('old EXPLAIN plan')).toBeTruthy()

    act(() => patchActiveTestSession({ activeExplainRequest: 'analyze' }))

    expect(
      screen.getByRole('heading', { name: 'EXPLAIN ANALYZE' }),
    ).toBeTruthy()
    expect(screen.getByText('Running EXPLAIN ANALYZE…')).toBeTruthy()
    expect(graph()).toBeTruthy()
    const staleContent = screen.getByTestId('explain-content-body')
    expect(staleContent.hasAttribute('inert')).toBe(true)
    expect(staleContent.closest('[aria-busy="true"]')).toBeTruthy()
    expect(screen.getByTestId('explain-loading-overlay')).toBeTruthy()

    const analyzedTree: ExplainNode = {
      id: '0',
      plan: 'new analyzed plan',
      nodeType: 'Hash Join',
      planRows: 10,
      actualRows: 900,
      loops: 1,
      children: [],
    }
    act(() =>
      patchActiveTestSession({
        explainText: 'new analyzed plan text',
        explainTree: analyzedTree,
        explainSnapshot: {
          query: 'select * from events',
          mode: 'analyze',
          executionTimeMs: 12,
        },
        activeExplainRequest: null,
      }),
    )

    expect(screen.queryByTestId('explain-loading-overlay')).toBeNull()
    expect(
      screen.getByRole('heading', { name: 'EXPLAIN ANALYZE' }),
    ).toBeTruthy()
    expect(
      within(inspector()).getByRole('heading', { name: 'Hash Join' }),
    ).toBeTruthy()
    expect(screen.getByText('new analyzed plan text')).toBeTruthy()

    act(() => patchActiveTestSession({ activeExplainRequest: 'explain' }))
    expect(screen.getByRole('heading', { name: 'EXPLAIN' })).toBeTruthy()
    expect(screen.getByText('Generating query plan…')).toBeTruthy()
    expect(
      screen.getByTestId('explain-content-body').hasAttribute('inert'),
    ).toBe(true)
  })

  it('shows Cancel without a duplicate Run action while analysis is busy', async () => {
    let resolveAnalysis!: (value: unknown) => void
    analyzePlan.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAnalysis = resolve
        }),
    )
    render(<ExplainPane />)
    fireEvent.click(await screen.findByRole('button', { name: 'Run analysis' }))

    expect(
      await screen.findByText('Analyzing the captured execution plan…'),
    ).toBeTruthy()
    expect(
      within(performanceHints()).getByRole('button', { name: 'Cancel' }),
    ).toBeTruthy()
    expect(
      within(performanceHints()).queryByRole('button', {
        name: 'Run analysis',
      }),
    ).toBeNull()

    fireEvent.click(
      within(performanceHints()).getByRole('button', { name: 'Cancel' }),
    )
    await waitFor(() => expect(cancelPlan).toHaveBeenCalledTimes(1))
    resolveAnalysis({ ok: true, value: { summary: '', hints: [] } })
  })
})
