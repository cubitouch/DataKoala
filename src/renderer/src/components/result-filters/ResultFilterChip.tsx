import { resultFilterLabel, type ResultFilter } from '../../lib/resultFilters'
import styles from './ResultFilterChip.module.css'

export function ResultFilterChip({ filter, onRemove, onToggleExecution, canPromote, demotion }: { filter: ResultFilter; onRemove: () => void; onToggleExecution?: () => void; canPromote?: boolean; demotion?: { allowed: boolean; reason?: string } }) {
  const label = resultFilterLabel(filter)
  return <span className={styles.chip} data-result-filter-chip>
    <span>{label}</span>
    {filter.execution === 'query' && <span>SQL</span>}
    {onToggleExecution && (filter.execution === 'query' || canPromote) && <button type="button" className={styles.toggle} onClick={onToggleExecution} disabled={filter.execution === 'query' && demotion?.allowed === false} title={filter.execution === 'query' && demotion?.allowed === false ? demotion.reason : undefined} aria-describedby={filter.execution === 'query' && demotion?.allowed === false ? `${filter.id}-demotion-reason` : undefined}>{filter.execution === 'query' ? 'Move to client' : 'Apply to SQL'}</button>}
    {filter.execution === 'query' && demotion?.allowed === false && <span id={`${filter.id}-demotion-reason`} className="sr-only">{demotion.reason}</span>}
    <button type="button" onClick={onRemove} aria-label={`Remove filter ${label}`}>×</button>
  </span>
}
