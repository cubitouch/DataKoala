// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
    </section>
  ),
}))

const tree: ExplainNode = {
  id: '0',
  plan: 'Limit',
  nodeType: 'Limit',
  children: [
    {
      id: '0.1',
      plan: 'Seq Scan',
      nodeType: 'Seq Scan',
      planRows: 120,
      actualRows: 84_000,
      loops: 1,
      children: [],
    },
    {
      id: '0.4',
      plan: 'Sort',
      nodeType: 'Sort',
      sortMethod: 'external merge',
      tempWrittenBlocks: 4,
      children: [],
    },
  ],
}

function graph() {
  return screen.getByLabelText('Execution plan diagram')
}

async function requestHints() {
  const analyzeButton = await screen.findByRole('button', {
    name: 'Analyze performance',
  })
  fireEvent.click(analyzeButton)
  return screen.findByRole('button', { name: /AI finds a filtered scan/ })
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
          evidence: '84,000 actual rows.',
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

describe('Explain hint and diagnostic selection', () => {
  it('clears the AI hint and focuses only the selected diagnostic', async () => {
    render(<ExplainPane />)
    const hint = await requestHints()
    fireEvent.click(hint)
    await waitFor(() => {
      expect(graph().dataset.highlightedNodeIds).toBe('0.1')
      expect(graph().dataset.focusNodeId).toBe('0.1')
    })

    const diagnostic = screen.getByRole('button', {
      name: /External sort used temporary storage/,
    })
    fireEvent.click(diagnostic)

    await waitFor(() => {
      expect(hint.getAttribute('aria-pressed')).toBe('false')
      expect(diagnostic.getAttribute('aria-pressed')).toBe('true')
      expect(graph().dataset.selectedNodeId).toBe('0.4')
      expect(graph().dataset.highlightedNodeIds).toBe('0.4')
      expect(graph().dataset.focusNodeId).toBe('0.4')
    })
  })

  it('clears the diagnostic and focuses only the selected AI hint', async () => {
    render(<ExplainPane />)
    const diagnostic = screen.getByRole('button', {
      name: /External sort used temporary storage/,
    })
    fireEvent.click(diagnostic)
    await waitFor(() => {
      expect(graph().dataset.highlightedNodeIds).toBe('0.4')
      expect(graph().dataset.focusNodeId).toBe('0.4')
    })

    const hint = await requestHints()
    fireEvent.click(hint)

    await waitFor(() => {
      expect(diagnostic.getAttribute('aria-pressed')).toBe('false')
      expect(hint.getAttribute('aria-pressed')).toBe('true')
      expect(graph().dataset.selectedNodeId).toBe('0.1')
      expect(graph().dataset.highlightedNodeIds).toBe('0.1')
      expect(graph().dataset.focusNodeId).toBe('0.1')
    })
  })
})
