import React from 'react'
void React
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { selectedLokiTrendRange } from '../lib/lokiTrendRange.ts'

const mocks = vi.hoisted(() => ({ dispatchAction: vi.fn() }))
vi.mock('echarts-for-react', () => ({ default: ({ onChartReady, onEvents }: { onChartReady: (chart: { dispatchAction: typeof mocks.dispatchAction }) => void; onEvents: { brushEnd: (event: unknown) => void } }) => { onChartReady({ dispatchAction: mocks.dispatchAction }); return <button onClick={() => onEvents.brushEnd({ areas: [{ coordRange: [100, 2100] }] })}>Drag chart</button> } }))
import { LokiTrendChart } from './LokiTrendChart.tsx'

afterEach(() => { cleanup(); mocks.dispatchAction.mockReset() })
const result = { columns: [{ name: 'timestamp', dataTypeID: 0, dataTypeName: 'timestamp' }, { name: 'value', dataTypeID: 0, dataTypeName: 'number' }], rows: [{ timestamp: '2026-01-01T00:00:00Z', value: 2 }], rowCount: 1, durationMs: 1 }

describe('Loki trend brushing', () => {
  it('extracts a bounded horizontal brush range', () => {
    expect(selectedLokiTrendRange({ areas: [{ coordRange: [100, 200] }] })).toEqual({ startMs: 100, endMs: 200 })
    expect(selectedLokiTrendRange({ areas: [{ coordRange: [200, 100] }] })).toBeNull()
  })
  it('activates line-X brushing and delivers a real chart brush event', () => {
    const selected = vi.fn()
    render(<LokiTrendChart result={result} view="line" onRangeSelected={selected} />)
    expect(mocks.dispatchAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'takeGlobalCursor', brushOption: expect.objectContaining({ brushType: 'lineX' }) }))
    fireEvent.click(screen.getByRole('button', { name: 'Drag chart' }))
    expect(selected).toHaveBeenCalledWith({ startMs: 100, endMs: 2100 })
  })
})
