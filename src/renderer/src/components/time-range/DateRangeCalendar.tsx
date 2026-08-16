import React from 'react'
import { useMemo, useRef, useState } from 'react'
import styles from './TimeRange.module.css'
import { addDays, compareDateOnly, dateOnlyToUtcDate, formatDateOnly, parseDateOnly, todayDateOnly, type CustomTimeRangeValue } from '../../lib/customTimeRange'
const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const monthName = (y: number, m: number) => new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)))
export function DateRangeCalendar({ value, onChange }: { value: CustomTimeRangeValue; onChange: (value: CustomTimeRangeValue) => void }) {
  const initial = value.startDate ?? todayDateOnly()
  const [month, setMonth] = useState(() => { const p = parseDateOnly(initial); return `${p.year}-${String(p.month).padStart(2, '0')}` })
  const [focusDate, setFocusDate] = useState(initial)
  const dayRefs = useRef(new Map<string, HTMLButtonElement>())
  const p = parseDateOnly(`${month}-01`)
  const days = useMemo(() => { const first = dateOnlyToUtcDate(`${month}-01`); const offset = (first.getUTCDay() || 7) - 1; const start = addDays(formatDateOnly(first), -offset); return Array.from({ length: 42 }, (_, i) => addDays(start, i)) }, [month])
  const moveMonth = (delta: number) => { const d = new Date(Date.UTC(p.year, p.month - 1 + delta, 1)); setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`) }
  const visualEndToBoundary = (day: string) => value.endTime === '00:00' ? addDays(day, 1) : day
  const select = (day: string) => {
    let next: CustomTimeRangeValue
    if (!value.startDate || value.endDate) next = { ...value, startDate: day, endDate: null }
    else next = compareDateOnly(day, value.startDate) < 0 ? { ...value, startDate: day, endDate: visualEndToBoundary(value.startDate) } : { ...value, endDate: visualEndToBoundary(day) }
    onChange(next); setFocusDate(day)
  }
  const focusDay = (day: string) => {
    setFocusDate(day)
    window.requestAnimationFrame(() => dayRefs.current.get(day)?.focus())
  }
  const key = (e: React.KeyboardEvent<HTMLButtonElement>, day: string) => { let delta = 0; if (e.key === 'ArrowLeft') delta = -1; if (e.key === 'ArrowRight') delta = 1; if (e.key === 'ArrowUp') delta = -7; if (e.key === 'ArrowDown') delta = 7; if (delta) { e.preventDefault(); const next = addDays(day, delta); const np = parseDateOnly(next); setMonth(`${np.year}-${String(np.month).padStart(2, '0')}`); focusDay(next) } }
  const start = value.startDate, visualEndDate = value.endDate && value.endTime === '00:00' ? addDays(value.endDate, -1) : value.endDate, today = todayDateOnly()
  return <div className={styles.calendar}><div className={styles.calendarHead}><button type="button" className={styles.iconButton} aria-label="Previous month" onClick={() => moveMonth(-1)}>‹</button><strong>{monthName(p.year, p.month)}</strong><button type="button" className={styles.iconButton} aria-label="Next month" onClick={() => moveMonth(1)}>›</button></div>
  <div className={styles.monthYearPicker}><label>Month<select className={styles.input} aria-label="Month" value={p.month} onChange={(e) => setMonth(`${p.year}-${String(Number(e.target.value)).padStart(2, '0')}`)}>{Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>{new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2020, i, 1)))}</option>)}</select></label><label>Year<input className={styles.input} aria-label="Year" type="number" value={p.year} onChange={(e) => setMonth(`${e.target.value.padStart(4, '0')}-${String(p.month).padStart(2, '0')}`)}/></label></div>
  <div className={styles.calendarGrid} role="grid" aria-label="Date range calendar">{DOW.map((d) => <span className={styles.dayOfWeek} key={d}>{d}</span>)}{days.map((day) => { const dp = parseDateOnly(day); const selected = Boolean(start && visualEndDate && day >= start && day <= visualEndDate) || day === start; const marker = day === start || day === visualEndDate; return <button key={day} ref={(element) => { if (element) dayRefs.current.set(day, element); else dayRefs.current.delete(day) }} type="button" role="gridcell" aria-label={day} aria-selected={selected} data-range-boundary={marker || undefined} tabIndex={day === focusDate ? 0 : -1} className={[styles.day, dp.month !== p.month && styles.outside, selected && styles.inRange, marker && styles.marker, day === today && styles.today].filter(Boolean).join(' ')} onFocus={() => setFocusDate(day)} onKeyDown={(e) => key(e, day)} onClick={() => select(day)}>{dp.day}</button> })}</div></div>
}
