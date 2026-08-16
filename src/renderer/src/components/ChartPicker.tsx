import type { ReactNode } from 'react'
import type { ResultView } from '../lib/resultVisualization'
import styles from './ChartPicker.module.css'

const views: Array<{ view: ResultView; label: string; path: ReactNode }> = [
  { view: 'table', label: 'Table', path: <><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M8 4v16"/></> },
  { view: 'bar', label: 'Bar', path: <><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7"/></> },
  { view: 'line', label: 'Line', path: <path d="m3 17 5-6 4 3 8-9"/> },
  { view: 'area', label: 'Area', path: <><path d="m3 17 5-6 4 3 8-9v11H3Z" className={styles.fill}/><path d="m3 17 5-6 4 3 8-9"/></> },
  { view: 'scatter', label: 'Scatter', path: <><circle cx="6" cy="16" r="2"/><circle cx="11" cy="10" r="2"/><circle cx="17" cy="6" r="2"/><circle cx="18" cy="15" r="2"/></> },
  { view: 'treemap', label: 'Treemap', path: <><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 4v16M12 12h9M3 14h9"/></> },
  { view: 'sunburst', label: 'Sunburst', path: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5M12 16v5M16 12h5"/></> }
]

export function ChartPicker({ value, onChange }: { value: ResultView; onChange: (view: ResultView) => void }) {
  return <div className={styles.root} role="toolbar" aria-label="Result view">
    <span className={styles.label}>View</span>
    {views.map(({ view, label, path }) => <button key={view} type="button" className={`${styles.button}${value === view ? ` ${styles.active}` : ''}`} aria-label={label} title={label} aria-pressed={value === view} onClick={() => onChange(view)}>
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">{path}</svg><span className={styles.viewLabel}>{label}</span>
    </button>)}
  </div>
}
