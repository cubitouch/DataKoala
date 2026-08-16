import React from 'react'
void React
import styles from './TimeRange.module.css'
import { TimeWindowEditor } from './TimeWindowEditor'
import type { TimeWindow } from '../../lib/customTimeRange'
export function RecurringTimeWindowEditor({ windows, onChange, error }: { windows: TimeWindow[]; onChange: (windows: TimeWindow[]) => void; error?: string | null }) {
  return <details className={styles.recurringSection} open={windows.length > 0}><summary>Advanced: recurring daily windows</summary><p className={styles.windowEmpty}>Only include rows whose local time falls within these windows on each selected day.</p><TimeWindowEditor windows={windows} onChange={onChange} error={error}/></details>
}
