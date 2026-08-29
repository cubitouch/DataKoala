import React, { useState } from 'react'
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CustomDateTimeRangeEditor } from './CustomDateTimeRangeEditor'
import type { BuilderTimeRange } from '../../lib/builderTimeRange'

afterEach(cleanup)

type CustomBuilderTimeRange = Extract<BuilderTimeRange, { kind: 'custom' }>

function EditorView({ initial }: { initial: CustomBuilderTimeRange }) {
  const [draft, setDraft] = useState<BuilderTimeRange>(initial)
  return <>{draft.kind === 'custom' && <CustomDateTimeRangeEditor draft={draft} setDraft={setDraft}/>}<output aria-label="value">{JSON.stringify(draft)}</output></>
}

const readDraft = () => JSON.parse(screen.getByLabelText('value').textContent ?? '{}') as BuilderTimeRange

describe('CustomDateTimeRangeEditor end time changes', () => {
  it('preserves the visual end date when changing midnight to a non-midnight time', () => {
    render(<EditorView initial={{ kind: 'custom', startDate: '2026-07-01', startTime: '00:00', endDate: '2026-08-01', endTime: '00:00', recurringWindows: [] }} />)
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '14:00' } })
    expect(readDraft()).toMatchObject({ endDate: '2026-07-31', endTime: '14:00' })
  })

  it('keeps the visual end date when changing a non-midnight time to midnight', () => {
    render(<EditorView initial={{ kind: 'custom', startDate: '2026-07-01', startTime: '00:00', endDate: '2026-07-31', endTime: '14:00', recurringWindows: [] }} />)
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '00:00' } })
    expect(readDraft()).toMatchObject({ endDate: '2026-08-01', endTime: '00:00' })
  })

  it('does not drift the end date when toggling between midnight and non-midnight repeatedly', () => {
    render(<EditorView initial={{ kind: 'custom', startDate: '2026-07-01', startTime: '00:00', endDate: '2026-08-01', endTime: '00:00', recurringWindows: [] }} />)
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '14:00' } })
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '00:00' } })
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '09:30' } })
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '00:00' } })
    expect(readDraft()).toMatchObject({ endDate: '2026-08-01', endTime: '00:00' })
  })
})
