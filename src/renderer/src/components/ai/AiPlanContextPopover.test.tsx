// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AiExecutionPlanContext, AiPlanAnalysis } from '@shared/ai'
import { AiPlanContextPopover } from './AiPlanContextPopover'

afterEach(cleanup)

const plan: AiExecutionPlanContext = {
  truncated: false,
  nodes: [{ id: '0', nodeType: 'Seq Scan' }],
}

describe('AiPlanContextPopover', () => {
  it('uses the shared AI details layout for request and response information', () => {
    const response: AiPlanAnalysis = {
      summary: 'The scan read many rows.',
      hints: [
        {
          title: 'Review scan selectivity',
          detail: 'The scan returns a large number of rows.',
          severity: 'warning',
          nodeIds: ['0'],
          evidence: 'Node 0 returned 900 rows.',
        },
      ],
    }

    render(
      <AiPlanContextPopover
        mode="analyze"
        sql="select * from orders"
        plan={plan}
        response={response}
        sent
      />,
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Inspect Analyze performance request',
      }),
    )

    expect(screen.getByText('AI details')).toBeTruthy()
    expect(screen.getByText('Submitted context')).toBeTruthy()
    expect(screen.getByLabelText('Captured SQL')).toBeTruthy()
    expect(screen.getByText('select * from orders')).toBeTruthy()
    expect(screen.getByLabelText('AI response')).toBeTruthy()
    expect(screen.getByText('Review scan selectivity')).toBeTruthy()
    expect(screen.getByText('About this request')).toBeTruthy()
  })
})
