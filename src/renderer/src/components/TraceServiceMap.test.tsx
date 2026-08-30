import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('echarts-for-react', async () => {
  const ReactModule = await import('react')
  return {
    default: class MockECharts extends ReactModule.Component {
      getEchartsInstance() { return { resize: vi.fn() } }
      render() { return ReactModule.createElement('div', { 'data-testid': 'service-map-chart' }) }
    }
  }
})

import { TraceServiceMap } from './TraceServiceMap'
import type { TraceCohortAggregate, TraceCohortEdge, TraceCohortNode } from '../lib/traceCohort'

function node(id: string, rootTraceCount = 0): TraceCohortNode {
  return {
    id,
    label: id,
    traceCount: 10,
    traceRate: 1,
    rootTraceCount,
    spanCount: 10,
    errorTraceCount: 0,
    errorRate: 0,
    incidentImpact: 1
  }
}

function edge(source: string, target: string, kind: TraceCohortEdge['kind'], rank: number): TraceCohortEdge {
  return {
    key: `${source}->${target}`,
    source,
    target,
    sourceLabel: source,
    targetLabel: target,
    kind,
    traceCount: 10,
    traceRate: 1,
    callCount: 10,
    callsPerAffectedTrace: 1,
    errorCount: 0,
    errorTraceCount: 0,
    errorRate: 0,
    p50Ms: 10,
    p95Ms: 20,
    baselineMedianMs: 10,
    slowMedianMs: 10,
    slowDeltaMs: 0,
    baselineObservedTraceCount: 5,
    slowObservedTraceCount: 2,
    latencyComparisonAvailable: true,
    baselinePresenceRate: 1,
    slowPresenceRate: 1,
    slowPresenceLift: 0,
    impact: Math.max(1, 20 - rank),
    rank,
    traceIds: [],
    slowTraceIds: []
  }
}

const aggregate: TraceCohortAggregate = {
  traceCount: 10,
  p50DurationMs: 200,
  p95DurationMs: 500,
  baselineThresholdMs: 200,
  slowThresholdMs: 450,
  baselineTraceCount: 5,
  slowTraceCount: 2,
  nodes: [node('root', 10), node('inventory'), node('kafka'), node('worker'), node('warehouse')],
  edges: [
    edge('root', 'inventory', 'sync', 1),
    edge('root', 'kafka', 'async', 2),
    edge('kafka', 'worker', 'async', 3),
    edge('worker', 'warehouse', 'sync', 4)
  ]
}

function aggregateWithEdges(count: number): TraceCohortAggregate {
  const nodes = [node('root', 10), ...Array.from({ length: count }, (_, index) => node(`service-${index + 1}`))]
  return {
    ...aggregate,
    nodes,
    edges: Array.from({ length: count }, (_, index) => edge('root', `service-${index + 1}`, 'sync', index + 1))
  }
}

function renderMap(value: TraceCohortAggregate = aggregate) {
  return render(<TraceServiceMap
    aggregate={value}
    traces={[]}
    progress={{ status: 'ready', completed: 10, total: 10, failed: 0 }}
    searchTraceCount={10}
    sampleLimit={100}
    onSampleLimitChange={vi.fn()}
    onRetry={vi.fn()}
    onStop={vi.fn()}
    onOpenTrace={vi.fn()}
  />)
}

afterEach(cleanup)

describe('TraceServiceMap controls', () => {
  it('switches between entire, main and async branch scopes without re-analysis', async () => {
    renderMap()
    const map = document.querySelector('[data-trace-service-map]')!
    expect(map.getAttribute('data-branch-scope')).toBe('all')

    fireEvent.click(screen.getByRole('combobox', { name: 'Branch scope: Entire transaction' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Main transaction' }))
    expect(map.getAttribute('data-branch-scope')).toBe('main')
    expect(screen.getByText('2/5')).toBeTruthy()
    expect(screen.getByText('1/4')).toBeTruthy()
    expect(screen.getByText('Async boundaries and their downstream work are hidden')).toBeTruthy()

    fireEvent.click(screen.getByRole('combobox', { name: 'Branch scope: Main transaction' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Async branches' }))
    expect(map.getAttribute('data-branch-scope')).toBe('async')
    expect(screen.getByText('4/5')).toBeTruthy()
    expect(screen.getByText('3/4')).toBeTruthy()
    expect(screen.getByText('Includes downstream work after the first async boundary')).toBeTruthy()
  })

  it('expands below the titlebar, keeps branch scope and exits with Escape', async () => {
    renderMap()
    const graph = document.querySelector('[data-service-map-graph-fullscreen]') as HTMLElement
    expect(graph.getAttribute('data-service-map-graph-fullscreen')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Open service map full screen' }))
    await waitFor(() => expect(graph.getAttribute('data-service-map-graph-fullscreen')).toBe('true'))
    expect(graph.style.top).toBe('40px')
    expect(screen.getByRole('button', { name: 'Exit service map full screen' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Branch scope: Entire transaction' })).toBeTruthy()
    expect(document.querySelector('aside[aria-label="Full screen service map bottlenecks"]')).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(graph.getAttribute('data-service-map-graph-fullscreen')).toBe('false'))
  })

  it('caps both embedded and fullscreen bottleneck lists at the scoped Top 10', async () => {
    renderMap(aggregateWithEdges(12))
    const embedded = document.querySelector('aside[aria-label="Service map bottleneck analysis"]')!
    expect(embedded.querySelectorAll('[data-service-map-bottleneck]')).toHaveLength(10)

    fireEvent.click(screen.getByRole('button', { name: 'Open service map full screen' }))
    const fullscreen = await waitFor(() => {
      const panel = document.querySelector('aside[aria-label="Full screen service map bottlenecks"]')
      expect(panel).toBeTruthy()
      return panel!
    })
    expect(fullscreen.querySelectorAll('[data-service-map-bottleneck]')).toHaveLength(10)
    expect(fullscreen.textContent).toContain('#10')
  })
})
