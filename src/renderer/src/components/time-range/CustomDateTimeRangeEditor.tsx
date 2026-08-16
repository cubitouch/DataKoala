import React from 'react'
void React
import styles from './TimeRange.module.css'
import { DateRangeCalendar } from './DateRangeCalendar'
import { addDays } from '../../lib/customTimeRange'
import type { BuilderTimeRange } from '../../lib/builderTimeRange'

export function CustomDateTimeRangeEditor({ draft, setDraft }: { draft: Extract<BuilderTimeRange, { kind: 'custom' }>; setDraft: (value: BuilderTimeRange) => void }) {
  const change = (patch: Partial<typeof draft>) => setDraft({ ...draft, ...patch, kind: 'custom' })
  const visualEndDate = (endDate: string | null, endTime: string) => !endDate ? null : endTime === '00:00' ? addDays(endDate, -1) : endDate
  const changeEndTime = (endTime: string) => {
    const visualEnd = visualEndDate(draft.endDate, draft.endTime)
    change({ endTime, endDate: visualEnd && endTime === '00:00' ? addDays(visualEnd, 1) : visualEnd })
  }
  return <div className={styles.dateTimeEditor}><h4 className={styles.editorTitle}>Start date + time → End date + time</h4><DateRangeCalendar value={{ startDate: draft.startDate, startTime: draft.startTime, endDate: draft.endDate, endTime: draft.endTime, recurringWindows: draft.recurringWindows ?? [] }} onChange={(value) => setDraft({ kind: 'custom', ...value })}/><div className={styles.boundaryGrid}><label>Start time<input className={styles.input} aria-label="Start time" type="time" value={draft.startTime} onChange={(e) => change({ startTime: e.target.value })}/></label><label>End time<input className={styles.input} aria-label="End time" type="time" value={draft.endTime} onChange={(e) => changeEndTime(e.target.value)}/></label></div></div>
}
