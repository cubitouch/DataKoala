import React from 'react'
void React
import styles from './TimeRange.module.css'
import { quickRanges, type CustomTimeRangeValue } from '../../lib/customTimeRange'
export function QuickRangeList({ value, onSelect, today }: { value: CustomTimeRangeValue; onSelect: (value: CustomTimeRangeValue) => void; today?: string }) {
  return <div className={styles.quickList} aria-label="Quick ranges">{quickRanges(today).map((range) => {
    const active = value.startDate === range.startDate && value.endDate === range.endDate
    return <button key={range.id} type="button" className={styles.quickPill} aria-pressed={active} onClick={() => onSelect({ startDate: range.startDate, startTime: '00:00', endDate: range.endDate, endTime: '00:00', recurringWindows: value.recurringWindows })}>{range.label}</button>
  })}</div>
}
