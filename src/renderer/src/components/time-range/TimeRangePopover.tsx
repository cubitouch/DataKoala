import React from 'react'
void React
import { EMPTY_BUILDER_CUSTOM_RANGE, validateBuilderTimeRange, type BuilderTimeRange } from '../../lib/builderTimeRange'
import { CustomDateTimeRangeEditor } from './CustomDateTimeRangeEditor'
import { TimeRangePresets } from './TimeRangePresets'

export function TimeRangePopover({ draft, setDraft, onCancel, onConfirm }: { draft: BuilderTimeRange; setDraft: (value: BuilderTimeRange) => void; onCancel: () => void; onConfirm: () => void }) {
  const error = validateBuilderTimeRange(draft)
  const recurringError = error && (/recurring|overlaps/.test(error)) ? error : null
  const boundaryError = error && !recurringError ? error : null
  return <div className="custom-range-popover" aria-labelledby="time-range-title"><h3 id="time-range-title">Time range</h3><div className="custom-range-body"><div className="time-range-presets-scroll"><TimeRangePresets value={draft} onSelect={setDraft}/></div><div className="time-range-editor-scroll"><CustomDateTimeRangeEditor draft={draft} setDraft={setDraft} error={draft.kind === 'custom' ? recurringError : null}/></div></div>{draft.kind === 'custom' && boundaryError && <small className="inline-error" role="alert">{boundaryError}</small>}<div className="picker-actions"><button type="button" className="btn ghost" onClick={() => setDraft(EMPTY_BUILDER_CUSTOM_RANGE)}>Clear</button><span className="spacer"/><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button><button type="button" className="btn primary" disabled={Boolean(error)} onClick={onConfirm}>Confirm</button></div></div>
}
