import React from 'react'
void React
import styles from './TimeRange.module.css'
import { DateRangeCalendar } from './DateRangeCalendar'
import { QuickRangeList } from './QuickRangeList'
import { TimeWindowEditor } from './TimeWindowEditor'
import { emptyCustomRange, validateCustomRange, type CustomTimeRangeValue } from '../../lib/customTimeRange'
export function CustomTimeRangePopover({ draft, setDraft, onCancel, onConfirm }: { draft: CustomTimeRangeValue; setDraft: (value: CustomTimeRangeValue) => void; onCancel: () => void; onConfirm: () => void }) {
  const error = validateCustomRange(draft)
  return <div className={styles.popover} aria-labelledby="custom-range-title"><h3 className={styles.title} id="custom-range-title">Custom date range</h3><div className={styles.customLayout}><QuickRangeList value={draft} onSelect={setDraft}/><DateRangeCalendar value={draft} onChange={setDraft}/><TimeWindowEditor windows={draft.recurringWindows} onChange={(recurringWindows) => setDraft({ ...draft, recurringWindows })} error={error}/></div>{error && <small className={styles.error} role="alert">{error}</small>}<div className={styles.actions}><button type="button" className="btn ghost" onClick={() => setDraft(emptyCustomRange())}>Clear</button><span className={styles.spacer}/><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button><button type="button" className="btn primary" disabled={Boolean(error)} onClick={onConfirm}>Confirm</button></div></div>
}
