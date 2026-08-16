import { useEffect, useMemo, useState } from 'react'
import { selectActiveSession, useStore, type QueryMode } from '../store/useStore'
import { isTimeType, type QueryResult } from '@shared/types'
import { resultToCsv } from '../lib/data'
import { api } from '../lib/api'
import { resultFilterDemotion, type FilteredQueryResult, type ResultFilter } from '../lib/resultFilters'
import { isBuilderFilterPromotable } from '../lib/builderSql'
import { CellFilterMenu } from './result-filters/CellFilterMenu'
import { ResultFilterBar } from './result-filters/ResultFilterBar'
import { isJsonColumnType, mayContainJsonDocument } from '../lib/jsonCell'
import { JsonCellExplorer } from './results/JsonCellExplorer'
import styles from './ResultsTable.module.css'

type SortDir = 'asc' | 'desc' | null

function renderCell(v: unknown): { text: string; cls: string } {
  if (v === null || v === undefined) return { text: '␀', cls: styles.null }
  if (v instanceof Date) return { text: v.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ''), cls: styles.time }
  if (typeof v === 'boolean') return { text: v ? 'true' : 'false', cls: '' }
  if (typeof v === 'object') return { text: JSON.stringify(v), cls: '' }
  return { text: String(v), cls: '' }
}

export function ResultsTable({ mode, rawResult: result, filteredResult, activeFilters, resultRevision = 0 }: {
  mode: QueryMode
  rawResult: QueryResult | null
  filteredResult: FilteredQueryResult | null
  activeFilters: ResultFilter[]
  resultRevision?: number
}) {
  const tabId = useStore((s) => s.activeTabId)
  const error = useStore((s) => selectActiveSession(s).queryError)
  const running = useStore((s) => selectActiveSession(s).running)
  const addResultFilter = useStore((s) => s.addResultFilter)
  const removeResultFilter = useStore((s) => s.removeResultFilter)
  const clearResultFilters = useStore((s) => s.clearResultFilters)
  const setResultFilterExecution = useStore((s) => s.setResultFilterExecution)
  const builder = useStore((s) => selectActiveSession(s).builder)

  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [filter, setFilter] = useState('')
  const [jsonTarget, setJsonTarget] = useState<{ resultRevision: number; rowIndex: number; columnKey: string } | null>(null)

  useEffect(() => { setJsonTarget(null) }, [mode, resultRevision, result])

  const rows = useMemo(() => {
    if (!filteredResult || !result) return []
    let r = filteredResult.rows
    if (filter.trim()) {
      const f = filter.toLowerCase()
      r = r.filter((row) => result.columns.some((c) => String(row[c.name] ?? '').toLowerCase().includes(f)))
    }
    if (sortCol && sortDir) {
      r = [...r].sort((a, b) => {
        const av = a[sortCol]
        const bv = b[sortCol]
        if (av === null || av === undefined) return 1
        if (bv === null || bv === undefined) return -1
        if (av instanceof Date && bv instanceof Date) return av.getTime() - bv.getTime()
        if (typeof av === 'number' && typeof bv === 'number') return av - bv
        return String(av).localeCompare(String(bv), undefined, { numeric: true })
      })
      if (sortDir === 'desc') r.reverse()
    }
    return r
  }, [result, filteredResult, filter, sortCol, sortDir])

  const toggleSort = (col: string) => {
    if (sortCol !== col) {
      setSortCol(col)
      setSortDir('asc')
    } else if (sortDir === 'asc') setSortDir('desc')
    else if (sortDir === 'desc') {
      setSortCol(null)
      setSortDir(null)
    } else setSortDir('asc')
  }

  const exportCsv = async () => {
    if (!result) return
    const csv = resultToCsv({ ...result, rows, rowCount: rows.length })
    await api.export.saveText({ defaultName: 'datakoala_results.csv', content: csv })
  }

  if (running) return <div className={styles.pane} data-result-table-pane><div className={styles.empty}>Running query…</div></div>
  if (error) return <div className={styles.pane} data-result-table-pane><div className={styles.error}>{error}</div></div>
  if (!result) return <div className={styles.pane} data-result-table-pane><div className={styles.empty}>Run a query to see results.</div></div>

  return (
    <div className={styles.pane} data-result-table-pane>
      <div className={styles.toolbar} data-result-toolbar>
        <span className={styles.stats}>
          {activeFilters.length || filter.trim() ? `${rows.length} of ${result.rowCount}` : result.rowCount} rows · {result.columns.length} cols · {result.durationMs} ms
        </span>
        <input className={styles.filterInput} placeholder="filter rows…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className={styles.spacer} />
        <button className="btn ghost" onClick={exportCsv}>Export CSV</button>
      </div>
      <ResultFilterBar
        filters={activeFilters}
        onRemove={(id) => removeResultFilter(mode, id, tabId)}
        onClear={() => clearResultFilters(mode, tabId)}
        onToggleExecution={mode === 'builder' ? (id) => {
          const target = activeFilters.find((item) => item.id === id)
          if (target) setResultFilterExecution(mode, id, target.execution === 'query' ? 'client' : 'query', tabId)
        } : undefined}
        canPromote={mode === 'builder' ? (target) => isBuilderFilterPromotable(target, builder) : undefined}
        canDemote={mode === 'builder' ? (target) => resultFilterDemotion(target, result.columns.map((column) => column.name)) : undefined}
      />
      <div className={styles.scroll}>
        {result.rows.length === 0 ? <div className={styles.empty}>Query returned no rows.</div> : rows.length === 0 ? <div className={styles.empty}>
          {activeFilters.length ? 'No rows match the active filters.' : 'No rows match the row search.'}
        </div> : <table className={styles.table}>
          <thead>
            <tr>
              {result.columns.map((c) => (
                <th key={c.name} onClick={() => toggleSort(c.name)}>
                  {c.name} {sortCol === c.name ? (sortDir === 'asc' ? '▲' : sortDir === 'desc' ? '▼' : '') : ''}
                  <span className={styles.timeHint}>
                    {isTimeType(c.dataTypeName) ? '⏱' : ''}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 1000).map((row, i) => (
              <tr key={i}>
                {result.columns.map((c) => {
                  const cell = renderCell(row[c.name])
                  return (
                    <td key={c.name} className={cell.cls} title={cell.text} data-result-cell>
                      <span className={styles.cellValue}>{cell.text}</span>
                      <div className={styles.cellActions}>
                        <CellFilterMenu column={c.name} value={row[c.name]} nativeType={c.nativeType ?? c.dataTypeName} onAdd={(newFilter) => addResultFilter(mode, newFilter, tabId)} />
                        {mode === 'sql' && row[c.name] != null && (isJsonColumnType(c) || mayContainJsonDocument(row[c.name])) && <JsonCellExplorer
                          columnLabel={c.name}
                          rowNumber={i + 1}
                          value={row[c.name]}
                          open={jsonTarget?.resultRevision === resultRevision && jsonTarget.rowIndex === i && jsonTarget.columnKey === c.name}
                          onOpenChange={(open) => setJsonTarget(open ? { resultRevision, rowIndex: i, columnKey: c.name } : null)}
                          invalidationKey={`${mode}:${resultRevision}:${i}:${c.name}`}
                        />}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>}
        {rows.length > 1000 && (
          <div className={styles.capNotice}>
            Showing first 1000 of {rows.length} rows. Refine the query or use Export CSV for all.
          </div>
        )}
      </div>
    </div>
  )
}
