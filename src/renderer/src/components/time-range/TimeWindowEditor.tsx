import React from 'react'
void React
import styles from './TimeRange.module.css'
import type { TimeWindow } from '../../lib/customTimeRange'
const makeId = () => `tw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
export function TimeWindowEditor({ windows, onChange, error }: { windows: TimeWindow[]; onChange: (windows: TimeWindow[]) => void; error?: string | null }) {
  const rows = windows.length ? windows : []
  const update = (id: string, patch: Partial<TimeWindow>) => onChange(windows.map((w) => w.id === id ? { ...w, ...patch } : w))
  return <div className={styles.windowEditor}>
    <div className={styles.windowHead}><span>Daily time windows</span><button type="button" className="btn ghost" onClick={() => onChange([...windows, { id: makeId(), from: '', to: '' }])}>+ Add window</button></div>
    {!rows.length && <p className={styles.windowEmpty}>No windows: use the full selected days.</p>}
    {rows.map((w, i) => <div className={styles.windowRow} key={w.id}>
      <label>From<input className={styles.input} aria-label={`From time ${i + 1}`} type="time" value={w.from} onChange={(e) => update(w.id, { from: e.target.value })}/></label><span aria-hidden="true">→</span>
      <label>To<input className={styles.input} aria-label={`To time ${i + 1}`} type="time" value={w.to} onChange={(e) => update(w.id, { to: e.target.value })}/></label>
      <button type="button" className="btn ghost" aria-label={`Delete time window ${i + 1}`} onClick={() => onChange(windows.filter((x) => x.id !== w.id))}>Delete</button>
    </div>)}
    {error && error !== 'Choose both a start and an end date.' && <small className={styles.error} role="alert">{error}</small>}
  </div>
}
