import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useRef,
} from 'react'
import styles from './ResizableDetailPanel.module.css'

export const DEFAULT_DETAIL_PANEL_WIDTH = 420

interface ResizableDetailPanelProps {
  children: ReactNode
  detail?: ReactNode
  detailLabel: string
  width: number
  onWidthChange: (width: number) => void
  minDetailWidth?: number
  maxDetailWidth?: number
  minMainWidth?: number
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

export function ResizableDetailPanel({
  children,
  detail,
  detailLabel,
  width,
  onWidthChange,
  minDetailWidth = 280,
  maxDetailWidth = 680,
  minMainWidth = 280,
}: ResizableDetailPanelProps) {
  const root = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)

  const clampWidth = useCallback(
    (candidate: number) => {
      const rootWidth = root.current?.getBoundingClientRect().width ?? 0
      const availableMaximum =
        rootWidth > 0
          ? Math.min(maxDetailWidth, Math.max(0, rootWidth - minMainWidth))
          : maxDetailWidth
      const availableMinimum = Math.min(minDetailWidth, availableMaximum)
      return Math.round(clamp(candidate, availableMinimum, availableMaximum))
    },
    [maxDetailWidth, minDetailWidth, minMainWidth],
  )

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

  const clampedWidth = clampWidth(width)
  const rootStyle = {
    '--resizable-detail-min-main': `${minMainWidth}px`,
  } as CSSProperties

  return (
    <div ref={root} className={styles.root} style={rootStyle}>
      <div className={styles.main}>{children}</div>
      {detail && (
        <div
          className={styles.detailFrame}
          style={{ width: clampedWidth }}
          data-resizable-detail
          data-detail-width={clampedWidth}
        >
          <div
            className={styles.separator}
            role="separator"
            aria-label={`Resize ${detailLabel}`}
            aria-orientation="vertical"
            aria-valuemin={minDetailWidth}
            aria-valuemax={maxDetailWidth}
            aria-valuenow={clampedWidth}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishPointer}
            onPointerCancel={finishPointer}
          />
          <aside className={styles.detail} aria-label={detailLabel}>
            {detail}
          </aside>
        </div>
      )}
    </div>
  )
}
