import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChartLegendEntry } from '@lib/chartLegend'
import type { SeriesVisibility } from '@lib/chartVisibility'
import styles from './ChartLegend.module.css'

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
      const maxWidth = Math.min(360, Math.max(160, window.innerWidth - gutter * 2))
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
