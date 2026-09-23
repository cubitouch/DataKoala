import styles from './TimeRange.module.css'
import { TimeWindowEditor } from './TimeWindowEditor'
import type { TimeWindow } from '../../lib/customTimeRange'
import { CollapsibleSection } from '../ui/CollapsibleSection'
export function RecurringTimeWindowEditor({ windows, onChange, error }: { windows: TimeWindow[]; onChange: (windows: TimeWindow[]) => void; error?: string | null }) {
  return <div className={styles.recurringSection}><CollapsibleSection title="Advanced: recurring daily windows" defaultOpen={windows.length > 0}><div className={styles.recurringContent}><p className={styles.windowEmpty}>Only include rows whose local time falls within these windows on each selected day.</p><TimeWindowEditor windows={windows} onChange={onChange} error={error}/></div></CollapsibleSection></div>
}
