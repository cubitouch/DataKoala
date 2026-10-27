import { useLayoutEffect, useRef, useState, useId, type ReactNode } from 'react'
import styles from './ResizablePlanArea.module.css'

const clamp = (value: number, min: number, max: number) =>
  Math.round(Math.min(max, Math.max(min, value)))

/** Session-local graph height. Container resizing leaves JointJS pan/zoom intact. */
export function ResizablePlanArea({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    pointerId: number
    y: number
    height: number
    element: HTMLDivElement
  } | null>(null)
  const id = useId()
  const [bounds, setBounds] = useState({
    min: 240,
    max: Math.max(240, window.innerHeight - 180),
  })
  const [height, setHeight] = useState(() =>
    Math.round(window.innerHeight * 0.65),
  )
  const actualHeight = clamp(height, bounds.min, bounds.max)
  useLayoutEffect(() => {
    const element = root.current
    const measure = () => {
      const top = element?.getBoundingClientRect().top ?? 0
      const max = Math.max(120, Math.floor(window.innerHeight - top - 60))
      const min = Math.min(240, max)
      setBounds((previous) =>
        previous.min === min && previous.max === max ? previous : { min, max },
      )
      setHeight((previous) => clamp(previous, min, max))
    }
    measure()
    window.addEventListener('resize', measure)
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (element?.parentElement) observer?.observe(element.parentElement)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
      const active = drag.current
      drag.current = null
      if (active?.element.hasPointerCapture?.(active.pointerId))
        active.element.releasePointerCapture(active.pointerId)
    }
  }, [])
  const finish = (pointerId: number) => {
    const active = drag.current
    if (!active || active.pointerId !== pointerId) return
    drag.current = null
    if (active.element.hasPointerCapture?.(pointerId))
      active.element.releasePointerCapture(pointerId)
  }
  return (
    <div ref={root} className={styles.root}>
      <div
        id={id}
        className={styles.graph}
        style={{ height: actualHeight }}
        data-plan-height={actualHeight}
      >
        {children}
      </div>
      <div
        className={styles.separator}
        role="separator"
        aria-label="Resize execution plan diagram"
        aria-orientation="horizontal"
        aria-controls={id}
        aria-valuemin={bounds.min}
        aria-valuemax={bounds.max}
        aria-valuenow={actualHeight}
        tabIndex={0}
        onKeyDown={(event) => {
          const next =
            event.key === 'Home'
              ? bounds.min
              : event.key === 'End'
                ? bounds.max
                : event.key === 'ArrowUp'
                  ? actualHeight - 24
                  : event.key === 'ArrowDown'
                    ? actualHeight + 24
                    : null
          if (next === null) return
          event.preventDefault()
          setHeight(clamp(next, bounds.min, bounds.max))
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          drag.current = {
            pointerId: event.pointerId,
            y: event.clientY,
            height: actualHeight,
            element: event.currentTarget,
          }
          event.currentTarget.setPointerCapture?.(event.pointerId)
          event.currentTarget.focus()
          event.preventDefault()
        }}
        onPointerMove={(event) => {
          const active = drag.current
          if (active?.pointerId !== event.pointerId) return
          setHeight(
            clamp(
              active.height + event.clientY - active.y,
              bounds.min,
              bounds.max,
            ),
          )
        }}
        onPointerUp={(event) => finish(event.pointerId)}
        onPointerCancel={(event) => finish(event.pointerId)}
        onLostPointerCapture={(event) => finish(event.pointerId)}
      >
        <span aria-hidden="true">Plan height · drag or use ↑ / ↓</span>
      </div>
    </div>
  )
}
