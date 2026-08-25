import { TextInput } from './ui/TextInput'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

const ROW_HEIGHT = 28
const ROW_OVERSCAN = 8

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
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)
  const [jsonTarget, setJsonTarget] = useState<{ resultRevision: number; rowId: number; columnKey: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowIds = useRef(new WeakMap<object, number>())
  const nextRowId = useRef(1)

  const getRowId = (row: QueryResult['rows'][number]) => {
    const key = row as object
    const existing = rowIds.current.get(key)
    if (existing !== undefined) return existing
    const id = nextRowId.current++
    rowIds.current.set(key, id)
    return id
  }

  useEffect(() => {
    setJsonTarget(null)
    setScrollTop(0)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [mode, resultRevision, result])
  useEffect(() => { setJsonTarget(null) }, [sortCol, sortDir, filter, activeFilters])

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const updateHeight = () => setViewportHeight(Math.max(element.clientHeight, ROW_HEIGHT))
    updateHeight()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [result])

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

  const visibleStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - ROW_OVERSCAN)
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + ROW_OVERSCAN * 2
  const visibleEnd = Math.min(rows.length, visibleStart + visibleCount)
  const visibleRows = rows.slice(visibleStart, visibleEnd)
  const topSpacerHeight = visibleStart * ROW_HEIGHT
  const bottomSpacerHeight = Math.max(0, (rows.length - visibleEnd) * ROW_HEIGHT)

  useEffect(() => {
    setJsonTarget(null)
    setScrollTop(0)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [filter, sortCol, sortDir])

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
  if (error) return <div className={styles.pane} data-result-table-pane><div className={styles.error} role="alert">{error}</div></div>
  if (!result) return <div className={styles.pane} data-result-table-pane><div className={styles.empty}>Run a query to see results.</div></div>

  return (
    <div className={styles.pane} data-result-table-pane>
      <div className={styles.toolbar} data-result-toolbar>
        <span className={styles.stats}>
          {activeFilters.length || filter.trim() ? `${rows.length} of ${result.rowCount}` : result.rowCount} rows · {result.columns.length} cols · {result.durationMs} ms
        </span>
        <div className={styles.filterInput}><TextInput mode="inline" label="Filter rows" placeholder="filter rows…" value={filter} onValueChange={setFilter} /></div>
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
      <div className={styles.scroll} ref={scrollRef} data-result-scroll onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
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
            {topSpacerHeight > 0 && <tr aria-hidden="true"><td className={styles.virtualSpacer} colSpan={result.columns.length} style={{ height: topSpacerHeight }} /></tr>}
            {visibleRows.map((row, visibleIndex) => {
              const rowIndex = visibleStart + visibleIndex
              const rowId = getRowId(row)
              return <tr key={rowId} className={styles.dataRow} data-result-row-index={rowIndex}>
                {result.columns.map((c) => {
                  const cell = renderCell(row[c.name])
                  return (
                    <td key={c.name} className={cell.cls} title={cell.text} data-result-cell>
                      <span className={styles.cellValue}>{cell.text}</span>
                      <div className={styles.cellActions}>
                        <CellFilterMenu column={c.name} value={row[c.name]} nativeType={c.nativeType ?? c.dataTypeName} onAdd={(newFilter) => addResultFilter(mode, newFilter, tabId)} />
                        {mode === 'sql' && row[c.name] != null && (isJsonColumnType(c) || mayContainJsonDocument(row[c.name])) && <JsonCellExplorer
                          columnLabel={c.name}
                          rowNumber={rowIndex + 1}
                          value={row[c.name]}
                          open={jsonTarget?.resultRevision === resultRevision && jsonTarget.rowId === rowId && jsonTarget.columnKey === c.name}
                          onOpenChange={(open) => setJsonTarget(open ? { resultRevision, rowId, columnKey: c.name } : null)}
                          invalidationKey={`${mode}:${resultRevision}:${rowId}:${c.name}`}
                        />}
                      </div>
                    </td>
                  )
                })}
              </tr>
            })}
            {bottomSpacerHeight > 0 && <tr aria-hidden="true"><td className={styles.virtualSpacer} colSpan={result.columns.length} style={{ height: bottomSpacerHeight }} /></tr>}
          </tbody>
        </table>}
      </div>
    </div>
  )
}
