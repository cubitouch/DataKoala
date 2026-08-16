import { useEffect, useRef } from 'react'
import type { ChartPointContext } from '../../lib/chartPointFilters'
import styles from './ChartFilterPopover.module.css'

export type ChartFilterAction = 'includeSeries' | 'excludeSeries' | 'includeX' | 'excludeX' | 'includeSeriesAndX'

export function ChartFilterPopover({ context, position, onAction, onDismiss }: {
  context: ChartPointContext
  position: { x: number; y: number }
  onAction: (action: ChartFilterAction) => void
  onDismiss: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const dismissOutside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss()
    }
    const dismissKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onDismiss() }
    window.addEventListener('pointerdown', dismissOutside)
    window.addEventListener('keydown', dismissKey)
    return () => { window.removeEventListener('pointerdown', dismissOutside); window.removeEventListener('keydown', dismissKey) }
  }, [onDismiss])

  const actions: Array<[ChartFilterAction, string]> = []
  if (context.seriesColumn) actions.push(['includeSeries', 'Filter to this series'], ['excludeSeries', 'Exclude this series'])
  const xLabel = context.timeBucket ? 'time bucket' : `${context.xColumn} value`
  actions.push(['includeX', `Filter to this ${xLabel}`], ['excludeX', `Exclude this ${xLabel}`])
  if (context.seriesColumn) actions.push(['includeSeriesAndX', `Filter to this series and ${xLabel}`])

  return <div
    ref={ref}
    className={styles.popover}
    role="menu"
    aria-label="Filter from chart point"
    style={{ left: Math.max(8, Math.min(position.x, window.innerWidth - 280)), top: Math.max(8, Math.min(position.y, window.innerHeight - 220)) }}
  >
    {actions.map(([action, label]) => <button key={action} type="button" role="menuitem" onClick={() => onAction(action)}>{label}</button>)}
  </div>
}
