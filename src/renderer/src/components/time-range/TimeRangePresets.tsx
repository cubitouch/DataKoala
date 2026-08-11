import React from 'react'
void React
import { EMPTY_BUILDER_CUSTOM_RANGE, type BuilderTimeRange } from '../../lib/builderTimeRange'
import { quickRanges } from '../../lib/customTimeRange'

export const PRESETS: { section: string; items: { id: string; label: string; range: BuilderTimeRange }[] }[] = [
  { section: 'Rolling', items: [
    { id: '1-hour', label: 'Last hour', range: { kind: 'rolling', amount: 1, unit: 'hour' } },
    { id: '6-hour', label: 'Last 6 hours', range: { kind: 'rolling', amount: 6, unit: 'hour' } },
    { id: '12-hour', label: 'Last 12 hours', range: { kind: 'rolling', amount: 12, unit: 'hour' } },
    { id: '24-hour', label: 'Last day', range: { kind: 'rolling', amount: 24, unit: 'hour' } },
    { id: '7-day', label: 'Last 7 days', range: { kind: 'rolling', amount: 7, unit: 'day' } },
    { id: '30-day', label: 'Last 30 days', range: { kind: 'rolling', amount: 30, unit: 'day' } },
    { id: '3-month', label: 'Last 3 months', range: { kind: 'rolling', amount: 3, unit: 'month' } },
    { id: '6-month', label: 'Last 6 months', range: { kind: 'rolling', amount: 6, unit: 'month' } },
    { id: '12-month', label: 'Last 12 months', range: { kind: 'rolling', amount: 12, unit: 'month' } }
  ] },
  { section: 'Calendar', items: quickRanges().map((range) => ({ id: range.id, label: range.label, range: { kind: 'custom' as const, startDate: range.startDate, startTime: '00:00', endDate: range.endDate, endTime: '00:00', recurringWindows: [] } })) },
  { section: 'Other', items: [{ id: 'all', label: 'All time', range: { kind: 'all' } }, { id: 'custom', label: 'Custom', range: EMPTY_BUILDER_CUSTOM_RANGE }] }
]

function samePreset(a: BuilderTimeRange, b: BuilderTimeRange): boolean { return JSON.stringify(a) === JSON.stringify(b) }
export function TimeRangePresets({ value, onSelect }: { value: BuilderTimeRange; onSelect: (range: BuilderTimeRange) => void }) {
  return <div className="quick-range-list" aria-label="Time range presets">{PRESETS.map((group) => <div key={group.section} className="preset-section"><strong>{group.section}</strong>{group.items.map((item) => <button key={item.id} type="button" className="quick-range-pill" aria-pressed={samePreset(value, item.range)} onClick={() => onSelect(item.range)}>{item.label}</button>)}</div>)}</div>
}
