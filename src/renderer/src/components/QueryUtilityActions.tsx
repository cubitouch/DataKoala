import { selectActiveSession, useStore } from '../store/useStore'
import styles from './QueryUtilityActions.module.css'

/** Secondary, tab-scoped actions shared by editor and Builder toolbars. */
interface QueryUtilityActionsProps {
  hasResults?: boolean
  onClearResults?: () => void
  onResetQuery?: () => void
}

export function QueryUtilityActions({ hasResults: hasResultsOverride, onClearResults, onResetQuery }: QueryUtilityActionsProps = {}) {
  const active = useStore(selectActiveSession)
  const clearResults = useStore((state) => state.clearActiveResults)
  const resetQuery = useStore((state) => state.resetActiveQuery)
  const defaultHasResults = Boolean(active.result || active.queryError || active.explainText
    || active.sqlResultFilters.some((filter) => filter.execution !== 'query')
    || active.builderResultFilters.some((filter) => filter.execution !== 'query'))

  return <div className={`query-utility-actions ${styles.root}`} aria-label="Query utilities">
    <button type="button" className="btn ghost" onClick={() => {
      if (window.confirm(`Reset ${active.title} to a fresh query?`)) (onResetQuery ?? resetQuery)()
    }} title="Reset the current tab's query and Builder state.">Reset query</button>
    <button type="button" className="btn ghost" onClick={onClearResults ?? clearResults} disabled={!(hasResultsOverride ?? defaultHasResults)}
      title="Clear the current result without changing the query.">Clear results</button>
  </div>
}
