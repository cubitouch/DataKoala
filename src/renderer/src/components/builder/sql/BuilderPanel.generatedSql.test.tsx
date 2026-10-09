// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { DatabaseSchemaNode } from '@shared/types'

vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value }: { value: string }) => <pre>{value}</pre>,
}))
vi.mock('@lib/api', () => ({
  api: {
    query: {
      run: vi.fn(),
      seriesStatistics: vi.fn(),
      probeSeriesCardinality: vi.fn(),
    },
    connections: { describeTable: vi.fn() },
  },
}))

import { BuilderPanel } from './BuilderPanel'
import {
  activeTestSession,
  patchActiveTestSession,
  resetTestStore,
  setActiveTestMetadata,
} from '@test/sessionTestUtils'
import { useStore } from '@store/useStore'

const schemas: DatabaseSchemaNode[] = [
  {
    name: 'demo_shop',
    isSystem: false,
    relations: [
      {
        schema: 'demo_shop',
        name: 'events',
        kind: 'r',
        qualifiedName: 'demo_shop.events',
        columnsStatus: 'loaded',
        columns: [
          { name: 'created_at', dataTypeName: 'timestamp with time zone' },
        ],
      },
    ],
  },
]

afterEach(() => {
  cleanup()
  resetTestStore()
})

describe('Builder generated SQL header', () => {
  it('keeps Open in SQL mode available while collapsed without toggling the preview', () => {
    resetTestStore({})
    setActiveTestMetadata(schemas, 'loaded', null, 'p1')
    patchActiveTestSession({
      connectionProfileId: 'p1',
      queryMode: 'builder',
      sql: '',
      builder: {
        table: { schema: 'demo_shop', name: 'events' },
        timeColumn: 'created_at',
        timeBucket: 'hour',
        seriesColumns: [],
        timeRange: { kind: 'rolling', amount: 7, unit: 'day' },
      },
      builderVisualization: {
        ...activeTestSession().builderVisualization,
        xColumn: 'created_at',
        valueColumn: null,
        aggregation: 'count',
        seriesColumn: null,
        seriesColumns: [],
      },
    })

    render(<BuilderPanel />)
    const title = screen.getByText('Generated SQL') as HTMLElement
    const details = title.closest('details') as HTMLDetailsElement
    const panel = title.closest('[data-generated-query-panel]') as HTMLElement
    const openButton = screen.getByRole('button', {
      name: 'Open in SQL mode',
    }) as HTMLButtonElement

    expect(details.open).toBe(false)
    expect(panel).toBeTruthy()
    expect(details.hasAttribute('data-collapsible-section')).toBe(true)
    expect(openButton.disabled).toBe(false)
    fireEvent.click(openButton)
    expect(details.open).toBe(false)
    expect(activeTestSession().queryMode).toBe('sql')
    expect(activeTestSession().sql).toContain('SELECT')
  })

  it('preserves raw SQL through Builder changes and normal mode switches until the explicit handoff', async () => {
    const manualSql = 'select distinct manual_edit from private_draft'
    resetTestStore({})
    setActiveTestMetadata(schemas, 'loaded', null, 'p1')
    patchActiveTestSession({
      connectionProfileId: 'p1',
      queryMode: 'sql',
      sql: manualSql,
      builder: {
        table: { schema: 'demo_shop', name: 'events' },
        timeColumn: 'created_at',
        timeBucket: 'hour',
        seriesColumns: [],
        timeRange: { kind: 'rolling', amount: 7, unit: 'day' },
      },
      builderVisualization: {
        ...activeTestSession().builderVisualization,
        xColumn: 'created_at',
        valueColumn: null,
        aggregation: 'count',
        seriesColumn: null,
        seriesColumns: [],
      },
    })

    render(<BuilderPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Builder' }))
    useStore.getState().setBuilder({ timeBucket: 'day' })
    expect(activeTestSession().sql).toBe(manualSql)

    fireEvent.click(screen.getByRole('button', { name: 'SQL' }))
    expect(activeTestSession().sql).toBe(manualSql)
    fireEvent.click(screen.getByRole('button', { name: 'Builder' }))
    expect(activeTestSession().sql).toBe(manualSql)

    const preview = screen.getByText(
      (_, element) =>
        element?.tagName === 'PRE' &&
        element.textContent?.includes('SELECT') === true,
    )
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const toolbarCopy = document.querySelector(
      '[data-query-toolbar] [aria-label="Copy SQL to clipboard"]',
    ) as HTMLButtonElement
    fireEvent.click(toolbarCopy)
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(preview.textContent),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open in SQL mode' }))
    expect(activeTestSession().queryMode).toBe('sql')
    expect(activeTestSession().sql).toBe(preview.textContent)
    expect(activeTestSession().sql).not.toBe(manualSql)
  })
})
