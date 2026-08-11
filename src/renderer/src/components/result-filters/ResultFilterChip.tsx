import React from 'react'
void React
import { resultFilterLabel, type ResultFilter } from '../../lib/resultFilters'

export function ResultFilterChip({ filter, onRemove, onToggleExecution, canPromote, demotion }: { filter: ResultFilter; onRemove: () => void; onToggleExecution?: () => void; canPromote?: boolean; demotion?: { allowed: boolean; reason?: string } }) {
  const label = resultFilterLabel(filter)
  return <span className="result-filter-chip">
    <span>{label}</span>
    {filter.execution === 'query' && <span className="result-filter-execution">SQL</span>}
    {onToggleExecution && (filter.execution === 'query' || canPromote) && <button type="button" className="result-filter-toggle" onClick={onToggleExecution} disabled={filter.execution === 'query' && demotion?.allowed === false} title={filter.execution === 'query' && demotion?.allowed === false ? demotion.reason : undefined} aria-describedby={filter.execution === 'query' && demotion?.allowed === false ? `${filter.id}-demotion-reason` : undefined}>{filter.execution === 'query' ? 'Move to client' : 'Apply to SQL'}</button>}
    {filter.execution === 'query' && demotion?.allowed === false && <span id={`${filter.id}-demotion-reason`} className="sr-only">{demotion.reason}</span>}
    <button type="button" onClick={onRemove} aria-label={`Remove filter ${label}`}>×</button>
  </span>
}
