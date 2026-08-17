import { selectActiveSession, useStore } from '../store/useStore'
import styles from './QueryUtilityActions.module.css'

/** Secondary, tab-scoped actions shared by editor and Builder toolbars. */
export function QueryUtilityActions() {
  const active = useStore(selectActiveSession)
  const clearResults = useStore((state) => state.clearActiveResults)
  const resetQuery = useStore((state) => state.resetActiveQuery)
  const hasResults = Boolean(active.result || active.queryError || active.explainText
    || active.sqlResultFilters.some((filter) => filter.execution !== 'query')
    || active.builderResultFilters.some((filter) => filter.execution !== 'query'))

  return <div className={`query-utility-actions ${styles.root}`} aria-label="Query utilities">
    <button className="btn ghost" onClick={() => {
      if (window.confirm(`Reset ${active.title} to a fresh query?`)) resetQuery()
    }} title="Reset the current tab's query and Builder state.">Reset query</button>
    <button className="btn ghost" onClick={clearResults} disabled={!hasResults}
      title="Clear the current result without changing the query.">Clear results</button>
  </div>
}
