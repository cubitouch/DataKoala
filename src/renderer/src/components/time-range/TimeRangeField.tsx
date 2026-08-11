import { useState } from 'react'
import { Popover } from '../ui/Popover'
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
  return <div className="custom-range-field"><span className="builder-field-label">Time range{columnName && <span className="builder-field-context"> · {columnName}</span>}</span><Popover open={isOpen} onOpenChange={(next, reason) => { if (next) open(); else if (reason !== 'toggle') cancel(); else setIsOpen(false) }} trigger={<><span className="multi-select-summary">{summary}</span><span className="select-chevron" aria-hidden="true"/></>} ariaLabel={`${label}: ${summary}`} popupType="dialog" contentRole="dialog" contentClassName="custom-time-range-content" maxHeight={680} focusOptionsOnKeyboardOpen={false}><TimeRangePopover draft={draft} setDraft={setDraft} onCancel={cancel} onConfirm={confirm}/></Popover>{error && <small className="inline-error" role="alert">{error}</small>}</div>
}
