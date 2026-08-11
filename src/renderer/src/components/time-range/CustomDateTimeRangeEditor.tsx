import React from 'react'
void React
import { DateRangeCalendar } from './DateRangeCalendar'
import { addDays } from '../../lib/customTimeRange'
import { RecurringTimeWindowEditor } from './RecurringTimeWindowEditor'
import type { BuilderTimeRange } from '../../lib/builderTimeRange'

export function CustomDateTimeRangeEditor({ draft, setDraft, error }: { draft: BuilderTimeRange; setDraft: (value: BuilderTimeRange) => void; error?: string | null }) {
  const custom = draft.kind === 'custom' ? draft : { kind: 'custom' as const, startDate: null, startTime: '00:00', endDate: null, endTime: '00:00', recurringWindows: [] }
  const change = (patch: Partial<typeof custom>) => setDraft({ ...custom, ...patch, kind: 'custom' })
  const visualEndDate = (endDate: string | null, endTime: string) => !endDate ? null : endTime === '00:00' ? addDays(endDate, -1) : endDate
  const changeEndTime = (endTime: string) => {
    const visualEnd = visualEndDate(custom.endDate, custom.endTime)
    change({ endTime, endDate: visualEnd && endTime === '00:00' ? addDays(visualEnd, 1) : visualEnd })
  }
  return <div className="custom-datetime-editor"><h4>Start date + time → End date + time</h4><DateRangeCalendar value={{ startDate: custom.startDate, startTime: custom.startTime, endDate: custom.endDate, endTime: custom.endTime, recurringWindows: custom.recurringWindows ?? [] }} onChange={(value) => setDraft({ kind: 'custom', ...value })}/><div className="boundary-time-grid"><label>Start time<input className="custom-time-input" aria-label="Start time" type="time" value={custom.startTime} onChange={(e) => change({ startTime: e.target.value })}/></label><label>End time<input className="custom-time-input" aria-label="End time" type="time" value={custom.endTime} onChange={(e) => changeEndTime(e.target.value)}/></label></div><RecurringTimeWindowEditor windows={custom.recurringWindows ?? []} onChange={(recurringWindows) => change({ recurringWindows })} error={error}/></div>
}
