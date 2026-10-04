import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from 'react'
import styles from './ResizableDetailPanel.module.css'

const DEFAULT_STEP = 24

interface Props {
  main: ReactNode
  detail?: ReactNode
  detailLabel: string
  width: number
  onWidthChange: (width: number) => void
  minDetailWidth?: number
  maxDetailWidth?: number
  minMainWidth?: number
}

export function ResizableDetailPanel({
  main,
  detail,
  detailLabel,
  width,
  onWidthChange,
  minDetailWidth = 300,
  maxDetailWidth = 640,
  minMainWidth = 280,
}: Props) {
  const root = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointerId: number; startX: number; width: number } | null>(
    null,
  )

  const clamp = useCallback(
    (next: number) => {
      const available = root.current
        ? Math.max(160, root.current.clientWidth - minMainWidth)
        : maxDetailWidth
      const maximum = Math.min(maxDetailWidth, available)
      const minimum = Math.min(minDetailWidth, maximum)
      return Math.max(minimum, Math.min(maximum, next))
    },
    [maxDetailWidth, minDetailWidth, minMainWidth],
  )

  useEffect(() => {
    if (!detail || typeof ResizeObserver === 'undefined') return
    const element = root.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      const next = clamp(width)
      if (next !== width) onWidthChange(next)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [clamp, detail, onWidthChange, width])

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    onWidthChange(clamp(active.width + active.startX - event.clientX))
  }
  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    onWidthChange(
      clamp(width + (event.key === 'ArrowLeft' ? DEFAULT_STEP : -DEFAULT_STEP)),
    )
  }

  return (
    <div ref={root} className={styles.root} data-resizable-detail-panel>
      <div className={styles.main}>{main}</div>
      {detail && (
        <>
          <div
            className={styles.separator}
            role="separator"
            aria-label={`Resize ${detailLabel}`}
            aria-orientation="vertical"
            aria-valuenow={Math.round(width)}
            tabIndex={0}
            onKeyDown={keyDown}
            onPointerDown={(event) => {
              drag.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                width,
              }
              event.currentTarget.setPointerCapture?.(event.pointerId)
            }}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          >
            <span aria-hidden="true" />
          </div>
          <aside
            className={styles.detail}
            aria-label={detailLabel}
            style={{ width: clamp(width) }}
          >
            {detail}
          </aside>
        </>
      )}
    </div>
  )
}
