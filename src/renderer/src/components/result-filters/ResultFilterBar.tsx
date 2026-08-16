import type { ResultFilter } from '../../lib/resultFilters'
import { ResultFilterChip } from './ResultFilterChip'
import styles from './ResultFilterBar.module.css'

export function ResultFilterBar({ filters, onRemove, onClear, onToggleExecution, canPromote, canDemote }: {
  filters: ResultFilter[]
  onRemove: (id: string) => void
  onClear: () => void
  onToggleExecution?: (id: string) => void
  canPromote?: (filter: ResultFilter) => boolean
  canDemote?: (filter: ResultFilter) => { allowed: boolean; reason?: string }
}) {
  if (!filters.length) return null
  return <div className={styles.bar} aria-label="Active result filters">
    <span className={styles.heading}>Filters</span>
    {filters.map((filter) => <ResultFilterChip key={filter.id} filter={filter} onRemove={() => onRemove(filter.id)} onToggleExecution={onToggleExecution ? () => onToggleExecution(filter.id) : undefined} canPromote={canPromote?.(filter)} demotion={canDemote?.(filter)}/>)}
    {filters.length > 1 && <button type="button" className={styles.clear} onClick={onClear}>Clear all</button>}
  </div>
}
