import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { ChartLegendEntry } from '@lib/chartLegend'
import type { SeriesVisibility } from '@lib/chartVisibility'
import styles from './ChartLegend.module.css'

export const DEFAULT_CHART_LEGEND_WIDTH = 200
export const MIN_CHART_LEGEND_WIDTH = 140
export const MAX_CHART_LEGEND_WIDTH = 420
const MIN_CHART_PLOT_WIDTH = 240

interface ChartLegendResizerProps {
  width: number
  containerRef: RefObject<HTMLDivElement | null>
  onWidthChange: (width: number) => void
}

/** Keyboard and pointer divider for the right-side chart legend. */
export function ChartLegendResizer({
  width,
  containerRef,
  onWidthChange,
}: ChartLegendResizerProps) {
  const drag = useRef<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)

  const clampWidth = (candidate: number) => {
    const containerWidth =
      containerRef.current?.getBoundingClientRect().width ?? 0
    const availableMaximum = Math.min(
      MAX_CHART_LEGEND_WIDTH,
      Math.max(
        MIN_CHART_LEGEND_WIDTH,
        containerWidth - MIN_CHART_PLOT_WIDTH - 64,
      ),
    )
    return Math.round(
      Math.max(MIN_CHART_LEGEND_WIDTH, Math.min(availableMaximum, candidate)),
    )
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: clampWidth(width),
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    onWidthChange(
      clampWidth(
        drag.current.startWidth - (event.clientX - drag.current.startX),
      ),
    )
  }

  const finishPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    onWidthChange(clampWidth(width + (event.key === 'ArrowLeft' ? 24 : -24)))
  }

  return (
    <div
      className={styles.resizer}
      role="separator"
      aria-label="Resize chart legend"
      aria-orientation="vertical"
      aria-valuemin={MIN_CHART_LEGEND_WIDTH}
      aria-valuemax={clampWidth(MAX_CHART_LEGEND_WIDTH)}
      aria-valuenow={clampWidth(width)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onKeyDown={onKeyDown}
    />
  )
}

interface ChartLegendProps {
  series: readonly ChartLegendEntry[]
  visibility: SeriesVisibility
  onToggle: (identity: string) => void
  onIsolate: (identity: string) => void
}

interface TooltipPosition {
  left: number
  top: number
  maxWidth: number
}

function ChartLegendItem({
  entry,
  visible,
  onToggle,
  onIsolate,
}: {
  entry: ChartLegendEntry
  visible: boolean
  onToggle: (identity: string) => void
  onIsolate: (identity: string) => void
}) {
  const { identity, label, color } = entry
  const tooltipId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>({
    left: 8,
    top: 8,
    maxWidth: 360,
  })

  useLayoutEffect(() => {
    if (!tooltipOpen) return
    const place = () => {
      const trigger = toggleRef.current?.getBoundingClientRect()
      const tooltip = tooltipRef.current?.getBoundingClientRect()
      if (!trigger || !tooltip) return
      const gutter = 8
      const maxWidth = Math.min(
        360,
        Math.max(160, window.innerWidth - gutter * 2),
      )
      const width = Math.min(tooltip.width, maxWidth)
      const height = tooltip.height
      const left = Math.min(
        Math.max(gutter, trigger.left + trigger.width / 2 - width / 2),
        Math.max(gutter, window.innerWidth - width - gutter),
      )
      const above = trigger.top - height - gutter
      const top =
        above >= gutter
          ? above
          : Math.min(
              trigger.bottom + gutter,
              Math.max(gutter, window.innerHeight - height - gutter),
            )
      setTooltipPosition({ left, top, maxWidth })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [tooltipOpen])

  return (
    <div className={styles.item}>
      <button
        ref={toggleRef}
        type="button"
        className={styles.toggle}
        aria-pressed={visible}
        aria-describedby={tooltipOpen ? tooltipId : undefined}
        onMouseEnter={() => setTooltipOpen(true)}
        onMouseLeave={() => setTooltipOpen(false)}
        onFocus={() => setTooltipOpen(true)}
        onBlur={() => setTooltipOpen(false)}
        onClick={(event) =>
          (event.shiftKey || event.ctrlKey || event.metaKey
            ? onIsolate
            : onToggle)(identity)
        }
      >
        <span
          className={styles.marker}
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <span className={styles.label}>{label}</span>
      </button>
      <button
        type="button"
        className={styles.isolate}
        aria-label={`Isolate ${label}`}
        title={`Isolate ${label} (click again to show all)`}
        onClick={() => onIsolate(identity)}
      >
        ◎
      </button>
      {tooltipOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            className={styles.tooltip}
            style={tooltipPosition}
          >
            {label}
          </span>,
          document.body,
        )}
    </div>
  )
}

/** Native buttons keep Tab, Enter/Space, touch, and focus scrolling browser-owned. */
export function ChartLegend({
  series,
  visibility,
  onToggle,
  onIsolate,
}: ChartLegendProps) {
  if (series.length < 2) return null
  return (
    <div
      className={styles.legend}
      role="group"
      aria-label="Chart legend"
      data-chart-legend
    >
      {series.map((entry) => (
        <ChartLegendItem
          key={entry.identity}
          entry={entry}
          visible={visibility[entry.identity] !== false}
          onToggle={onToggle}
          onIsolate={onIsolate}
        />
      ))}
    </div>
  )
}
