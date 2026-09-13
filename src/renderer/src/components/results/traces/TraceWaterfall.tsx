import { useMemo } from 'react'
import { buildTraceTimelineScale, type TraceRow, type VisibleTraceSpan } from '../../../lib/traceViewer'
import styles from './TraceWaterfall.module.css'
import { traceDurationLabel, traceNumber, tracePeriodLabel, traceText } from './tracePresentation'

export const MAX_RENDERED_SPANS = 500

interface RenderedTimelineGap {
  key: string
  left: number
  width: number
  durationMs: number
}

export interface TraceWaterfallProps {
  visibleTree: VisibleTraceSpan[]
  timelineSpans: TraceRow[]
  selectedSpanId: string
  collapsed: Set<string>
  filteredSpanCount: number
  totalSpanCount: number
  traceStart: number
  traceDuration: number
  compressIdleGaps: boolean
  hasInspector: boolean
  onSelectSpan: (spanId: string) => void
  onToggleCollapse: (spanId: string) => void
}

export function TimelineGapOverlay({ gaps }: { gaps: RenderedTimelineGap[] }) {
  return <div className={styles.timelineGapOverlay} aria-hidden="true">
    <div className={styles.timelineGapLayer}>{gaps.map((gap) => <span
      key={gap.key} className={styles.timelineGap} data-trace-idle-gap=""
      style={{ left: `${gap.left}%`, width: `${gap.width}%` }}
      title={`Compressed idle gap · ${tracePeriodLabel(gap.durationMs)}`}
    />)}</div>
  </div>
}

export function TraceWaterfall({ visibleTree, timelineSpans, selectedSpanId, collapsed, filteredSpanCount, totalSpanCount, traceStart, traceDuration, compressIdleGaps, hasInspector, onSelectSpan, onToggleCollapse }: TraceWaterfallProps) {
  const renderedTree = visibleTree.slice(0, MAX_RENDERED_SPANS)
  const timelineScale = useMemo(() => buildTraceTimelineScale(timelineSpans, compressIdleGaps), [timelineSpans, compressIdleGaps])
  const gaps = useMemo(() => timelineScale.gaps.map((gap, index) => {
    const left = timelineScale.offsetPercent(gap.startMs)
    const right = timelineScale.offsetPercent(gap.endMs)
    return { key: `${gap.startMs}-${gap.endMs}-${index}`, left, width: Math.max(.45, right - left), durationMs: gap.durationMs }
  }), [timelineScale])
  const timelineLabel = timelineScale.gaps.length > 0
    ? `Idle gaps compressed · ${traceDurationLabel(timelineScale.wallDurationMs)} visible wall time → ${traceDurationLabel(timelineScale.displayDurationMs)} visual scale${Math.abs(timelineScale.wallDurationMs - traceDuration) > .5 ? ` · full trace ${traceDurationLabel(traceDuration)}` : ''}`
    : Math.abs(timelineScale.wallDurationMs - traceDuration) > .5
      ? `Visible timeline · ${traceDurationLabel(timelineScale.wallDurationMs)} · full trace ${traceDurationLabel(traceDuration)}`
      : `Timeline · ${traceDurationLabel(traceDuration)}`
  const ticks = [0, 25, 50, 75, 100].map((position) => ({ position, label: `+${tracePeriodLabel(Math.max(0, timelineScale.timeAtPercent(position) - traceStart))}` }))

  return <div className={`${styles.waterfall} ${hasInspector ? styles.withInspector : ''}`} data-trace-waterfall="" data-visual-type="waterfall" data-visual-finished={renderedTree.length > 0} data-visual-items={renderedTree.length}>
    <div className={styles.waterfallHeader}>
      <span>Span tree · {filteredSpanCount}/{totalSpanCount} visible</span>
      <div className={styles.timelineHeader}><span className={styles.timelineDescription}>{timelineLabel}</span>
        <div className={styles.timelineTicks} aria-label="Time relative to trace start">{ticks.map((tick) => <span key={tick.position} style={{ left: `${tick.position}%`, transform: tick.position === 0 ? 'none' : tick.position === 100 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{tick.label}</span>)}</div>
      </div>
    </div>
    {renderedTree.length === 0 ? <div className={styles.warning}>No spans match the current trace filters.</div> : <div className={styles.waterfallBody}>
      <TimelineGapOverlay gaps={gaps} />
      {renderedTree.map(({ row: span, id: spanId, depth, hasChildren }) => {
        const offset = timelineScale.offsetPercent(traceNumber(span.startTimeMs))
        const width = Math.max(0, Math.min(timelineScale.widthPercent(traceNumber(span.startTimeMs), traceNumber(span.durationMs)), 100 - offset))
        const selected = selectedSpanId === spanId
        return <div key={spanId} className={`${styles.spanRow} ${selected ? styles.selected : ''}`} data-span-id={spanId}>
          <div className={styles.spanLabel}><span className={styles.treeGuides} aria-hidden="true">{Array.from({ length: depth }, (_, index) => <span key={index} />)}</span>
            {hasChildren ? <button type="button" className={styles.caret} aria-label={`${collapsed.has(spanId) ? 'Expand' : 'Collapse'} ${traceText(span.name) || spanId}`} aria-expanded={!collapsed.has(spanId)} onClick={() => onToggleCollapse(spanId)}>{collapsed.has(spanId) ? '▸' : '▾'}</button> : <span className={styles.leafDot} aria-hidden="true">•</span>}
            <button type="button" className={styles.spanIdentity} onClick={() => onSelectSpan(spanId)} aria-pressed={selected}><strong>{traceText(span.service) || 'unknown'}</strong><span>{traceText(span.name) || spanId}</span></button>
          </div>
          <button type="button" className={styles.timeline} onClick={() => onSelectSpan(spanId)} aria-label={`Select ${traceText(span.service)} ${traceText(span.name)}, starts +${tracePeriodLabel(Math.max(0, traceNumber(span.startTimeMs) - traceStart))}, lasts ${traceDurationLabel(traceNumber(span.durationMs))}`}>
            <span className={`${styles.bar} ${traceText(span.status).toUpperCase().includes('ERROR') ? styles.errorBar : ''}`} style={{ left: `${offset}%`, width: `${width}%`, minWidth: '1px' }}><span>{traceDurationLabel(traceNumber(span.durationMs))}</span></span>
          </button>
        </div>
      })}
    </div>}
    </div>
}
