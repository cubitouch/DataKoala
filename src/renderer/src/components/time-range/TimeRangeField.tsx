import { useState } from 'react'
import styles from './TimeRange.module.css'
import { Popover, PopoverSummaryTrigger } from '../ui/Popover'
import { builderTimeRangeSummary, validateBuilderTimeRange, type BuilderTimeRange } from '../../lib/builderTimeRange'
import { TimeRangePopover } from './TimeRangePopover'
import { normalizeCustomRange } from '../../lib/customTimeRange'

const cloneRange = (range: BuilderTimeRange): BuilderTimeRange => range.kind === 'custom' ? { ...range, recurringWindows: (range.recurringWindows ?? []).map((w) => ({ ...w })) } : { ...range }
const normalizeRange = (range: BuilderTimeRange): BuilderTimeRange => range.kind === 'custom' ? { kind: 'custom', ...normalizeCustomRange({ startDate: range.startDate, startTime: range.startTime, endDate: range.endDate, endTime: range.endTime, recurringWindows: range.recurringWindows ?? [] }) } : range

export function TimeRangeField({ value, onChange, error, columnName }: { value: BuilderTimeRange; onChange: (value: BuilderTimeRange) => void; error?: string | null; columnName?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState<BuilderTimeRange>(value)
  const summary = builderTimeRangeSummary(value)
  const open = () => { setDraft(cloneRange(value)); setIsOpen(true) }
  const cancel = () => { setDraft(cloneRange(value)); setIsOpen(false) }
  const confirm = () => { if (validateBuilderTimeRange(draft)) return; onChange(normalizeRange(draft)); setIsOpen(false) }
  const label = columnName ? `Time range on ${columnName}` : 'Time range'
  return <div className={styles.field} data-time-range-field=""><span className={styles.label} data-time-range-label="">Time range{columnName && <span className={styles.context}> · {columnName}</span>}</span><Popover open={isOpen} onOpenChange={(next, reason) => { if (next) open(); else if (reason !== 'toggle') cancel(); else setIsOpen(false) }} trigger={<PopoverSummaryTrigger>{summary}</PopoverSummaryTrigger>} ariaLabel={`${label}: ${summary}`} popupType="dialog" contentRole="dialog" contentClassName={styles.content} preferredWidth={760} maxHeight={680} focusOptionsOnKeyboardOpen={false}><TimeRangePopover draft={draft} setDraft={setDraft} onCancel={cancel} onConfirm={confirm}/></Popover>{error && <small className={styles.fieldError} role="alert">{error}</small>}</div>
}
