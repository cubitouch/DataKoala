import { TextInput } from '../ui/TextInput'
import React from 'react'
void React
import styles from './TimeRange.module.css'
import { DateRangeCalendar } from './DateRangeCalendar'
import { addDays } from '../../lib/customTimeRange'
import type { BuilderTimeRange } from '../../lib/builderTimeRange'

export function CustomDateTimeRangeEditor({ draft, setDraft }: { draft: BuilderTimeRange; setDraft: (value: BuilderTimeRange) => void }) {
  const custom = draft.kind === 'custom'
    ? draft
    : { kind: 'custom' as const, startDate: null, startTime: '00:00', endDate: null, endTime: '00:00', recurringWindows: draft.recurringWindows ?? [] }
  const change = (patch: Partial<typeof custom>) => setDraft({ ...custom, ...patch, kind: 'custom' })
  const visualEndDate = (endDate: string | null, endTime: string) => !endDate ? null : endTime === '00:00' ? addDays(endDate, -1) : endDate
  const changeEndTime = (endTime: string) => {
    const visualEnd = visualEndDate(custom.endDate, custom.endTime)
    change({ endTime, endDate: visualEnd && endTime === '00:00' ? addDays(visualEnd, 1) : visualEnd })
  }
  return <div className={styles.dateTimeEditor}><h4 className={styles.editorTitle}>Start date + time → End date + time</h4><DateRangeCalendar value={{ startDate: custom.startDate, startTime: custom.startTime, endDate: custom.endDate, endTime: custom.endTime, recurringWindows: custom.recurringWindows ?? [] }} onChange={(value) => setDraft({ kind: 'custom', ...value })}/><div className={styles.boundaryGrid}><label>Start time<TextInput className={styles.input} aria-label="Start time" type="time" value={custom.startTime} onValueChange={(text) => change({ startTime: text })}/></label><label>End time<TextInput className={styles.input} aria-label="End time" type="time" value={custom.endTime} onValueChange={changeEndTime}/></label></div></div>
}
