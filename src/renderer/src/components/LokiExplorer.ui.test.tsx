import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LokiExplorer } from './LokiExplorer'
const mocks = vi.hoisted(() => ({ labels: vi.fn(), labelValues: vi.fn(), formatQuery: vi.fn(), runLoki: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { connections: { loki: { labels: mocks.labels, labelValues: mocks.labelValues, formatQuery: mocks.formatQuery } }, query: { runLoki: mocks.runLoki } } }))
import { createQuerySession, useStore } from '../store/useStore'
void React

vi.mock('@uiw/react-codemirror', () => ({ default: ({ value }: { value: string }) => <textarea aria-label="LogQL editor" value={value} readOnly /> }))
vi.mock('echarts-for-react', () => ({ default: () => <div data-testid="loki-echarts" /> }))

const metric = { resultKind: 'metrics' as const, columns: [{ name: 'timestamp', dataTypeID: 0, dataTypeName: 'timestamp' }, { name: 'value', dataTypeID: 0, dataTypeName: 'number' }], rows: [{ timestamp: '2026-01-01T00:00:00Z', value: 2 }], rowCount: 1, durationMs: 1, execution: { provider: 'loki' as const, durationMs: 1 } }
const logs = { resultKind: 'logs' as const, logRows: [], columns: [], rows: [], rowCount: 0, durationMs: 1, execution: { provider: 'loki' as const, durationMs: 1 } }

afterEach(cleanup)
beforeEach(() => {
  const tab = createQuerySession(1, { id: 'loki-tab', connectionProfileId: 'loki', queryMode: 'sql', sql: '{app="x"}' })
  useStore.setState({ tabs: [tab], activeTabId: tab.id })
  mocks.labels.mockReset().mockResolvedValue(['app', 'service'])
  mocks.labelValues.mockReset().mockResolvedValue(['x'])
  mocks.runLoki.mockReset()
})

describe('LokiExplorer execution', () => {
  it('does not request or render a synthetic trend for metric LogQL', async () => {
    useStore.getState().setSql('sum(count_over_time({app="x"}[1m]))')
    const run = mocks.runLoki.mockResolvedValue(metric)
    render(<LokiExplorer connectionId="loki" />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(screen.queryByLabelText('Log volume trend')).toBeNull()
  })

  it('renders the returned log-volume metric chart for log expressions', async () => {
    const run = mocks.runLoki.mockResolvedValueOnce(logs).mockResolvedValueOnce(metric)
    render(<LokiExplorer connectionId="loki" />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2))
    expect(screen.getByLabelText('Log volume trend')).toBeTruthy()
    expect(screen.getByTestId('loki-echarts')).toBeTruthy()
  })
})
