import { useState } from 'react'
import styles from './TimeRange.module.css'
import { Popover, PopoverSummaryTrigger } from '../ui/Popover'
import { builderTimeRangeSummary, normalizeBuilderTimeRange, validateBuilderTimeRange, type BuilderTimeRange } from '../../lib/builderTimeRange'
import { TimeRangePopover } from './TimeRangePopover'
import { normalizeCustomRange } from '../../lib/customTimeRange'
import { FieldChrome } from '../ui/FieldChrome'
import type { LabelVisibility } from '../ui/FieldChrome'

const cloneRange = (range: BuilderTimeRange): BuilderTimeRange => ({ ...range, recurringWindows: (range.recurringWindows ?? []).map((window) => ({ ...window })) } as BuilderTimeRange)
const normalizeRange = (range: BuilderTimeRange): BuilderTimeRange => range.kind === 'custom'
  ? { kind: 'custom', ...normalizeCustomRange({ startDate: range.startDate, startTime: range.startTime, endDate: range.endDate, endTime: range.endTime, recurringWindows: range.recurringWindows ?? [] }) }
  : normalizeBuilderTimeRange(range)

export function TimeRangeField({ value, onChange, error, columnName, labelVisibility }: { value: BuilderTimeRange; onChange: (value: BuilderTimeRange) => void; error?: string | null; columnName?: string; labelVisibility?: LabelVisibility }) {
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState<BuilderTimeRange>(value)
  const summary = builderTimeRangeSummary(value)
  const open = () => { setDraft(cloneRange(value)); setIsOpen(true) }
  const cancel = () => { setDraft(cloneRange(value)); setIsOpen(false) }
  const confirm = () => { if (validateBuilderTimeRange(draft)) return; onChange(normalizeRange(draft)); setIsOpen(false) }
  const accessibleLabel = columnName ? `Time range on ${columnName}` : 'Time range'
  return <div data-time-range-field=""><FieldChrome label="Time range" labelVisibility={labelVisibility} controlKind="button" error={error}>
    {({ controlId, labelId, describedBy, invalid }) => <><span id={`${controlId}-value`} className={styles.srOnly}>{summary}</span><Popover open={isOpen} onOpenChange={(next, reason) => { if (next) open(); else if (reason !== 'toggle') cancel(); else setIsOpen(false) }} trigger={<PopoverSummaryTrigger>{summary}</PopoverSummaryTrigger>} ariaLabel={`${accessibleLabel}: ${summary}`} triggerButtonProps={{ id: controlId, 'aria-labelledby': `${labelId} ${controlId}-value`, 'aria-describedby': describedBy, 'aria-invalid': invalid }} popupType="dialog" contentRole="dialog" contentClassName={styles.content} preferredWidth={760} maxHeight={680} focusOptionsOnKeyboardOpen={false}><TimeRangePopover draft={draft} setDraft={setDraft} onCancel={cancel} onConfirm={confirm}/></Popover></>}
  </FieldChrome></div>
}
