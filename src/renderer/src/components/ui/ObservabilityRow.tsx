import type { ReactNode } from 'react'
import styles from './ObservabilityRow.module.css'

export const OBSERVABILITY_ROW_MIN_HEIGHT = 42

/** A content shell only: callers keep item identity, virtualization and navigation. */
export function ObservabilityRow({
  leading,
  children,
  trailing,
  actions,
  onOpen,
  selected = false,
  disabled = false,
  label,
}: {
  leading?: ReactNode
  children: ReactNode
  trailing?: ReactNode
  /** Separate sibling controls, never nested inside the row's native button. */
  actions?: ReactNode
  onOpen?: () => void
  selected?: boolean
  disabled?: boolean
  label?: string
}) {
  const contents = (
    <>
      {leading && <span className={styles.leading}>{leading}</span>}{' '}
      <span className={styles.main}>{children}</span>{' '}
      {trailing && <span className={styles.trailing}>{trailing}</span>}
      {onOpen && (
        <i
          className={styles.chevron}
          data-log-row-chevron
          data-row-chevron
          aria-hidden="true"
          title="Open details"
        >
          ›
        </i>
      )}
    </>
  )
  return (
    <div
      className={styles.row}
      data-observability-row
      data-selected={selected || undefined}
    >
      {onOpen ? (
        <button
          type="button"
          className={styles.content}
          aria-label={label}
          aria-selected={selected}
          disabled={disabled}
          onClick={(event) => {
            if (event.detail && window.getSelection()?.isCollapsed === false)
              return
            onOpen()
          }}
        >
          {contents}
        </button>
      ) : (
        <div className={styles.content}>{contents}</div>
      )}
      {actions && <span className={styles.actions}>{actions}</span>}
    </div>
  )
}

/** Keep a keyboard-focused item mounted when the viewport recycles its neighbors. */
export function focusedRowRange(
  range: {
    startIndex: number
    endIndex: number
    overscan: number
    count: number
  },
  focusedIndex: number,
) {
  const first = Math.max(0, range.startIndex - range.overscan)
  const last = Math.min(range.count - 1, range.endIndex + range.overscan)
  const indices = Array.from(
    { length: Math.max(0, last - first + 1) },
    (_, index) => first + index,
  )
  if (focusedIndex >= 0 && !indices.includes(focusedIndex))
    indices.push(focusedIndex)
  return indices.sort((a, b) => a - b)
}
