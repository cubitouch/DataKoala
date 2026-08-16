import React from 'react'
void React
import { useState } from 'react'
import popoverStyles from '../ui/Popover.module.css'
import { Popover } from '../ui/Popover'
import { CustomTimeRangePopover } from './CustomTimeRangePopover'
import { cloneCustomRange, normalizeCustomRange, validateCustomRange, type CustomTimeRangeValue } from '../../lib/customTimeRange'
const fmt = (d: string) => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))
export function customRangeSummary(value: CustomTimeRangeValue): string { if (!value.startDate || !value.endDate) return 'Choose a custom range'; const windows = value.recurringWindows.map((w) => `${w.from}–${w.to}`).join(', '); return `${fmt(value.startDate)} – ${fmt(value.endDate)}${windows ? ` · ${windows}` : ''}` }
export function CustomTimeRangeField({ value, onChange, error }: { value: CustomTimeRangeValue; onChange: (value: CustomTimeRangeValue) => void; error?: string | null }) {
  const [isOpen, setIsOpen] = useState(false); const [draft, setDraft] = useState(value)
  const open = () => { setDraft(cloneCustomRange(value)); setIsOpen(true) }
  const cancel = () => { setDraft(cloneCustomRange(value)); setIsOpen(false) }
  const confirm = () => { if (validateCustomRange(draft)) return; onChange(normalizeCustomRange(draft)); setIsOpen(false) }
  return <div className="custom-range-field"><span className="builder-field-label">Custom range</span><Popover open={isOpen} onOpenChange={(next, reason) => { if (next) open(); else if (reason !== 'toggle') cancel(); else setIsOpen(false) }} trigger={<><span className={popoverStyles.summary}>{customRangeSummary(value)}</span><span className={popoverStyles.chevron} aria-hidden="true"/></>} ariaLabel={`Custom time range: ${customRangeSummary(value)}`} popupType="dialog" contentRole="dialog" contentClassName="custom-time-range-content" preferredWidth={760} maxHeight={720} focusOptionsOnKeyboardOpen={false}><CustomTimeRangePopover draft={draft} setDraft={setDraft} onCancel={cancel} onConfirm={confirm}/></Popover>{error && <small className="inline-error" role="alert">{error}</small>}</div>
}
