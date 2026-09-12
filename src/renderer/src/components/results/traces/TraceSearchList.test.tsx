import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TraceSearchList } from './TraceSearchList'

afterEach(cleanup)

describe('TraceSearchList', () => {
  const rows = [
    { traceId: 'ok-trace', status: 'OK', rootService: 'checkout', rootOperation: 'POST /orders', durationMs: 1250, startTimeMs: 0, matchedSpans: 3 },
    { traceId: 'error-trace', status: 'ERROR', rootService: 'payments', durationMs: 25, startTimeMs: 0 },
    { traceId: 'unknown-trace', status: 'UNSET', durationMs: 0.5, startTimeMs: 0 }
  ]

  it('presents trace status and opens the selected trace', () => {
    const onOpenTrace = vi.fn()
    render(<TraceSearchList rows={rows} disabled={false} onOpenTrace={onOpenTrace} />)

    expect(screen.getByLabelText('Successful trace')).toBeTruthy()
    expect(screen.getByLabelText('Error trace')).toBeTruthy()
    expect(screen.getByLabelText('Trace status unknown')).toBeTruthy()
    expect(screen.getByText('1.25s')).toBeTruthy()
    expect(screen.getByText('3 matched spans')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /checkout/i }))
    expect(onOpenTrace).toHaveBeenCalledWith('ok-trace')
  })

  it('disables every result while another operation is running', () => {
    render(<TraceSearchList rows={rows} disabled onOpenTrace={vi.fn()} />)

    for (const result of screen.getAllByRole('button')) expect((result as HTMLButtonElement).disabled).toBe(true)
  })
})
