import React from 'react'
void React
import styles from './TimeRange.module.css'
import { EMPTY_BUILDER_CUSTOM_RANGE, validateBuilderTimeRange, type BuilderTimeRange } from '../../lib/builderTimeRange'
import { CustomDateTimeRangeEditor } from './CustomDateTimeRangeEditor'
import { RecurringTimeWindowEditor } from './RecurringTimeWindowEditor'
import { TimeRangePresets } from './TimeRangePresets'

export function TimeRangePopover({ draft, setDraft, onCancel, onConfirm }: { draft: BuilderTimeRange; setDraft: (value: BuilderTimeRange) => void; onCancel: () => void; onConfirm: () => void }) {
  const error = validateBuilderTimeRange(draft)
  const recurringError = error && (/recurring|overlaps/.test(error)) ? error : null
  const boundaryError = error && !recurringError ? error : null
  const setRecurringWindows = (recurringWindows: NonNullable<BuilderTimeRange['recurringWindows']>) => setDraft({ ...draft, recurringWindows } as BuilderTimeRange)
  return <div className={styles.popover} aria-labelledby="time-range-title"><h3 className={styles.title} id="time-range-title">Time range</h3><div className={styles.body} data-time-range-region="body"><div className={styles.presetPane} data-time-range-region="presets"><TimeRangePresets value={draft} onSelect={setDraft}/></div><div className={styles.editorPane} data-time-range-region="editor"><CustomDateTimeRangeEditor draft={draft} setDraft={setDraft}/><RecurringTimeWindowEditor windows={draft.recurringWindows ?? []} onChange={setRecurringWindows} error={recurringError}/></div></div>{boundaryError && <small className={styles.error} role="alert">{boundaryError}</small>}<div className={styles.actions} data-time-range-region="actions"><button type="button" className="btn ghost" onClick={() => setDraft(EMPTY_BUILDER_CUSTOM_RANGE)}>Clear</button><span className={styles.spacer}/><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button><button type="button" className="btn primary" disabled={Boolean(error)} onClick={onConfirm}>Confirm</button></div></div>
}
