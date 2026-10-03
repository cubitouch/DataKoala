import type { ChartLegendEntry } from '@lib/chartLegend'
import type { SeriesVisibility } from '@lib/chartVisibility'
import styles from './ChartLegend.module.css'

interface ChartLegendProps {
  series: readonly ChartLegendEntry[]
  visibility: SeriesVisibility
  onToggle: (identity: string) => void
  onIsolate: (identity: string) => void
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
      {series.map(({ identity, label, color }) => (
        <div className={styles.item} key={identity}>
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={visibility[identity] !== false}
            title={label}
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
        </div>
      ))}
    </div>
  )
}
